from __future__ import annotations

import json

from services.graph.knowledge.ontology import (
    OUTPUT_SHAPE,
    PROVISION_TYPE_GUIDE,
    PROVISION_TYPES,
)

_TYPE_GUIDE_TEXT = "\n".join(
    f"- {name}: {PROVISION_TYPE_GUIDE[name]}" for name in PROVISION_TYPES
)

SYSTEM_PROMPT = f"""You are a legal expert building a party-centric knowledge graph of a contract.

Your job is to abstract, from the given paragraphs, three kinds of nodes:

1. PARTIES — the contracting entities. Give each a short role label and list the
   aliases / defined terms used for it (e.g. "the Company", "Supplier").
2. CLAUSES — numbered sections/articles present in the paragraphs (ref like
   "Section 3.2"). Use null ref for unnumbered but titled clauses.
3. PROVISIONS — deontic statements, each classified as one of:
{_TYPE_GUIDE_TEXT}

For every provision you MUST identify, from the perspective of the parties:
- obligor: the party that must comply, or that is prohibited (for obligation/prohibition).
- beneficiary: the party that benefits or holds the right (for right, and the
  counterparty that an obligation is owed to when it is clear).

STRICT RULES:
- "text" must be an EXACT substring copied verbatim from one of the paragraphs
  (no paraphrasing, no ellipsis). "summary" is your short paraphrase.
- Reference parties and clauses only by the ids you assigned (P1, C1, ...).
- "paragraphs" must contain only integer indices taken from the provided list.
- If obligor/beneficiary/clause is unknown, use null. Do not invent parties.
- Extract every distinct provision; do not stop at the first one per paragraph.
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
