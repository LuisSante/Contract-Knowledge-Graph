from __future__ import annotations

# Deontic modality of a provision.
PROVISION_TYPES: tuple[str, ...] = ("obligation", "right", "prohibition")

# Node id prefix per modality, so an id reads as its deontic type ("proh-12")
# instead of a generic "prov-12". Each type numbers independently.
PROVISION_ID_PREFIX: dict[str, str] = {
    "obligation": "obl",
    "prohibition": "proh",
    "right": "perm",
}

# Human-readable description of each provision type, injected into the prompt.
PROVISION_TYPE_GUIDE: dict[str, str] = {
    "obligation": "a duty the obligor party MUST perform ('shall', 'must', 'agrees to').",
    "right": "an entitlement/permission the beneficiary party HOLDS ('may', 'is entitled to').",
    "prohibition": "a restriction the obligor party MUST NOT breach ('shall not', 'may not').",
}

LLM_RELATION_GUIDE: dict[str, str] = {
    "uses": (
        "a clause or provision invokes a defined term. target = the exact term string "
        "(e.g. \"Confidential Information\")."
    ),
    "references": (
        "a NEUTRAL mention of another clause — it points at it without making anything "
        "conditional. target = the reference as written (e.g. \"Section 3.1\"). "
        "Cues: \"as set out in\", \"as described in\", \"pursuant to\", \"under Section\". "
        "Example: \"A breach of Section 3.1 shall be considered a material breach.\""
    ),
    "depends_on": (
        "applicability is GATED by another clause — it only takes effect, or is limited, "
        "depending on that clause. target = the referenced clause string. "
        "Cues: \"subject to\", \"provided that\", \"unless\", \"except as\", "
        "\"in the event that\", \"upon\", \"notwithstanding\", \"conditioned on\". "
        "Example: \"Subject to Section 8, the Supplier shall deliver ...\""
    ),
    "supersedes": (
        "this clause overrides another in case of conflict. target = the overridden clause "
        "string. Cues: \"shall prevail\", \"order of precedence\", \"takes precedence over\"."
    ),
    "modifies": (
        "this clause amends or replaces another. target = the amended clause string. "
        "Cues: \"is hereby amended\", \"is replaced by\", \"notwithstanding Section\"."
    ),
}

RELATION_TYPES: tuple[str, ...] = tuple(LLM_RELATION_GUIDE)

OUTPUT_SHAPE = {
    "parties": [
        {
            "id": "P1",
            "name": "full legal name as written",
            "role": "short role label (e.g. Company, Distributor, Supplier)",
            "address": "physical address if stated, else null",
            "aliases": ["defined-term or short name used for this party"],
            "paragraphs": [0],
        }
    ],
    "clauses": [
        {
            "id": "C1",
            "ref": "Section 3.2 | Article 5 | null",
            "heading": "clause heading if any",
            "level": 1,
            "paragraphs": [0],
        }
    ],
    "definedTerms": [
        {
            "id": "T1",
            "term": "Confidential Information",
            "definition": "verbatim substring copied exactly from a paragraph",
            "definedIn": "C1 | null",
            "paragraphs": [0],
        }
    ],
    "provisions": [
        {
            "id": "V1",
            "type": "obligation | right | prohibition",
            "action": "short verb phrase (e.g. Pay Invoices, Audit Records)",
            "summary": "one short sentence paraphrasing the duty/right/restriction",
            "text": "verbatim substring copied exactly from a paragraph",
            "obligor": "P1 | null",
            "beneficiary": "P2 | null",
            "clause": "C1 | null",
            "deadline": "within 30 days of receipt | null",
            "frequency": "once per calendar year | null",
            "paragraphs": [0],
        }
    ],
    "conditions": [
        {
            "id": "N1",
            "trigger": "verbatim substring stating the prerequisite",
            "operator": "IF | UNLESS | UNTIL | UPON",
            "gates": "V1 | C1",
            "paragraphs": [0],
        }
    ],
    "references": [
        {
            "id": "R1",
            "name": "ISO 27001 | GDPR | Delaware General Corporation Law",
            "citation": "Article 30 | Section 262 | null",
            "citedBy": "C1 | V1",
            "paragraphs": [0],
        }
    ],
    "values": [
        {
            "id": "D1",
            "valueType": "Currency | Percentage | Duration | Quantity",
            "amount": "5,000,000",
            "unit": "USD | % | days",
            "quantifies": "V1 | C1",
            "paragraphs": [0],
        }
    ],
    "relations": [
        {
            "type": " | ".join(RELATION_TYPES),
            "source": "C1 | V1",
            "target": "Section 3.1 | Confidential Information",
            "evidence": "verbatim substring that states the link",
            "paragraphs": [0],
        }
    ],
}
