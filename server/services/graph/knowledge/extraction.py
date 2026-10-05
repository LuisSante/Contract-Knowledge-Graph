"""Contract -> knowledge graph, in two passes.

The ids exist before anything is extracted. The clauses come from the paragraph file's
outline, which the numbering decides; the parties and the defined terms come from one
reading of the whole contract. Every block call after that can only point at those ids,
so assembling the blocks never has to guess, from how a name or a number was spelled,
which nodes are the same.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
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
    block_json_schema,
    skeleton_json_schema,
)
from services.graph.knowledge.prompts import (
    BLOCK_SYSTEM_PROMPT,
    SKELETON_SYSTEM_PROMPT,
    build_block_prompt,
    build_skeleton_prompt,
    render_skeleton,
)
from services.llm.base import LLMOutputTruncated, LLMProvider

logger = logging.getLogger(__name__)

BLOCK_CHAR_BUDGET = 5000
# The schema makes a malformed reply rare; one more try covers a bad draw without paying
# three times for a call that fails for a reason a retry cannot fix.
EXTRACTION_ATTEMPTS = 2
# D2: each block reads the skeleton plus its own surroundings. D1: the whole contract.
DESIGNS = ("D2", "D1")

_DEONTIC_MODEL_BY_KIND: dict[str, type[_KgDeontic]] = {
    "obligation": KgObligation,
    "right": KgRight,
    "prohibition": KgProhibition,
}
_RELATIONS_TO_TERMS = {"uses"}


class ExtractionIncomplete(RuntimeError):
    """Some blocks produced nothing. A graph missing a stretch of the contract reads exactly
    like a contract that says nothing there, so it is not returned as if it were whole: the
    caller gets it here and decides."""

    def __init__(self, failed: list[dict[str, Any]], graph: KnowledgeGraph):
        self.failed = failed
        self.graph = graph
        spans = ", ".join(f"block {f['block']} (paragraphs {f['first']}-{f['last']})" for f in failed)
        super().__init__(f"KG extraction lost {len(failed)} block(s): {spans}")


# --------------------------------------------------------------------------- #
# Outline — the clauses, read off the numbering                               #
# --------------------------------------------------------------------------- #


@dataclass
class Section:
    ref: str
    level: int
    start: int  # index of the paragraph that opens it
    preview: str
    parent: Section | None = None
    children: list[Section] = field(default_factory=list)
    clause_id: str = ""
    end: int = 0  # one past its last paragraph, its subsections included

    def own_end(self) -> int:
        """Where its own text stops: its first subsection, or its end."""
        return self.children[0].start if self.children else self.end


class Outline:
    """The clause tree of the paragraph file, which `build_clause_tree` derives from the
    numbering alone: the same text always gives the same clauses."""

    def __init__(self, tree: list[dict[str, Any]] | None, paragraphs: list[dict[str, Any]]):
        index_of = {str(p.get("id")): i for i, p in enumerate(paragraphs)}
        self.size = len(paragraphs)
        self.sections: list[Section] = []

        def walk(nodes: list[dict[str, Any]], parent: Section | None) -> None:
            for node in nodes:
                start = index_of.get(str(node.get("paragraphId")))
                if start is None:
                    continue
                ref = str(node.get("ref") or "")
                section = Section(
                    ref=ref,
                    level=int(node.get("level") or ref.count(".") + 1),
                    start=start,
                    preview=str(node.get("heading") or ""),
                    parent=parent,
                )
                self.sections.append(section)
                if parent:
                    parent.children.append(section)
                walk(node.get("children") or [], section)

        walk(tree or [], None)
        self.sections.sort(key=lambda s: s.start)
        for n, section in enumerate(self.sections, start=1):
            section.clause_id = f"clause-{n}"
            section.children.sort(key=lambda s: s.start)
        for n, section in enumerate(self.sections):
            later = (t for t in self.sections[n + 1 :] if not _descends_from(t, section))
            section.end = next((t.start for t in later), self.size)
        self.by_id = {s.clause_id: s for s in self.sections}
        self.top = [s for s in self.sections if s.parent is None]

    def section_at(self, index: int) -> Section | None:
        """The innermost clause a paragraph belongs to; None before the first clause, which
        is where the title, the parties and the recitals are."""
        found = None
        for section in self.sections:
            if section.start > index:
                break
            found = section
        return found

    def entries(self, headings: dict[str, str] | None = None) -> list[tuple[str, str, str]]:
        """(id, number, heading or first words) per clause."""
        return [(s.clause_id, s.ref, (headings or {}).get(s.clause_id) or s.preview) for s in self.sections]


def _descends_from(section: Section, ancestor: Section) -> bool:
    parent = section.parent
    while parent is not None:
        if parent is ancestor:
            return True
        parent = parent.parent
    return False


# --------------------------------------------------------------------------- #
# Blocks — what each call extracts, and what it reads around it               #
# --------------------------------------------------------------------------- #


@dataclass
class Block:
    extract: list[int]
    context: list[int]


def plan_blocks(outline: Outline, texts: dict[int, str], budget: int = BLOCK_CHAR_BUDGET) -> list[Block]:
    """Consecutive clauses packed up to the budget. A clause too big for one block is split
    into its subclauses, and its own opening paragraphs ride with the first of them: a
    list is never cut off from the sentence that says who it binds."""

    def present(start: int, stop: int) -> list[int]:
        return [i for i in range(start, stop) if i in texts]

    def size(indices: list[int]) -> int:
        return sum(len(texts[i]) + 20 for i in indices)

    pieces: list[list[int]] = []
    pending: list[int] = []

    def emit(indices: list[int]) -> None:
        nonlocal pending
        if pending or indices:
            pieces.append(pending + indices)
        pending = []

    def add(section: Section) -> None:
        nonlocal pending
        whole = present(section.start, section.end)
        if size(whole) <= budget or len(whole) <= 1:
            emit(whole)
        elif section.children:
            pending += present(section.start, section.own_end())
            for child in section.children:
                add(child)
        else:
            for index in whole:
                emit([index])

    first = outline.sections[0].start if outline.sections else outline.size
    preamble = present(0, first)
    if size(preamble) <= budget:
        emit(preamble)
    else:
        for index in preamble:
            emit([index])
    for section in outline.top:
        add(section)
    emit([])

    blocks: list[list[int]] = []
    current: list[int] = []
    for piece in pieces:
        if current and size(current + piece) > budget:
            blocks.append(current)
            current = []
        current = current + piece
    if current:
        blocks.append(current)
    return [Block(extract=block, context=_context_of(block, outline, texts)) for block in blocks]


def _context_of(block: list[int], outline: Outline, texts: dict[int, str]) -> list[int]:
    """The opening paragraphs of every clause the block sits inside, when they fall before
    it, plus the paragraph just before and just after."""
    inside = set(block)
    wanted: set[int] = set()
    section = outline.section_at(block[0])
    while section is not None:
        opening = [i for i in range(section.start, section.own_end()) if i in texts and i < block[0]]
        wanted.update(opening[:2])
        section = section.parent
    previous = max((i for i in texts if i < block[0]), default=None)
    following = min((i for i in texts if i > block[-1]), default=None)
    wanted.update(i for i in (previous, following) if i is not None)
    return sorted(wanted - inside)


# --------------------------------------------------------------------------- #
# Skeleton — parties, roles and defined terms, read once from the whole text  #
# --------------------------------------------------------------------------- #


@dataclass
class Skeleton:
    parties: list[KgParty]
    roles: list[dict[str, Any]]
    terms: list[KgDefinedTerm]
    headings: dict[str, str]  # clause id -> title, only when the text bears it out


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _local_to_global(raw_id: Any, prefix: str) -> str | None:
    """'party2' or 'party-2' -> 'party-2'."""
    match = re.fullmatch(rf"{prefix}-?(\d+)", str(raw_id or "").strip(), re.IGNORECASE)
    return f"{prefix}-{int(match.group(1))}" if match else None


def build_skeleton(
    provider: LLMProvider,
    rows: list[dict[str, Any]],
    outline: Outline,
    index_to_id: dict[int, str],
    paragraph_texts: list[tuple[str, str]],
    temperature: float,
) -> Skeleton:
    clause_ids = [s.clause_id for s in outline.sections]
    payload, reason = _call(
        provider,
        system_prompt=SKELETON_SYSTEM_PROMPT,
        user_prompt=build_skeleton_prompt(rows, outline.entries()),
        json_schema=skeleton_json_schema(clause_ids),
        temperature=temperature,
        label="skeleton",
    )
    if payload is None:
        raise RuntimeError(f"KG extraction: the skeleton call failed, nothing to build on: {reason}")

    parties: list[KgParty] = []
    for raw in payload.get("parties") or []:
        party_id = _local_to_global(raw.get("id"), "party")
        name = str(raw.get("name") or "").strip()
        if not party_id or not name or any(p.id == party_id for p in parties):
            continue
        aliases = {str(a).strip() for a in raw.get("aliases") or [] if str(a).strip()}
        parties.append(
            KgParty(
                id=party_id,
                name=name,
                role=str(raw.get("role") or "").strip(),
                address=str(raw.get("address") or "").strip(),
                aliases=sorted(a for a in aliases if _norm(a) != _norm(name)),
                paragraphIds=_paragraph_ids_from(raw.get("paragraphs"), index_to_id),
            )
        )
    party_ids = {p.id for p in parties}

    roles = []
    for raw in payload.get("roles") or []:
        played_by = [pid for pid in (_local_to_global(x, "party") for x in raw.get("playedBy") or []) if pid in party_ids]
        if str(raw.get("role") or "").strip() and len(played_by) > 1:
            roles.append({"role": str(raw["role"]).strip(), "playedBy": played_by})

    terms: list[KgDefinedTerm] = []
    for raw in payload.get("definedTerms") or []:
        term_id = _local_to_global(raw.get("id"), "term")
        term = str(raw.get("term") or "").strip()
        if not term_id or not term or any(t.id == term_id for t in terms):
            continue
        definition = str(raw.get("definition") or "").strip()
        pids, _, _ = anchor_to_evidence(definition, _paragraph_ids_from(raw.get("paragraphs"), index_to_id), paragraph_texts)
        terms.append(
            KgDefinedTerm(
                id=term_id,
                term=term,
                definition=definition,
                definedInClauseId=_clause_of(pids, outline, {v: k for k, v in index_to_id.items()}),
                paragraphIds=pids,
            )
        )

    # A title is kept only if the clause really opens with it: the model names the clause,
    # the text has the last word.
    texts = dict(paragraph_texts)
    headings: dict[str, str] = {}
    for raw in payload.get("clauseHeadings") or []:
        section = outline.by_id.get(str(raw.get("clause") or ""))
        heading = str(raw.get("heading") or "").strip().rstrip(".:")
        if section and heading and _norm(heading) in _norm(texts.get(index_to_id.get(section.start, ""), ""))[:160]:
            headings[section.clause_id] = heading

    return Skeleton(parties=parties, roles=roles, terms=terms, headings=headings)


def _clause_of(paragraph_ids: list[str], outline: Outline, id_to_index: dict[str, int]) -> str | None:
    """The clause of the first paragraph the evidence was found in."""
    indices = [id_to_index[p] for p in paragraph_ids if p in id_to_index]
    section = outline.section_at(min(indices)) if indices else None
    return section.clause_id if section else None


# --------------------------------------------------------------------------- #
# Calls                                                                       #
# --------------------------------------------------------------------------- #


def _call(
    provider: LLMProvider,
    *,
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    temperature: float,
    label: str,
) -> tuple[dict[str, Any] | None, str]:
    """The payload, or None and why. The provider already retries the network."""
    reason = ""
    for attempt in range(1, EXTRACTION_ATTEMPTS + 1):
        try:
            raw = provider.generate(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                json_schema=json_schema,
            )
            payload = json.loads(raw)
            if isinstance(payload, dict):
                return payload, ""
            reason = "the reply is not a JSON object"
        except LLMOutputTruncated as exc:
            # The same request hits the same limit again: the fix is a smaller block.
            logger.error("KG extraction: %s cut at the output limit", label)
            return None, str(exc)
        except (RuntimeError, json.JSONDecodeError) as exc:
            reason = str(exc)
        logger.warning("KG extraction: %s, attempt %d/%d failed: %s", label, attempt, EXTRACTION_ATTEMPTS, reason)
    return None, reason


# --------------------------------------------------------------------------- #
# Assembly — every id is known, so nothing is matched by spelling              #
# --------------------------------------------------------------------------- #


class _GraphBuilder:
    def __init__(self, outline: Outline, skeleton: Skeleton, index_to_id: dict[int, str], paragraph_texts: list[tuple[str, str]]):
        self.outline = outline
        self.skeleton = skeleton
        self.index_to_id = index_to_id
        self.id_to_index = {v: k for k, v in index_to_id.items()}
        self.paragraph_texts = paragraph_texts
        self.party_ids = {p.id for p in skeleton.parties}
        self.term_ids = {t.id for t in skeleton.terms}
        self.clause_ids = set(outline.by_id)
        self.obligations: list[KgObligation] = []
        self.rights: list[KgRight] = []
        self.prohibitions: list[KgProhibition] = []
        self.conditions: list[KgCondition] = []
        self.references: list[KgReference] = []
        self.values: list[KgValue] = []
        self.relations: list[KgEdge] = []
        self._lists = {"obligation": self.obligations, "right": self.rights, "prohibition": self.prohibitions}
        self._seq: dict[str, int] = {}
        self._relation_keys: set[tuple[str, str, str]] = set()
        # What the assembly refused, so a run can say what it threw away.
        self.dropped = {"outside_block": 0, "unresolved_attachment": 0, "relation_kind_mismatch": 0}

    def _next(self, prefix: str) -> str:
        self._seq[prefix] = self._seq.get(prefix, 0) + 1
        return f"{prefix}-{self._seq[prefix]}"

    def _anchor(self, span: str, declared: list[str], *pools: list[str]) -> tuple[list[str], list[str], bool | None]:
        """Evidence is looked for in the given pools in order — the block's EXTRACT
        paragraphs, then its CONTEXT — and only then in the whole contract: a sentence the
        contract repeats belongs to the block extracting it, not to its first occurrence."""
        for pool in pools:
            in_pool = [(pid, text) for pid, text in self.paragraph_texts if pid in pool]
            pids, spans, verified = anchor_to_evidence(span, declared, in_pool)
            if verified:
                return pids, spans, verified
        return anchor_to_evidence(span, declared, self.paragraph_texts)

    def ingest(self, payload: dict[str, Any], block: Block) -> None:
        extract_ids = [self.index_to_id[i] for i in block.extract if i in self.index_to_id]
        context_ids = [self.index_to_id[i] for i in block.context if i in self.index_to_id]
        local: dict[str, str] = {}

        for kind, collection in DEONTIC_COLLECTION_BY_KIND.items():
            for raw in payload.get(collection) or []:
                summary = str(raw.get("summary") or "").strip()
                if not summary:
                    continue
                text = str(raw.get("text") or "")
                declared = _paragraph_ids_from(raw.get("paragraphs"), self.index_to_id)
                pids, spans, verified = self._anchor(text, declared, extract_ids, context_ids)
                if not set(pids) & set(extract_ids):
                    # Read off a CONTEXT paragraph: the block that owns it extracts it.
                    self.dropped["outside_block"] += 1
                    continue
                obligor = raw.get("obligor") if raw.get("obligor") in self.party_ids else None
                beneficiary = raw.get("beneficiary") if raw.get("beneficiary") in self.party_ids else None
                global_id = self._next(DEONTIC_ID_PREFIX[kind])
                self._lists[kind].append(
                    _DEONTIC_MODEL_BY_KIND[kind](
                        id=global_id,
                        action=str(raw.get("action") or "").strip(),
                        summary=summary,
                        text=text.strip(),
                        burdenPartyId=obligor,
                        benefitPartyId=beneficiary,
                        clauseId=_clause_of(pids, self.outline, self.id_to_index),
                        deadline=str(raw.get("deadline") or "").strip(),
                        frequency=str(raw.get("frequency") or "").strip(),
                        paragraphIds=pids,
                        evidenceVerified=verified,
                        evidenceSpans=spans,
                    )
                )
                if raw.get("id"):
                    local[str(raw["id"]).strip()] = global_id

        def attach(ref: Any) -> str | None:
            key = str(ref or "").strip()
            return local.get(key) or (key if key in self.clause_ids else None)

        for raw in payload.get("conditions") or []:
            trigger = str(raw.get("trigger") or "").strip()
            gates = attach(raw.get("gates"))
            if not trigger or not gates:
                self.dropped["unresolved_attachment"] += 1
                continue
            pids, _, _ = self._anchor(trigger, _paragraph_ids_from(raw.get("paragraphs"), self.index_to_id), extract_ids, context_ids)
            self.conditions.append(
                KgCondition(
                    id=self._next("condition"), trigger=trigger, operator=str(raw.get("operator") or "").upper(), gatesId=gates, paragraphIds=pids
                )
            )

        for raw in payload.get("references") or []:
            name = str(raw.get("name") or "").strip()
            if not name:
                continue
            self.references.append(
                KgReference(
                    id=self._next("reference"),
                    name=name,
                    citation=str(raw.get("citation") or "").strip(),
                    citedById=attach(raw.get("citedBy")),
                    paragraphIds=_paragraph_ids_from(raw.get("paragraphs"), self.index_to_id),
                )
            )

        for raw in payload.get("values") or []:
            amount = str(raw.get("amount") or "").strip()
            if not amount:
                continue
            self.values.append(
                KgValue(
                    id=self._next("value"),
                    valueType=str(raw.get("valueType") or "").strip(),
                    amount=amount,
                    unit=str(raw.get("unit") or "").strip(),
                    quantifiesId=attach(raw.get("quantifies")),
                    paragraphIds=_paragraph_ids_from(raw.get("paragraphs"), self.index_to_id),
                )
            )

        for raw in payload.get("relations") or []:
            rtype = str(raw.get("type") or "")
            source, target = attach(raw.get("source")), str(raw.get("target") or "")
            if rtype not in RELATION_TYPES or not source:
                self.dropped["unresolved_attachment"] += 1
                continue
            # The schema lets any known id through; only a term can be "used", only a clause
            # referenced, depended on, superseded or modified.
            if target not in (self.term_ids if rtype in _RELATIONS_TO_TERMS else self.clause_ids) or target == source:
                self.dropped["relation_kind_mismatch"] += 1
                continue
            key = (source, target, rtype)
            if key in self._relation_keys:
                continue
            self._relation_keys.add(key)
            self.relations.append(
                KgEdge(
                    source=source,
                    target=target,
                    type=rtype,  # type: ignore[arg-type]
                    evidence=str(raw.get("evidence") or "").strip(),
                    paragraphIds=_paragraph_ids_from(raw.get("paragraphs"), self.index_to_id),
                )
            )

    def build(self) -> KnowledgeGraph:
        own: dict[str, list[str]] = {s.clause_id: [] for s in self.outline.sections}
        for index, paragraph_id in sorted(self.index_to_id.items()):
            section = self.outline.section_at(index)
            if section:
                own[section.clause_id].append(paragraph_id)
        clauses = [
            KgClause(id=s.clause_id, ref=s.ref, heading=self.skeleton.headings.get(s.clause_id, ""), level=s.level, paragraphIds=own[s.clause_id])
            for s in self.outline.sections
        ]
        edges = _derive_edges(
            obligations=self.obligations,
            rights=self.rights,
            prohibitions=self.prohibitions,
            defined_terms=self.skeleton.terms,
            conditions=self.conditions,
            references=self.references,
            values=self.values,
        )
        edges += [KgEdge(source=s.clause_id, target=s.parent.clause_id, type="is_part_of") for s in self.outline.sections if s.parent]
        edges += self.relations
        logger.info("KG extraction: %d relation(s) kept; dropped %s", len(self.relations), self.dropped)
        return KnowledgeGraph(
            parties=self.skeleton.parties,
            clauses=clauses,
            definedTerms=self.skeleton.terms,
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


# --------------------------------------------------------------------------- #
# Entry point                                                                 #
# --------------------------------------------------------------------------- #


def build_knowledge_graph(
    paragraphs_data: list[dict[str, Any]],
    provider: LLMProvider,
    *,
    tree: list[dict[str, Any]] | None,
    design: str = "D2",
    temperature: float = 0.1,
) -> KnowledgeGraph:
    """paragraphs_data and tree are the two halves of a paragraph file."""
    if design not in DESIGNS:
        raise ValueError(f"design must be one of {DESIGNS}, not {design!r}")

    index_to_id: dict[int, str] = {}
    texts: dict[int, str] = {}
    for i, row in enumerate(paragraphs_data):
        text = str(row.get("text") or "").strip()
        if text:
            index_to_id[i] = str(row.get("id"))
            texts[i] = text
    paragraph_texts = [(index_to_id[i], texts[i]) for i in sorted(texts)]
    rows = [{"i": i, "text": texts[i]} for i in sorted(texts)]

    outline = Outline(tree, paragraphs_data)
    skeleton = build_skeleton(provider, rows, outline, index_to_id, paragraph_texts, temperature)
    blocks = plan_blocks(outline, texts)
    logger.info(
        "KG extraction (%s): %d paragraphs, %d clauses, %d parties, %d terms, %d blocks",
        design,
        len(rows),
        len(outline.sections),
        len(skeleton.parties),
        len(skeleton.terms),
        len(blocks),
    )

    skeleton_text = render_skeleton(
        [p.model_dump() for p in skeleton.parties],
        skeleton.roles,
        [t.model_dump() for t in skeleton.terms],
        outline.entries(skeleton.headings),
    )
    schema = block_json_schema(
        [p.id for p in skeleton.parties],
        [s.clause_id for s in outline.sections],
        [t.id for t in skeleton.terms],
    )
    builder = _GraphBuilder(outline, skeleton, index_to_id, paragraph_texts)
    failed: list[dict[str, Any]] = []
    for number, block in enumerate(blocks, start=1):
        prompt = build_block_prompt(
            skeleton_text,
            extract=[{"i": i, "text": texts[i]} for i in block.extract],
            context=[] if design == "D1" else [{"i": i, "text": texts[i]} for i in block.context],
            contract=rows if design == "D1" else None,
        )
        payload, reason = _call(
            provider,
            system_prompt=BLOCK_SYSTEM_PROMPT,
            user_prompt=prompt,
            json_schema=schema,
            temperature=temperature,
            label=f"block {number}",
        )
        if payload is None:
            failed.append({"block": number, "first": block.extract[0], "last": block.extract[-1], "reason": reason})
            continue
        builder.ingest(payload, block)

    graph = builder.build()
    if failed:
        raise ExtractionIncomplete(failed, graph)
    return graph


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
