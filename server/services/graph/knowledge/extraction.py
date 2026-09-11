from __future__ import annotations

import json
import logging
import re
from typing import Any

from schemas.knowledge import (
    KgClause,
    KgCondition,
    KgDefinedTerm,
    KgEdge,
    KgObligation,
    KgParty,
    KgProhibition,
    KgReference,
    KgRight,
    KgValue,
    KnowledgeGraph,
    _KgDeontic,
)
from services.graph.knowledge.evidence import anchor_to_evidence
from services.graph.knowledge.ontology import (
    DEONTIC_COLLECTION_BY_KIND,
    DEONTIC_ID_PREFIX,
    RELATION_TYPES,
)
from services.graph.knowledge.prompts import SYSTEM_PROMPT, build_user_prompt
from services.llm.base import LLMProvider

logger = logging.getLogger(__name__)

CHUNK_CHAR_BUDGET = 5000

_DEONTIC_MODEL_BY_KIND: dict[str, type[_KgDeontic]] = {
    "obligation": KgObligation,
    "right": KgRight,
    "prohibition": KgProhibition,
}
VALID_RELATION_TYPES = set(RELATION_TYPES)

# "Section 3.1" -> "3.1", so a reference matches a clause by bare numbering.
_REF_NUMBER = re.compile(r"\d+(?:[.\-]\d+)*")


def _safe_json_loads(text: str) -> dict[str, Any]:
    if not text:
        return {}
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned).strip()
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass
    # Fallback: grab the outermost {...} block.
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            logger.warning("KG extraction: could not parse LLM JSON block")
    return {}


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip().lower()


def _ref_number(ref: str) -> str | None:
    """Bare numbering of a clause reference, so "Section 3.1" matches "3.1"."""
    match = _REF_NUMBER.search(ref or "")
    return match.group(0).replace("-", ".") if match else None


def _ref_lookup_keys(ref: str) -> list[str]:
    """Keys a clause reference can be found under, most specific first."""
    keys: list[str] = []
    number = _ref_number(ref)
    if number:
        keys.append(f"num:{number}")
    normalized = _normalize(ref)
    if normalized:
        keys.append(f"ref:{normalized}")
    return keys


def _chunk_paragraphs(indexed: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group indexed paragraphs into char-budget-bounded chunks."""
    chunks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    size = 0
    for row in indexed:
        row_len = len(row["text"]) + 20
        if current and size + row_len > CHUNK_CHAR_BUDGET:
            chunks.append(current)
            current = []
            size = 0
        current.append(row)
        size += row_len
    if current:
        chunks.append(current)
    return chunks


class _GraphAccumulator:
    def __init__(self) -> None:
        self.parties: dict[str, KgParty] = {}  # global_id -> party
        self._party_key_to_id: dict[str, str] = {}  # normalized name/alias -> global id
        self.clauses: dict[str, KgClause] = {}  # global_id -> clause
        self._clause_key_to_id: dict[str, str] = {}
        # Resolution-only index (ref + bare numbering) for cross-chunk targets.
        self._clause_lookup: dict[str, str] = {}
        self.obligations: list[KgObligation] = []
        self.rights: list[KgRight] = []
        self.prohibitions: list[KgProhibition] = []
        self._deontic_list_by_kind: dict[str, list] = {
            "obligation": self.obligations,
            "right": self.rights,
            "prohibition": self.prohibitions,
        }
        self._deontic_keys: dict[str, str] = {}
        self._deontic_seq_by_prefix: dict[str, int] = {}
        self.definedTerms: dict[str, KgDefinedTerm] = {}
        self._term_key_to_id: dict[str, str] = {}
        self.conditions: list[KgCondition] = []
        self._condition_keys: set[str] = set()
        self.references: list[KgReference] = []
        self._reference_keys: set[str] = set()
        self.values: list[KgValue] = []
        self._value_keys: set[str] = set()
        # (rtype, source id, target string, evidence, paragraph ids)
        self._pending_relations: list[tuple[str, str, str, str, list[str]]] = []
        self._party_seq = 0
        self._clause_seq = 0
        self._term_seq = 0
        self._condition_seq = 0
        self._reference_seq = 0
        self._value_seq = 0

    # -- parties ---------------------------------------------------------- #
    def _party_keys(self, name: str, aliases: list[str]) -> list[str]:
        keys = [_normalize(name)]
        keys += [_normalize(a) for a in aliases]
        return [k for k in keys if k]

    def add_party(self, raw: dict[str, Any], paragraph_ids: list[str]) -> str | None:
        name = str(raw.get("name") or "").strip()
        aliases = [str(a).strip() for a in (raw.get("aliases") or []) if str(a).strip()]
        keys = self._party_keys(name, aliases)
        if not keys:
            return None

        existing_id = next((self._party_key_to_id[k] for k in keys if k in self._party_key_to_id), None)
        if existing_id is None:
            self._party_seq += 1
            existing_id = f"party-{self._party_seq}"
            self.parties[existing_id] = KgParty(
                id=existing_id,
                name=name or aliases[0],
                role=str(raw.get("role") or "").strip(),
                aliases=[],
                paragraphIds=[],
            )

        party = self.parties[existing_id]
        alias_pool = {*party.aliases, *aliases}
        if name and _normalize(name) != _normalize(party.name):
            alias_pool.add(name)
        party.aliases = sorted(a for a in alias_pool if _normalize(a) != _normalize(party.name))
        if not party.role and raw.get("role"):
            party.role = str(raw["role"]).strip()
        party.paragraphIds = sorted({*party.paragraphIds, *paragraph_ids})

        for k in keys:
            self._party_key_to_id.setdefault(k, existing_id)
        return existing_id

    # -- clauses ---------------------------------------------------------- #
    def add_clause(self, raw: dict[str, Any], paragraph_ids: list[str]) -> str | None:
        ref = raw.get("ref")
        ref = str(ref).strip() if ref not in (None, "", "null") else None
        heading = str(raw.get("heading") or "").strip()

        if ref:
            key = f"ref:{_normalize(ref)}"
        elif heading:
            key = f"head:{_normalize(heading)}"
        elif paragraph_ids:
            key = f"pid:{min(paragraph_ids)}"
        else:
            return None

        existing_id = self._clause_key_to_id.get(key)
        if existing_id is None:
            self._clause_seq += 1
            existing_id = f"clause-{self._clause_seq}"
            self.clauses[existing_id] = KgClause(id=existing_id, ref=ref, heading=heading, paragraphIds=[])
            self._clause_key_to_id[key] = existing_id

        clause = self.clauses[existing_id]
        if not clause.heading and heading:
            clause.heading = heading
        if clause.level is None:
            number = _ref_number(ref or "")
            try:
                raw_level = int(raw.get("level"))  # type: ignore[arg-type]
            except (TypeError, ValueError):
                raw_level = 0
            # Prefer the depth implied by the numbering; the model miscounts it.
            clause.level = len(number.split(".")) if number else (raw_level or None)
        clause.paragraphIds = sorted({*clause.paragraphIds, *paragraph_ids})

        if ref:
            for lookup_key in _ref_lookup_keys(ref):
                self._clause_lookup.setdefault(lookup_key, existing_id)
        if heading:
            self._clause_lookup.setdefault(f"ref:{_normalize(heading)}", existing_id)
        return existing_id

    def resolve_clause_ref(self, ref: str) -> str | None:
        """Find a clause by a reference string written anywhere in the contract."""
        for lookup_key in _ref_lookup_keys(ref):
            found = self._clause_lookup.get(lookup_key)
            if found:
                return found
        return None

    # -- defined terms ---------------------------------------------------- #
    def add_defined_term(self, raw: dict[str, Any], clause_id: str | None, paragraph_ids: list[str]) -> str | None:
        term = str(raw.get("term") or "").strip()
        key = _normalize(term)
        if not key:
            return None

        existing_id = self._term_key_to_id.get(key)
        if existing_id is None:
            self._term_seq += 1
            existing_id = f"term-{self._term_seq}"
            self.definedTerms[existing_id] = KgDefinedTerm(id=existing_id, term=term, paragraphIds=[])
            self._term_key_to_id[key] = existing_id

        entry = self.definedTerms[existing_id]
        definition = str(raw.get("definition") or "").strip()
        if definition and len(definition) > len(entry.definition):
            entry.definition = definition
        if clause_id and not entry.definedInClauseId:
            entry.definedInClauseId = clause_id
        entry.paragraphIds = sorted({*entry.paragraphIds, *paragraph_ids})
        return existing_id

    def resolve_term(self, term: str) -> str | None:
        return self._term_key_to_id.get(_normalize(term))

    # -- deontic statements (obligation / right / prohibition) ------------ #
    def add_deontic(
        self,
        *,
        kind: str,
        action: str,
        summary: str,
        text: str,
        obligor: str | None,
        beneficiary: str | None,
        clause: str | None,
        deadline: str,
        frequency: str,
        paragraph_ids: list[str],
        evidence_spans: list[str],
        evidence_verified: bool | None,
    ) -> str:
        dedup_key = "|".join([kind, _normalize(summary)[:120], obligor or "", beneficiary or ""])
        existing_id = self._deontic_keys.get(dedup_key)
        if existing_id:
            return existing_id

        prefix = DEONTIC_ID_PREFIX[kind]
        seq = self._deontic_seq_by_prefix.get(prefix, 0) + 1
        self._deontic_seq_by_prefix[prefix] = seq
        global_id = f"{prefix}-{seq}"
        self._deontic_keys[dedup_key] = global_id
        self._deontic_list_by_kind[kind].append(
            _DEONTIC_MODEL_BY_KIND[kind](
                id=global_id,
                action=action.strip(),
                summary=summary.strip(),
                text=text.strip(),
                burdenPartyId=obligor,
                benefitPartyId=beneficiary,
                clauseId=clause,
                deadline=deadline.strip(),
                frequency=frequency.strip(),
                paragraphIds=paragraph_ids,
                evidenceVerified=evidence_verified,
                evidenceSpans=evidence_spans,
            )
        )
        return global_id

    # -- conditions / references / values --------------------------------- #
    def add_condition(self, raw: dict[str, Any], gates_id: str | None, paragraph_ids: list[str]) -> None:
        trigger = str(raw.get("trigger") or "").strip()
        if not trigger:
            return
        key = f"{_normalize(trigger)[:120]}|{gates_id or ''}"
        if key in self._condition_keys:
            return
        self._condition_keys.add(key)

        self._condition_seq += 1
        self.conditions.append(
            KgCondition(
                id=f"condition-{self._condition_seq}",
                trigger=trigger,
                operator=str(raw.get("operator") or "").strip().upper(),
                gatesId=gates_id,
                paragraphIds=paragraph_ids,
            )
        )

    def add_reference(self, raw: dict[str, Any], cited_by_id: str | None, paragraph_ids: list[str]) -> None:
        name = str(raw.get("name") or "").strip()
        if not name:
            return
        citation = str(raw.get("citation") or "").strip()
        key = f"{_normalize(name)}|{_normalize(citation)}|{cited_by_id or ''}"
        if key in self._reference_keys:
            return
        self._reference_keys.add(key)

        self._reference_seq += 1
        self.references.append(
            KgReference(
                id=f"reference-{self._reference_seq}",
                name=name,
                citation=citation,
                citedById=cited_by_id,
                paragraphIds=paragraph_ids,
            )
        )

    def add_value(self, raw: dict[str, Any], quantifies_id: str | None, paragraph_ids: list[str]) -> None:
        amount = str(raw.get("amount") or "").strip()
        if not amount:
            return
        unit = str(raw.get("unit") or "").strip()
        key = f"{_normalize(amount)}|{_normalize(unit)}|{quantifies_id or ''}"
        if key in self._value_keys:
            return
        self._value_keys.add(key)

        self._value_seq += 1
        self.values.append(
            KgValue(
                id=f"value-{self._value_seq}",
                valueType=str(raw.get("valueType") or "").strip(),
                amount=amount,
                unit=unit,
                quantifiesId=quantifies_id,
                paragraphIds=paragraph_ids,
            )
        )

    # -- relations -------------------------------------------------------- #
    def add_pending_relation(
        self,
        *,
        rtype: str,
        source_id: str,
        target: str,
        evidence: str,
        paragraph_ids: list[str],
    ) -> None:
        """Queue an LLM-extracted relation; the target is resolved in build()."""
        self._pending_relations.append((rtype, source_id, target.strip(), evidence.strip(), paragraph_ids))

    def _resolve_relations(self) -> tuple[list[KgEdge], int]:
        edges: list[KgEdge] = []
        seen: set[tuple[str, str, str]] = set()
        unresolved = 0
        for rtype, source_id, target, evidence, pids in self._pending_relations:
            if not target:
                unresolved += 1
                continue
            if rtype == "uses":
                target_id = self.resolve_term(target)
            else:
                target_id = self.resolve_clause_ref(target)
            if not target_id or target_id == source_id:
                unresolved += 1
                continue
            key = (source_id, target_id, rtype)
            if key in seen:
                continue
            seen.add(key)
            edges.append(
                KgEdge(
                    source=source_id,
                    target=target_id,
                    type=rtype,  # type: ignore[arg-type]
                    evidence=evidence,
                    paragraphIds=pids,
                )
            )
        return edges, unresolved

    def _hierarchy_edges(self) -> list[KgEdge]:
        """IS_PART_OF links inferred from clause numbering ("3.2.1" is under "3.2")."""
        by_number: dict[str, str] = {}
        for clause in self.clauses.values():
            number = _ref_number(clause.ref or "")
            if number:
                by_number.setdefault(number, clause.id)

        edges: list[KgEdge] = []
        for number, clause_id in by_number.items():
            parts = number.split(".")
            # Walk up until an ancestor that actually exists as a clause is found.
            for cut in range(len(parts) - 1, 0, -1):
                parent_id = by_number.get(".".join(parts[:cut]))
                if parent_id and parent_id != clause_id:
                    edges.append(KgEdge(source=clause_id, target=parent_id, type="is_part_of"))
                    break
        return edges

    def build(self) -> KnowledgeGraph:
        edges = _derive_edges(
            obligations=self.obligations,
            rights=self.rights,
            prohibitions=self.prohibitions,
            defined_terms=list(self.definedTerms.values()),
            conditions=self.conditions,
            references=self.references,
            values=self.values,
        )
        edges += self._hierarchy_edges()

        resolved, unresolved = self._resolve_relations()
        edges += resolved
        logger.info(
            "KG extraction: %d relation(s) resolved, %d dropped (unknown target)",
            len(resolved),
            unresolved,
        )

        return KnowledgeGraph(
            parties=list(self.parties.values()),
            clauses=list(self.clauses.values()),
            definedTerms=list(self.definedTerms.values()),
            obligations=self.obligations,
            rights=self.rights,
            prohibitions=self.prohibitions,
            conditions=self.conditions,
            references=self.references,
            values=self.values,
            edges=edges,
        )


def _derive_edges(
    *,
    obligations: list[KgObligation],
    rights: list[KgRight],
    prohibitions: list[KgProhibition],
    defined_terms: list[KgDefinedTerm],
    conditions: list[KgCondition],
    references: list[KgReference],
    values: list[KgValue],
) -> list[KgEdge]:

    seen: set[tuple[str, str, str]] = set()
    edges: list[KgEdge] = []

    def _add(source: str | None, target: str | None, etype: str) -> None:
        if not source or not target or source == target:
            return
        key = (source, target, etype)
        if key in seen:
            return
        seen.add(key)
        edges.append(KgEdge(source=source, target=target, type=etype))  # type: ignore[arg-type]

    for right in rights:
        _add(right.id, right.clauseId, "is_part_of")
        _add(right.id, right.benefitPartyId, "grants_right_to")
    for statement in (*obligations, *prohibitions):
        _add(statement.id, statement.clauseId, "is_part_of")
        _add(statement.id, statement.burdenPartyId, "assigns_obligation_to")
    for term in defined_terms:
        _add(term.definedInClauseId, term.id, "defines")
    for condition in conditions:
        _add(condition.id, condition.gatesId, "is_part_of")
    for reference in references:
        _add(reference.id, reference.citedById, "is_part_of")
    for value in values:
        _add(value.id, value.quantifiesId, "is_part_of")
    return edges


def build_knowledge_graph(
    paragraphs_data: list[dict[str, Any]],
    provider: LLMProvider,
    *,
    temperature: float = 0.1,
) -> KnowledgeGraph:

    indexed: list[dict[str, Any]] = []
    index_to_id: dict[int, str] = {}
    paragraph_texts: list[tuple[str, str]] = []
    for i, row in enumerate(paragraphs_data):
        text = str(row.get("text") or "").strip()
        if not text:
            continue
        real_id = str(row.get("id"))
        indexed.append({"i": i, "text": text})
        index_to_id[i] = real_id
        paragraph_texts.append((real_id, text))

    logger.info("KG extraction: %d paragraphs", len(indexed))
    accumulator = _GraphAccumulator()
    chunks = _chunk_paragraphs(indexed)
    logger.info("KG extraction: %d chunk(s)", len(chunks))

    for chunk_no, chunk in enumerate(chunks, start=1):
        paragraphs_json = json.dumps(chunk, ensure_ascii=False)
        user_prompt = build_user_prompt(paragraphs_json)
        try:
            raw = provider.generate(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=temperature,
            )
        except Exception:
            logger.exception("KG extraction: LLM call failed on chunk %d", chunk_no)
            continue

        payload = _safe_json_loads(raw)
        if not payload:
            logger.warning("KG extraction: empty payload on chunk %d", chunk_no)
            continue

        _ingest_chunk(payload, index_to_id, paragraph_texts, accumulator)

    return accumulator.build()


def _paragraph_ids_from(raw_paragraphs: Any, index_to_id: dict[int, str]) -> list[str]:
    ids: list[str] = []
    for value in raw_paragraphs or []:
        try:
            idx = int(value)
        except (TypeError, ValueError):
            continue
        real_id = index_to_id.get(idx)
        if real_id:
            ids.append(real_id)
    return sorted(set(ids))


def _ingest_chunk(
    payload: dict[str, Any],
    index_to_id: dict[int, str],
    paragraph_texts: list[tuple[str, str]],
    accumulator: _GraphAccumulator,
) -> None:

    local_party_to_global: dict[str, str] = {}
    for raw_party in payload.get("parties") or []:
        local_id = str(raw_party.get("id") or "").strip()
        pids = _paragraph_ids_from(raw_party.get("paragraphs"), index_to_id)
        global_id = accumulator.add_party(raw_party, pids)
        if local_id and global_id:
            local_party_to_global[local_id] = global_id

    local_clause_to_global: dict[str, str] = {}
    for raw_clause in payload.get("clauses") or []:
        local_id = str(raw_clause.get("id") or "").strip()
        pids = _paragraph_ids_from(raw_clause.get("paragraphs"), index_to_id)
        global_id = accumulator.add_clause(raw_clause, pids)
        if local_id and global_id:
            local_clause_to_global[local_id] = global_id

    def _resolve(local_ref: Any, mapping: dict[str, str]) -> str | None:
        key = str(local_ref or "").strip()
        return mapping.get(key)

    local_term_to_global: dict[str, str] = {}
    for raw_term in payload.get("definedTerms") or []:
        local_id = str(raw_term.get("id") or "").strip()
        pids, _, _ = anchor_to_evidence(
            str(raw_term.get("definition") or ""),
            _paragraph_ids_from(raw_term.get("paragraphs"), index_to_id),
            paragraph_texts,
        )
        global_id = accumulator.add_defined_term(raw_term, _resolve(raw_term.get("definedIn"), local_clause_to_global), pids)
        if local_id and global_id:
            local_term_to_global[local_id] = global_id

    local_deontic_to_global: dict[str, str] = {}
    for kind, collection_key in DEONTIC_COLLECTION_BY_KIND.items():
        for raw in payload.get(collection_key) or []:
            summary = str(raw.get("summary") or "").strip()
            if not summary:
                continue
            local_id = str(raw.get("id") or "").strip()
            pids, spans, verified = anchor_to_evidence(
                str(raw.get("text") or ""),
                _paragraph_ids_from(raw.get("paragraphs"), index_to_id),
                paragraph_texts,
            )
            global_id = accumulator.add_deontic(
                kind=kind,
                action=str(raw.get("action") or ""),
                summary=summary,
                text=str(raw.get("text") or ""),
                obligor=_resolve(raw.get("obligor"), local_party_to_global),
                beneficiary=_resolve(raw.get("beneficiary"), local_party_to_global),
                clause=_resolve(raw.get("clause"), local_clause_to_global),
                deadline=str(raw.get("deadline") or ""),
                frequency=str(raw.get("frequency") or ""),
                paragraph_ids=pids,
                evidence_spans=spans,
                evidence_verified=verified,
            )
            if local_id:
                local_deontic_to_global[local_id] = global_id

    def _resolve_attachment(local_ref: Any) -> str | None:
        return _resolve(local_ref, local_deontic_to_global) or _resolve(local_ref, local_clause_to_global)

    for raw_condition in payload.get("conditions") or []:
        condition_pids, _, _ = anchor_to_evidence(
            str(raw_condition.get("trigger") or ""),
            _paragraph_ids_from(raw_condition.get("paragraphs"), index_to_id),
            paragraph_texts,
        )
        accumulator.add_condition(
            raw_condition,
            _resolve_attachment(raw_condition.get("gates")),
            condition_pids,
        )

    for raw_reference in payload.get("references") or []:
        accumulator.add_reference(
            raw_reference,
            _resolve_attachment(raw_reference.get("citedBy")),
            _paragraph_ids_from(raw_reference.get("paragraphs"), index_to_id),
        )

    for raw_value in payload.get("values") or []:
        accumulator.add_value(
            raw_value,
            _resolve_attachment(raw_value.get("quantifies")),
            _paragraph_ids_from(raw_value.get("paragraphs"), index_to_id),
        )

    for raw_relation in payload.get("relations") or []:
        rtype = _normalize(str(raw_relation.get("type"))).replace(" ", "_")
        if rtype not in VALID_RELATION_TYPES:
            continue
        source_id = _resolve_attachment(raw_relation.get("source"))
        target = str(raw_relation.get("target") or "").strip()
        if not source_id or not target:
            continue
        accumulator.add_pending_relation(
            rtype=rtype,
            source_id=source_id,
            target=target,
            evidence=str(raw_relation.get("evidence") or ""),
            paragraph_ids=_paragraph_ids_from(raw_relation.get("paragraphs"), index_to_id),
        )
