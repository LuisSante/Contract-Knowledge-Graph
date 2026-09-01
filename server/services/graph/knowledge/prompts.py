from __future__ import annotations

import json

from services.graph.knowledge.ontology import (
    DEONTIC_KIND_GUIDE,
    DEONTIC_KINDS,
    LLM_RELATION_GUIDE,
    OUTPUT_SHAPE,
    RELATION_TYPES,
)

_TYPE_GUIDE_TEXT = "\n".join(
    f"- {name}: {DEONTIC_KIND_GUIDE[name]}" for name in DEONTIC_KINDS
)

_RELATION_GUIDE_TEXT = "\n".join(
    f"- {name}: {LLM_RELATION_GUIDE[name]}" for name in RELATION_TYPES
)

SYSTEM_PROMPT = f"""You are a legal expert building a party-centric knowledge graph of a contract.

NODES — abstract these kinds of nodes from the given paragraphs:

1. PARTIES — the contracting entities. Give each a short role label and list the
   aliases / defined terms used for it (e.g. "the Company", "Supplier"). Include
   the address only if the paragraphs state it.
2. CLAUSES — numbered sections/articles present in the paragraphs (ref like
   "Section 3.2"). Use null ref for unnumbered but titled clauses. "level" is the
   nesting depth implied by the numbering ("3" -> 1, "3.2" -> 2, "3.2.1" -> 3).
3. DEFINED TERMS — terms the contract assigns a specific meaning to, identified by
   capitalized syntax and/or a defining formula ("X means ...", "X shall mean ...").
   Do NOT list party names here — those belong in the party "aliases" field.
4. DEONTIC STATEMENTS — emit them in THREE separate lists by their modality
   (there is no generic "provision" node; the list a statement is in IS its type):
{_TYPE_GUIDE_TEXT}
5. CONDITIONS — prerequisites that gate a deontic statement or clause. "gates" is the
   id of the statement or clause that only applies once the trigger holds.
6. REFERENCES — external standards, laws or documents the contract points to
   (e.g. "ISO 27001", "Article 30 GDPR"). "citedBy" is the citing clause/statement.
7. VALUES — specific quanta: amounts, percentages, durations. "quantifies" is the
   statement or clause the value belongs to.

For every obligation, right and prohibition you MUST identify, from the perspective
of the parties:
- obligor: the party that must comply, or that is prohibited (for obligation/prohibition).
- beneficiary: the party that benefits or holds the right (for right, and the
  counterparty that an obligation is owed to when it is clear).

RELATIONS — also emit links that cannot be read off a single node. Each relation carries
"source" (an id you assigned), "target" (a STRING copied as written, NOT an id), and
"evidence" (the verbatim wording that states the link, so the edge can be traced back):
{_RELATION_GUIDE_TEXT}

Targets are strings because the referenced clause or term may live outside the
paragraphs you were given; it is resolved later against the whole contract. Copy the
reference as the contract writes it and do not guess which id it corresponds to. When the
clause carries no number, write its heading exactly as titled — headings resolve too.

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
- Reference parties, clauses, deontic statements and terms only by the ids you
  assigned; give each a self-describing prefix and number: party1, clause1,
  term1, obligation1, right1, prohibition1, condition1, reference1, value1.
- "paragraphs" must contain only integer indices taken from the provided list.
- If any field is unknown, use null. Do not invent parties, clauses or references.
- Extract every distinct statement; do not stop at the first one per paragraph.
- Do NOT emit party->statement or clause->statement links: those are derived from
  the obligor / beneficiary / clause fields.
- Do NOT emit contradiction links; conflicts are detected by a separate analysis.
- Omit a list entirely rather than inventing entries for it.
- Return ONLY a single JSON object. No commentary, no markdown fences.
"""

_OUTPUT_SHAPE_TEXT = json.dumps(OUTPUT_SHAPE, indent=2, ensure_ascii=False)

USER_PROMPT_TEMPLATE = """Extract the knowledge graph for the following contract paragraphs.

Each paragraph is given as {{"i": <index>, "text": <content>}}. Use the "i" values
for the "paragraphs" provenance fields.

PARAGRAPHS:
{paragraphs_json}

Return a JSON object with exactly this shape:
{output_shape}
"""


def build_user_prompt(paragraphs_json: str) -> str:
    return USER_PROMPT_TEMPLATE.format(
        paragraphs_json=paragraphs_json,
        output_shape=_OUTPUT_SHAPE_TEXT,
    )
