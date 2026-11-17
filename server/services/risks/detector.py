"""Risky statements of a contract, found by an LLM that reads one clause at a time.

Each call is a row of the Clause Analyzer: a clause with every obligation, right and
prohibition it holds, grouped by party as the table shows them, each with its conditions,
values and timing, plus the clauses one edge away. The model answers which of those
statements are red flags, of which type, and why.

The types are the lease red flags of Leivaditi, Rossi and Kanoulas (2020), "A Benchmark for
Lease Contract Review", Section 3.2, with the paper's definitions. The list is for leases:
another kind of contract needs its own. The graph is only read; nothing here changes it.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from schemas.risks import ContractRisk, ContractRisks
from services.llm.factory import LLMProviderFactory

logger = logging.getLogger(__name__)

# The cheapest model that answers in the forced format; it does not reason, so a call costs
# what its tokens cost and nothing more.
DEFAULT_MODEL = "gpt-6-luna"

MAX_WORKERS = 8
MAX_OUTPUT_TOKENS = 1500
# A second try covers a dropped connection; a third would only repeat the same failure.
ATTEMPTS = 2

RED_FLAG_TYPES: dict[str, str] = {
    "break_option": "a clause that allows the sudden termination of a lease",
    "extension_period": "a clause stating the period by which the lease can be extended",
    "special_stipulations": "a clause that supplements and, in certain events, modifies or varies the other provisions of the lease",
    "compulsory_reconstruction": "a clause about the reconstruction of the leased property in case of complete disaster, such as an earthquake or fire",
    "damage": "a clause stating how the cost for repairing damages is split among the lessee and the lessor",
    "expansion": "a clause stating the obligation of the lessor to expand part of the property at its own cost and expense",
    "landlord_repairs": "a clause stating the obligation of a landlord to pay all the expenses of maintenance repairs",
    "service_charges": "a clause stating the service costs the lessor charges the lessee to recover the cost of providing services to the building",
    "warranties_of_the_owner": "written guarantees of the landlord, promising to execute specific property-related actions, such as repairs, within a set period",
    "guarantee_transferable": "a clause stating that in the event of a sale or other transfer of the building or of the lease, the lessor transfers the cash deposit or letter of credit to the transferee and is released from liability for its return",
    "assignment_permitted": "a clause stating that the tenant has the right to assign the lease contract to its successors or assigns",
    "sublease_permitted": "the tenant is allowed to sublease the leased property",
    "no_obligation_to_operate": "a clause stating that the lessee is not obliged to operate the leased property for its primary intended purpose",
    "reinstatement": "a clause stating the tenant's obligations to return the property to the condition it was in before the lease began",
    "right_of_first_refusal_to_purchase": "a clause that gives a tenant the right to buy a leased property before the landlord negotiates any other offers",
    "right_of_first_refusal_to_lease": "a clause that gives a tenant the right to lease a leased property before the landlord negotiates any other offers",
    "change_of_control": "a clause providing that where the lessee is a corporate entity and its control changes through a transfer or sale of shares, it must obtain the lessor's consent",
}

SYSTEM_PROMPT = (
    "You review one clause of a lease contract, given as the obligations, rights and prohibitions it sets for each party.\n"
    "\n"
    "A red flag is a term or sentence that indicates some danger or other potentially problematic situation for one or more "
    "of the signing parties. In lease review, red flags are the clauses of these types:\n"
    "\n" + "\n".join(f"- {name}: {definition}" for name, definition in RED_FLAG_TYPES.items()) + "\n"
    "\n"
    "Decide which of these statements are red flags: those that belong to a clause of one of these types. "
    "Use only what is given below.\n"
    "\n"
    "Answer in JSON:\n"
    '{"risks": [{"id": "<statement id>", "type": "<one of the types above>", "reason": "<one sentence, at most 25 words>"}]}\n'
    'List only the statements that are red flags. If none is, answer {"risks": []}.'
)

RESPONSE_SCHEMA: dict[str, Any] = {
    "name": "clause_risks_typed",
    "schema": {
        "type": "object",
        "properties": {
            "risks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "type": {"type": "string", "enum": list(RED_FLAG_TYPES)},
                        "reason": {"type": "string"},
                    },
                    "required": ["id", "type", "reason"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["risks"],
        "additionalProperties": False,
    },
}

_STATEMENT_KEYS = (("obligations", "obligation"), ("rights", "right"), ("prohibitions", "prohibition"))
_LINK_VERB = {"modifies": "modifies", "depends_on": "depends on", "references": "refers to"}
_LINK_PASSIVE = {"modifies": "is modified by", "depends_on": "is depended on by", "references": "is referred to by"}


@dataclass
class ClauseRow:
    """What one call reads, and which statements its answer may name."""

    clause_id: str
    content: str
    statement_ids: list[str] = field(default_factory=list)
    # A reciprocal pair is written once: the id shown stands for both of its statements.
    stands_for: dict[str, list[str]] = field(default_factory=dict)


def _owner(statement: dict[str, Any]) -> str | None:
    """Whose a statement is: the party an obligation or prohibition binds, or a right's holder."""
    return statement.get("benefitPartyId") if statement["kind"] == "right" else statement.get("burdenPartyId")


def _text(statement: dict[str, Any]) -> str:
    return str(statement.get("text") or "").strip()


def clause_rows(kg: dict[str, Any]) -> list[ClauseRow]:
    """One row per clause that holds statements, laid out as the Clause Analyzer shows it."""
    statements = [dict(s, kind=kind) for key, kind in _STATEMENT_KEYS for s in kg.get(key, []) if isinstance(s, dict)]
    by_id = {s["id"]: s for s in statements}
    parties = [p for p in kg.get("parties", []) if isinstance(p, dict) and p.get("id")]
    clauses = {c["id"]: c for c in kg.get("clauses", []) if isinstance(c, dict) and c.get("id")}

    def party_name(party: dict[str, Any]) -> str:
        aliases = [a for a in party.get("aliases", []) if a][:2]
        return str(party.get("name", "")) + (f" ({', '.join(aliases)})" if aliases else "")

    name_of = {p["id"]: party_name(p) for p in parties}

    def clause_label(clause_id: str | None) -> str:
        clause = clauses.get(clause_id or "", {})
        heading = clause.get("heading")
        return f"{clause.get('ref', '')}" + (f" — {heading}" if heading else "")

    conditions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for condition in kg.get("conditions", []):
        conditions[condition.get("gatesId")].append(condition)
    values: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for value in kg.get("values", []):
        values[value.get("quantifiesId")].append(value)

    # Reciprocal pairs, as the table sets them aside: same type, clause and words, one copy per party.
    def pair_key(statement: dict[str, Any]) -> tuple[str, Any, str]:
        return (statement["kind"], statement.get("clauseId"), _text(statement))

    owners: dict[tuple[str, Any, str], set[str]] = defaultdict(set)
    for statement in statements:
        owner = _owner(statement)
        if owner and _text(statement):
            owners[pair_key(statement)].add(owner)
    twins = {s["id"] for s in statements if len(owners[pair_key(s)]) > 1}

    def has_both_parties(statement: dict[str, Any]) -> bool:
        return bool(statement.get("burdenPartyId") and statement.get("benefitPartyId"))

    def line(statement: dict[str, Any]) -> str:
        parts = [f'[{statement["id"]}] {statement["kind"]}: "{_text(statement)}"']
        gates = conditions[statement["id"]]
        if gates:
            parts.append("conditions: " + "; ".join(f"{c['operator']} {c['trigger']}" for c in gates))
        timing = [f"{v['valueType']} {v['amount']} {v['unit']}".strip() for v in values[statement["id"]]]
        deadline = str(statement.get("deadline") or "").strip()
        frequency = str(statement.get("frequency") or "").strip()
        if deadline:
            timing.append(f"deadline {deadline}")
        if frequency:
            timing.append(f"frequency {frequency}")
        if timing:
            parts.append("values and timing: " + "; ".join(timing))
        return "- " + " | ".join(parts)

    def gist(clause_id: str) -> str:
        """What a linked clause holds, in a line: enough to read the link, not the whole clause."""
        inside = [s for s in statements if s.get("clauseId") == clause_id]
        return "; ".join(f"{s['kind']} of {name_of.get(_owner(s) or '', 'no party')}: {s.get('action', '')}" for s in inside) or "no statements"

    rows: list[ClauseRow] = []
    for clause in clauses.values():
        mine = [s for s in statements if s.get("clauseId") == clause["id"]]
        if not mine:
            continue
        out = ["Parties:", *(f"- {name_of[p['id']]}" for p in parties), "", f"Clause {clause_label(clause['id'])}"]
        ids: list[str] = []
        stands_for: dict[str, list[str]] = {}

        for party in parties:
            own = [s for s in mine if s["id"] not in twins and _owner(s) == party["id"] and has_both_parties(s)]
            if own:
                out += ["", f"{name_of[party['id']]}:", *(line(s) for s in own)]
                ids += [s["id"] for s in own]

        pairs: dict[tuple[str, Any, str], list[dict[str, Any]]] = {}
        for statement in mine:
            if statement["id"] in twins:
                pairs.setdefault(pair_key(statement), []).append(statement)
        if pairs:
            out += ["", "Both parties (the same statement binds or entitles each of them):"]
            for group in pairs.values():
                out.append(line(group[0]))
                ids.append(group[0]["id"])
                stands_for[group[0]["id"]] = [s["id"] for s in group]

        # A statement the contract gives to nobody has no square, but the clause still says it.
        loose = [s for s in mine if s["id"] not in twins and not has_both_parties(s)]
        if loose:
            out += ["", "Stated without naming a party:", *(line(s) for s in loose)]
            ids += [s["id"] for s in loose]

        linked: list[str] = []
        for edge in kg.get("edges", []):
            kind = edge.get("type")
            if kind not in _LINK_VERB:
                continue
            source = by_id.get(edge.get("source"))
            source_clause = source.get("clauseId") if source else (edge.get("source") if edge.get("source") in clauses else None)
            target = edge.get("target")
            if source_clause == clause["id"] and target != clause["id"] and target in clauses:
                who = f"[{source['id']}] " if source else ""
                linked.append(f"- {who}{_LINK_VERB[kind]} clause {clause_label(target)}, which holds: {gist(target)}")
            elif target == clause["id"] and source_clause and source_clause != clause["id"]:
                what = f': "{_text(source)}"' if source else ""
                linked.append(f"- this clause {_LINK_PASSIVE[kind]} clause {clause_label(source_clause)}{what}")
        out += ["", "Linked clauses:", *(list(dict.fromkeys(linked)) or ["- none"])]

        rows.append(ClauseRow(clause_id=clause["id"], content="\n".join(out), statement_ids=ids, stands_for=stands_for))
    return rows


def detect_contract_risks(
    *,
    doc_id: str,
    kg: dict[str, Any],
    provider_name: str = "openai",
    model: str | None = None,
) -> ContractRisks:
    rows = clause_rows(kg)
    if not rows:
        raise RuntimeError("The knowledge graph has no statements to review")

    resolved_model = (model or "").strip() or DEFAULT_MODEL
    provider = LLMProviderFactory.create(provider_name, model=resolved_model)

    def review(row: ClauseRow) -> list[ContractRisk] | None:
        """The row's risks, or None when the call failed: its statements were never judged."""
        for attempt in range(1, ATTEMPTS + 1):
            try:
                raw = provider.generate(
                    system_prompt=SYSTEM_PROMPT,
                    user_prompt=row.content,
                    json_schema=RESPONSE_SCHEMA,
                    max_output_tokens=MAX_OUTPUT_TOKENS,
                )
                answer = json.loads(raw)
            except Exception:
                # One clause failing must not lose the rest: it is counted, and the others go on.
                logger.warning("Risk review of %s clause %s failed (attempt %d)", doc_id, row.clause_id, attempt, exc_info=True)
                continue
            known = set(row.statement_ids)
            found: list[ContractRisk] = []
            for item in answer.get("risks", []):
                # An id the row never showed is the model's invention: there is no square for it.
                if item.get("id") not in known:
                    continue
                for statement_id in row.stands_for.get(item["id"], [item["id"]]):
                    found.append(ContractRisk(statementId=statement_id, type=item["type"], reason=str(item.get("reason", "")).strip()))
            return found
        return None

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        results = list(pool.map(review, rows))

    failed = sum(1 for result in results if result is None)
    if failed == len(rows):
        raise RuntimeError("Every clause review failed; no risk was judged")

    risks = [risk for result in results if result for risk in result]
    logger.info("Risks for %s: %d statements in %d clauses (%d failed), model %s", doc_id, len(risks), len(rows), failed, resolved_model)
    return ContractRisks(
        documentId=doc_id,
        model=resolved_model,
        clausesReviewed=len(rows) - failed,
        clausesFailed=failed,
        risks=risks,
    )
