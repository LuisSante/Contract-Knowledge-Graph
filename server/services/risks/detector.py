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

DEFAULT_MODEL = "gpt-6-luna"

MAX_WORKERS = 8
MAX_OUTPUT_TOKENS = 1500
ATTEMPTS = 2

RED_FLAG_TYPES: dict[str, str] = {
    "break_option": "ending the lease before its term: a right of either party to terminate, cancel, rescind or break the contract or to take the premises back, each event or breach that gives that right, the notice it takes, and the penalty or compensation for ending early",
    "extension_period": "a clause stating the period by which the lease can be extended",
    "special_stipulations": "a clause that supplements and, in certain events, modifies or varies the other provisions of the lease; only when the statement says so in terms",
    "compulsory_reconstruction": "a clause about the reconstruction of the leased property in case of complete disaster, such as an earthquake or fire",
    "damage": "who answers for damage and loss: damage to the premises or to a party's property, compensation or liquidated damages owed for a breach, and force majeure or other exemptions from liability",
    "expansion": "a clause stating the obligation of the lessor to expand part of the property at its own cost and expense",
    "landlord_repairs": "repairs and maintenance of the premises and their facilities: who must do or pay for them, inspections, the condition or standard they must be kept in, the scope of the repairs and how their cost is shared",
    "service_charges": "utilities and building services (water, electricity, gas, heating, TV, telephone, property management or service fees): who pays them, how they are calculated and when they are settled, and a right to refuse extra charges",
    "warranties_of_the_owner": "a written guarantee by the lessor that it will carry out a specific action on the property, such as a repair, within a set period",
    "guarantee_transferable": "the security deposit or other guarantee: its amount, payment, interest, deductions and return, and its transfer when the property or the lease changes hands",
    "assignment_permitted": "assigning or transferring the lease to someone else: allowed, forbidden or subject to consent",
    "sublease_permitted": "subletting, or letting a third party use the premises: allowed, forbidden or subject to consent",
    "no_obligation_to_operate": "a clause stating that the lessee is not obliged to operate the leased property for its primary intended purpose",
    "reinstatement": "the state in which the lessee must hand the premises back: restoring them to their original condition, removing alterations or fixtures, and what it owes if it does not",
    "right_of_first_refusal_to_purchase": "the lessee's priority or option to buy the property, and the lessor's duty to tell it of an intended sale",
    "right_of_first_refusal_to_lease": "the lessee's priority or option to renew the lease or to lease the property again",
    "change_of_control": "a change in who owns or controls: the lessor selling, transferring or mortgaging the property, the lease continuing under the new owner, the notice or consent it takes, a change in the control of the lessee, and exchanging or handing the premises over to others",
}

NOT_TOPICS = (
    "the rent, rent-free periods and payment dates; the description, handover or permitted use of the premises; the lessee's "
    "alterations or decoration; the term; taxes and insurance premiums; notices; disputes; governing law; signing"
)

KEPT_ROLE = "core"
ROLES = (KEPT_ROLE, "related")

SYSTEM_PROMPT = (
    "You review one clause of a lease contract, given as the obligations, rights and prohibitions it sets for each party.\n"
    "\n"
    "Lease reviewers mark as red flags the statements that deal with certain topics, because those are the ones a party "
    "must look at before signing. A statement is a red flag when it is about one of the topics below, whoever it binds or "
    "favours, and whether it grants, limits, forbids or conditions the thing: a ban on subletting is a red flag just as a "
    "permission to sublet is.\n"
    "\n"
    "Topics:\n" + "\n".join(f"- {name}: {definition}" for name, definition in RED_FLAG_TYPES.items()) + "\n"
    "\n"
    "How to decide:\n"
    "- Go through every statement of the clause, one by one.\n"
    '- For each red flag say its role. "core": the statement itself sets the rule on the topic (who may or must do what, '
    'on which terms, with which consequence). "related": it only touches the topic (a procedural detail, a follow-up, a '
    "passing mention) and the rule is set elsewhere.\n"
    "- When several topics fit, choose the most specific one.\n"
    f"- Statements about none of the topics are not red flags: {NOT_TOPICS}.\n"
    "- Use only what is given below.\n"
    "\n"
    "Answer in JSON:\n"
    '{"risks": [{"id": "<statement id>", "type": "<one of the topics above>", "role": "core" or "related", '
    '"reason": "<one sentence, at most 25 words>"}]}\n'
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
                        "role": {"type": "string", "enum": list(ROLES)},
                        "reason": {"type": "string"},
                    },
                    "required": ["id", "type", "role", "reason"],
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
    clause_id: str
    content: str
    statement_ids: list[str] = field(default_factory=list)
    stands_for: dict[str, list[str]] = field(default_factory=dict)


def _owner(statement: dict[str, Any]) -> str | None:
    return statement.get("benefitPartyId") if statement["kind"] == "right" else statement.get("burdenPartyId")


def _text(statement: dict[str, Any]) -> str:
    return str(statement.get("text") or "").strip()


def clause_rows(kg: dict[str, Any]) -> list[ClauseRow]:
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
                logger.warning("Risk review of %s clause %s failed (attempt %d)", doc_id, row.clause_id, attempt, exc_info=True)
                continue
            known = set(row.statement_ids)
            found: list[ContractRisk] = []
            for item in answer.get("risks", []):
                if item.get("id") not in known:
                    continue
                if item.get("role") != KEPT_ROLE:
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
