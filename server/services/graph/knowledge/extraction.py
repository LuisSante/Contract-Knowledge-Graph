from __future__ import annotations

import json
import logging
import re
from typing import Any

from schemas.knowledge import (
    KgClause,
    KgEdge,
    KgParty,
    KgProvision,
    KnowledgeGraph,
)
from services.graph.knowledge.prompts import SYSTEM_PROMPT, build_user_prompt
from services.llm.base import LLMProvider

logger = logging.getLogger(__name__)

CHUNK_CHAR_BUDGET = 9000
VALID_PROVISION_TYPES = {"obligation", "right", "prohibition"}


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
        self.provisions: list[KgProvision] = []
        self._provision_keys: set[str] = set()
        self._party_seq = 0
        self._clause_seq = 0
        self._provision_seq = 0

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
        # Merge aliases + role + provenance.
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
            key = f"pid:{sorted(paragraph_ids)[0]}"
        else:
            return None

        existing_id = self._clause_key_to_id.get(key)
        if existing_id is None:
            self._clause_seq += 1
            existing_id = f"clause-{self._clause_seq}"
            self.clauses[existing_id] = KgClause(
                id=existing_id, ref=ref, heading=heading, paragraphIds=[]
            )
            self._clause_key_to_id[key] = existing_id

        clause = self.clauses[existing_id]
        if not clause.heading and heading:
            clause.heading = heading
        clause.paragraphIds = sorted({*clause.paragraphIds, *paragraph_ids})
        return existing_id

    # -- provisions ------------------------------------------------------- #
    def add_provision(
        self,
        *,
        ptype: str,
        summary: str,
        text: str,
        obligor: str | None,
        beneficiary: str | None,
        clause: str | None,
        paragraph_ids: list[str],
    ) -> None:
        dedup_key = "|".join(
            [ptype, _normalize(summary)[:120], obligor or "", beneficiary or ""]
        )
        if dedup_key in self._provision_keys:
            return
        self._provision_keys.add(dedup_key)

        self._provision_seq += 1
        self.provisions.append(
            KgProvision(
                id=f"prov-{self._provision_seq}",
                type=ptype,  # type: ignore[arg-type]
                summary=summary.strip(),
                text=text.strip(),
                obligorPartyId=obligor,
                beneficiaryPartyId=beneficiary,
                clauseId=clause,
                paragraphIds=paragraph_ids,
            )
        )

    def build(self) -> KnowledgeGraph:
        edges = _derive_edges(self.provisions)
        return KnowledgeGraph(
            parties=list(self.parties.values()),
            clauses=list(self.clauses.values()),
            provisions=self.provisions,
            edges=edges,
        )


def _derive_edges(provisions: list[KgProvision]) -> list[KgEdge]:
    seen: set[tuple[str, str, str]] = set()
    edges: list[KgEdge] = []

    def _add(source: str, target: str, etype: str) -> None:
        key = (source, target, etype)
        if key in seen:
            return
        seen.add(key)
        edges.append(KgEdge(source=source, target=target, type=etype))  # type: ignore[arg-type]

    for prov in provisions:
        if prov.clauseId:
            _add(prov.clauseId, prov.id, "introduces")
        if prov.obligorPartyId:
            _add(prov.id, prov.obligorPartyId, "burdens")
        if prov.beneficiaryPartyId:
            _add(prov.id, prov.beneficiaryPartyId, "benefits")
    return edges


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #
def build_knowledge_graph(
    paragraphs_data: list[dict[str, Any]],
    provider: LLMProvider,
    *,
    temperature: float = 0.1,
) -> KnowledgeGraph:
    """Extract a party-centric deontic knowledge graph from parsed paragraphs."""
    # Assign a stable sequential index per paragraph and remember its real id.
    indexed: list[dict[str, Any]] = []
    index_to_id: dict[int, str] = {}
    for i, row in enumerate(paragraphs_data):
        text = str(row.get("text") or "").strip()
        if not text:
            continue
        real_id = str(row.get("id"))
        indexed.append({"i": i, "text": text})
        index_to_id[i] = real_id

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

        _ingest_chunk(payload, index_to_id, accumulator)

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
    accumulator: _GraphAccumulator,
) -> None:
    # Map this chunk's local ids (P1/C1) to resolved global ids.
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

    for raw_prov in payload.get("provisions") or []:
        ptype = _normalize(str(raw_prov.get("type")))
        if ptype not in VALID_PROVISION_TYPES:
            continue
        summary = str(raw_prov.get("summary") or "").strip()
        if not summary:
            continue

        def _resolve(local_ref: Any, mapping: dict[str, str]) -> str | None:
            key = str(local_ref or "").strip()
            return mapping.get(key)

        accumulator.add_provision(
            ptype=ptype,
            summary=summary,
            text=str(raw_prov.get("text") or ""),
            obligor=_resolve(raw_prov.get("obligor"), local_party_to_global),
            beneficiary=_resolve(raw_prov.get("beneficiary"), local_party_to_global),
            clause=_resolve(raw_prov.get("clause"), local_clause_to_global),
            paragraph_ids=_paragraph_ids_from(raw_prov.get("paragraphs"), index_to_id),
        )
