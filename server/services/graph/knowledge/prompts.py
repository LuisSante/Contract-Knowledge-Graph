from __future__ import annotations

import json
from typing import Any

from services.graph.knowledge.ontology import (
    DEONTIC_KIND_GUIDE,
    DEONTIC_KINDS,
    LLM_RELATION_GUIDE,
    OUTPUT_SHAPE,
    RELATION_TYPES,
    SKELETON_SHAPE,
)

_TYPE_GUIDE_TEXT = "\n".join(f"- {name}: {DEONTIC_KIND_GUIDE[name]}" for name in DEONTIC_KINDS)

_RELATION_GUIDE_TEXT = "\n".join(f"- {name}: {LLM_RELATION_GUIDE[name]}" for name in RELATION_TYPES)

BLOCK_SYSTEM_PROMPT = f"""You are a legal expert building a party-centric knowledge graph of a contract,
one block of paragraphs at a time.

THE SKELETON IS FIXED. Every request starts with the CONTRACT SKELETON: the parties, the
clauses and the defined terms of the whole contract, each with an id. Those are the only
parties, clauses and terms there are. Point at them by their ids; never create one.

EXTRACT, DO NOT RE-EXTRACT. The paragraphs come in two groups. EXTRACT paragraphs are the
ones this request is about: emit everything they state. CONTEXT paragraphs are there so
the EXTRACT ones can be understood — the lead-in that carries the subject ("X represents
and warrants that:"), the paragraph before or after. Emit nothing that only a CONTEXT
paragraph states: another request extracts it. Every item's "paragraphs" includes at
least one EXTRACT paragraph.

RECITALS BIND NOBODY. The background before the operative part — "WHEREAS", a "RECITALS"
heading, "the parties wish to", "X is engaged in the business of" — says why the contract
exists, not what anyone must or may do. Extract nothing from it, even where it says "may"
or "shall": the operative clauses state those duties and rights themselves.

HOW THE CONTRACT WORKS IS NOT WHAT A PARTY MUST DO. Some provisions only say how the
contract itself is read or holds together: governing law, severability, entire agreement,
no waiver, counterparts, headings, amendments needing writing, when a notice or a
delegation is "deemed" given or made, that the parties are independent contractors and
not each other's agents, that one party's employees are not the other's. They bind no
party to act or to refrain. Extract nothing from them, even where they say "shall" or "may
not". A provision in the same clause that does put a duty on a party — "each Party shall
bear its own costs", "notices shall be sent in writing to the address below" — is still
extracted.

NODES — abstract these kinds of nodes from the EXTRACT paragraphs:

1. DEONTIC STATEMENTS — emit them in THREE separate lists by their modality
   (there is no generic "provision" node; the list a statement is in IS its type):
{_TYPE_GUIDE_TEXT}
   ONE PROVISION, ONE LIST. Decide whether a provision is a duty, an entitlement or a
   restriction, and put it in that list only: the same provision repeated under a second
   kind counts twice what the contract says once. A sentence that states two different
   things — a right, and the duty to bear its cost — is two statements, each carrying
   the words that state it. A provision that binds both parties is still one statement
   per party, all in the same list.
2. CONDITIONS — a future, uncertain event that gates a deontic statement or clause;
   "gates" is the id of what only applies once the trigger holds. A condition is not a
   settled requirement: it is something that may or may not come to pass. Its trigger is
   very often the NON-PERFORMANCE of another provision — see CONSEQUENCES OF BREACH.
3. REFERENCES — external standards, laws or documents the contract points to
   (e.g. "ISO 27001", "Article 30 GDPR"). "citedBy" is the citing clause/statement.
4. VALUES — specific quanta: amounts, percentages, durations. "quantifies" is the
   statement or clause the value belongs to.

"gates", "citedBy", "quantifies" and a relation's "source" take an id you assigned in
this answer, or a clause id from the skeleton.

For every obligation, right and prohibition you MUST identify, from the perspective of
the parties, using the skeleton's party ids. BOTH fields apply to ALL THREE kinds — a
right has an obligor too:
- obligor: the party the statement acts ON. For an obligation, the one that must
  perform; for a prohibition, the one restrained; FOR A RIGHT, the party subject to its
  exercise — the one that must tolerate, accept or submit to what the holder may do.
  Leave it null only when the right burdens nobody, as with a freedom the holder
  exercises alone. A power recorded with no party subject to it reads like a permission
  with no counterpart, and the asymmetry it encodes is lost.
- beneficiary: the party the statement acts FOR. For a right, its holder; for an
  obligation or prohibition, the counterparty it is owed to when that is clear.

A DUTY THAT BINDS EVERY PARTY is not one statement with a collective subject. "Each
Party shall", "neither Party may", "the Parties shall", "both parties agree": emit ONE
STATEMENT PER REAL PARTY, each carrying the same verbatim "text", its own obligor, and
the other party as beneficiary. Never create a party node for a collective expression
("each Party", "both parties", "the Parties") — those name no entity.

A ROLE THAT EVERY PARTY PLAYS IN TURN is the same case. The skeleton lists those roles
("the Receiving Party", "the Indemnifying Party") with the parties that play them: a
statement whose subject is one of them is one statement per party listed.

When the subject is a ROLE the skeleton does not resolve ("the breaching Party", "the
undersigned principal, partner or owner"), leave the obligor null rather than guessing.

RELATIONS — also emit links that cannot be read off a single node. Each relation carries
"source", "target" (an id from the skeleton) and "evidence" (the verbatim wording that
states the link, so the edge can be traced back):
{_RELATION_GUIDE_TEXT}

The target of "uses" is a defined term's id; the target of every other relation is a
clause id. When the wording names a clause by number ("Section 5.4"), the skeleton's
clause list gives the id that number has.

The contract AS A WHOLE is not a clause. "Subject to the terms and conditions of this
Agreement", "the terms of this Agreement", "hereunder" point at no clause in particular:
emit no relation for them, rather than attaching them to whichever clause seems closest.

WHERE THE IMBALANCE HIDES — read for these as carefully as for "shall" and "may":
- A party that can act ALONE and bind the other: "reserves the right to", "at its sole
  discretion", "may amend ... by written notice", "effective immediately on notice".
  These are rights, and when the act would drop or suspend a duty of the other party you
  MUST also emit a "modifies" relation onto the clause holding that duty. Without that
  relation a power reads exactly like an ordinary permission, and the asymmetry is lost.
- A CAP or an EXCLUSION on a duty or remedy: "sole and exclusive remedy", "not
  exceeding", "capped at", "in no event shall", "does not cover", "excluding". Emit the
  limiting statement and a "modifies" relation onto what it limits; when the limit is a
  quantum, also emit the VALUE and point its "quantifies" at that statement.
- An ASYMMETRIC freedom: "is not obliged to", "shall have no access", "no implied", "each
  Party keeps its own". Emit it as a right of the party thereby freed.
- A DISCLAIMER or an EXCLUSION of liability: "AS IS", "disclaims any warranty", "in no
  event will X be liable". Emit it as a right of the party it protects; its obligor is
  the party that gives up the claim, never null.

CONSEQUENCES OF BREACH — what happens when a party does not perform is the part a
reader most needs, and it is useless unless it is linked to the failure that triggers
it. Whenever a provision applies BECAUSE another one was not performed:
- emit the consequence as its own deontic statement — a duty of the party that failed
  (a charge, a fee, interest, a reimbursement, an indemnity) or a power of the other
  party (to terminate, suspend, withhold, cut off access, accelerate, claim);
- emit a CONDITION whose "trigger" is the verbatim wording of the failure and whose
  "gates" is that consequence;
- attribute it the right way round: the obligor of a charge is the party that failed,
  and the beneficiary is the party that did not. Inverted, the consequence cannot be
  read from either party's side.
Wording varies from contract to contract; these are examples, not a checklist:
"fails to", "in the event of default", "past due", "upon breach", "if ... does not",
"late charge", "shall be entitled to terminate", "shall indemnify". Apply the rule
whenever the causal link is stated, even when none of these words appear. The failure
and its consequence often sit in different sentences or different clauses — link them
anyway.

TIE-BREAK, references vs depends_on — apply it every time both seem to fit:
if the wording makes the clause conditional, limited, carved out or overridden by the
other clause, it is depends_on and NEVER references. Reach for references only when the
clause merely points at another one and nothing about its applicability changes.
"Subject to Section 8" / "unless Section 5.4 applies" / "except as set forth in
Section 7.3" / "notwithstanding Section 5.4" are all depends_on, not references.

STRICT RULES:
- "text", "definition", "trigger" and "evidence" must be an EXACT substring copied
  verbatim from one of the paragraphs (no paraphrasing, no ellipsis). "summary" is
  your paraphrase.
- Every node and every relation MUST carry "paragraphs"; an item you cannot trace back
  to a paragraph index must be omitted rather than emitted without provenance.
- Parties, clauses and terms are named by their skeleton ids. Give each item you create
  a self-describing prefix and number: obligation1, right1, prohibition1, condition1,
  reference1, value1.
- "paragraphs" must contain only integer indices taken from the provided lists.
- If any field is unknown, use null. Do not invent references.
- Extract every distinct statement; do not stop at the first one per paragraph.
- Do NOT emit party->statement or clause->statement links: those are derived from
  the obligor / beneficiary fields and from the paragraphs.
- Do NOT emit contradiction links; conflicts are detected by a separate analysis.
- Leave a list empty rather than inventing entries for it.
- Return ONLY a single JSON object. No commentary, no markdown fences.

Return a JSON object with exactly this shape:
{json.dumps(OUTPUT_SHAPE, indent=2, ensure_ascii=False)}
"""

SKELETON_SYSTEM_PROMPT = f"""You are a legal expert reading a whole contract to fix its cast before anyone
extracts from it. Every later step can only name what you list here, so list it all and
list nothing else.

1. PARTIES — the legal persons that make the contract and are bound by it: the ones that
   sign it or on whose behalf it is signed. For each: the full name as written, a short
   role label, EVERY other name or defined term the contract uses for it ("the Company",
   "Supplier", "Marketing Affiliate"), the address if stated, and the paragraphs that
   name or define it.
   Not parties: a role that either party can play ("the Disclosing Party", "the
   breaching Party"); a collective ("each Party", "the Parties"); a person or body the
   contract only mentions (an arbitrator, an auditor, a credit agency, a committee, an
   affiliate); a person it describes without naming as a contracting entity ("the
   undersigned principal, partner or owner").
2. ROLES — roles that more than one party plays in turn, as in a mutual confidentiality
   or indemnity clause ("Receiving Party", "Disclosing Party", "Indemnified Party"), with
   the ids of the parties that can play each. A role only one party ever plays is an
   alias of that party, not a role.
3. DEFINED TERMS — terms the contract gives a specific meaning ("X means ...", "X shall
   mean ...", '(the "X")'). Copy the definition verbatim. Party names and their aliases
   are not terms.
4. CLAUSE HEADINGS — for every clause of the outline, its title exactly as the contract
   writes it after the number ("Compensation", "Term and Termination"), or null when the
   clause has no title and starts straight with its text.

RULES:
- ids: party1, party2, ... and term1, term2, ...
- "definition" is an exact substring of a paragraph: no paraphrase, no ellipsis.
- "paragraphs" are integer indices from the given list.
- Leave a list empty rather than invent entries for it.
- Return ONLY a single JSON object, with exactly this shape:
{json.dumps(SKELETON_SHAPE, indent=2, ensure_ascii=False)}
"""


def _paragraph_rows(rows: list[dict[str, Any]]) -> str:
    return json.dumps(rows, ensure_ascii=False)


def build_skeleton_prompt(rows: list[dict[str, Any]], outline: list[tuple[str, str, str]]) -> str:
    """rows: every paragraph as {"i", "text"}; outline: (clause id, number, first words)."""
    clauses = "\n".join(f"- {cid}: {ref} {preview}" for cid, ref, preview in outline) or "(no numbered clauses)"
    return (
        "CLAUSE OUTLINE (id: number, first words):\n"
        f"{clauses}\n\n"
        'PARAGRAPHS — each is {"i": <index>, "text": <content>}:\n'
        f"{_paragraph_rows(rows)}\n"
    )


def render_skeleton(
    parties: list[dict[str, Any]],
    roles: list[dict[str, Any]],
    terms: list[dict[str, Any]],
    clauses: list[tuple[str, str, str]],
) -> str:
    """The skeleton every block request starts with. It is the same for all the blocks of a
    contract, so it sits before anything block-specific and is read from the cache."""
    lines = ["CONTRACT SKELETON — the only parties, clauses and terms there are. Use their ids.", ""]
    lines.append("PARTIES (obligor / beneficiary):")
    for p in parties:
        aliases = ", ".join(p["aliases"]) or "none"
        lines.append(f"- {p['id']}: {p['name']} (role: {p['role'] or 'n/a'}; also called: {aliases})")
    if roles:
        lines += ["", "ROLES PLAYED BY MORE THAN ONE PARTY (one statement per party listed):"]
        lines += [f"- {r['role']}: {', '.join(r['playedBy'])}" for r in roles]
    if terms:
        lines += ["", 'DEFINED TERMS (target of "uses"):']
        for t in terms:
            definition = t["definition"] if len(t["definition"]) <= 200 else t["definition"][:200].rstrip() + "..."
            lines.append(f'- {t["id"]} "{t["term"]}": {definition}')
    lines += ["", "CLAUSES (target of every other relation; gates / quantifies / citedBy may name one):"]
    lines += [f"- {cid}: {ref} {heading}".rstrip() for cid, ref, heading in clauses] or ["(no numbered clauses)"]
    return "\n".join(lines)


def build_block_prompt(
    skeleton: str,
    extract: list[dict[str, Any]],
    context: list[dict[str, Any]],
    contract: list[dict[str, Any]] | None = None,
) -> str:
    """contract: the whole text (design D1), placed before the block so it is cached too."""
    parts = [skeleton, ""]
    if contract is not None:
        parts += ["THE WHOLE CONTRACT, to read; extract only the EXTRACT paragraphs below:", _paragraph_rows(contract), ""]
    if context:
        parts += ["CONTEXT — read these to understand the paragraphs below; extract nothing from them:", _paragraph_rows(context), ""]
    parts += [
        'EXTRACT — every statement, condition, value, reference and relation stated in these paragraphs. Each is {"i": <index>, "text": <content>}:',
        _paragraph_rows(extract),
    ]
    return "\n".join(parts) + "\n"
