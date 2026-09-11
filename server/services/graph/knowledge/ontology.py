from __future__ import annotations

DEONTIC_KINDS: tuple[str, ...] = ("obligation", "right", "prohibition")

DEONTIC_COLLECTION_BY_KIND: dict[str, str] = {
    "obligation": "obligations",
    "right": "rights",
    "prohibition": "prohibitions",
}

DEONTIC_ID_PREFIX: dict[str, str] = {
    "obligation": "obligation",
    "prohibition": "prohibition",
    "right": "right",
}

DEONTIC_KIND_GUIDE: dict[str, str] = {
    "obligation": "a duty the obligor party MUST perform ('shall', 'must', 'agrees to').",
    "right": (
        "an entitlement the holder party HAS. Three forms, all of them rights:\n"
        "      * a plain permission — 'may', 'is entitled to';\n"
        "      * a DISCRETIONARY POWER, where one party can act unilaterally and the other "
        "is simply subject to it — 'reserves the right to', 'at its sole discretion', "
        "'may amend by written notice', 'effective immediately on notice', 'may elect to'. "
        "Capture these even when no counterparty duty is named;\n"
        "      * a FREEDOM stated as the absence of a duty — 'is not obliged to', 'shall "
        "have no obligation to', 'is under no duty'. The holder is the party thereby freed."
    ),
    "prohibition": "a restriction the obligor party MUST NOT breach ('shall not', 'may not').",
}

LLM_RELATION_GUIDE: dict[str, str] = {
    "uses": (
        "a clause or statement invokes a defined term. target = the exact term string "
        '(e.g. "Confidential Information").'
    ),
    "references": (
        "a NEUTRAL mention of another clause — it points at it without making anything "
        'conditional. target = the reference as written (e.g. "Section 3.1"). '
        'Cues: "as set out in", "as described in", "pursuant to", "under Section". '
        'Example: "A breach of Section 3.1 shall be considered a material breach."'
    ),
    "depends_on": (
        "applicability is GATED by another clause — it only takes effect, or is limited, "
        "depending on that clause. target = the referenced clause string. "
        'Cues: "subject to", "provided that", "unless", "except as", '
        '"in the event that", "upon", "notwithstanding", "conditioned on". '
        'Example: "Subject to Section 8, the Supplier shall deliver ..."'
    ),
    "supersedes": (
        "this clause overrides another in case of conflict. target = the overridden clause "
        'string. Cues: "shall prevail", "order of precedence", "takes precedence over".'
    ),
    "modifies": (
        "one provision CHANGES WHAT ANOTHER ONE MEANS OR WHETHER IT APPLIES. Two cases, "
        "and the second is the one usually missed:\n"
        '      * an amendment — "is hereby amended", "is replaced by", '
        '"notwithstanding Section";\n'
        "      * a provision whose exercise would REMOVE, SUSPEND, CAP or NARROW a duty or "
        'remedy stated elsewhere — a party that "may cease to be bound" by obligations, '
        'that may unilaterally amend an exhibit the other relies on, a liability "capped '
        'at" or "not exceeding" some amount, or a remedy declared "sole and '
        'exclusive". source = the empowering or limiting statement; target = the clause '
        "holding what it curtails.\n"
        "      This is what tells a discretionary power apart from an ordinary permission, "
        "so emit it whenever the curtailed duty is identifiable."
    ),
}

RELATION_TYPES: tuple[str, ...] = tuple(LLM_RELATION_GUIDE)

OUTPUT_SHAPE = {
    "parties": [
        {
            "id": "party1",
            "name": "full legal name as written",
            "role": "short role label (e.g. Company, Distributor, Supplier)",
            "address": "physical address if stated, else null",
            "aliases": ["defined-term or short name used for this party"],
            "paragraphs": [0],
        }
    ],
    "clauses": [
        {
            "id": "clause1",
            "ref": "Section 3.2 | Article 5 | null",
            "heading": "clause heading if any",
            "level": 1,
            "paragraphs": [0],
        }
    ],
    "definedTerms": [
        {
            "id": "term1",
            "term": "Confidential Information",
            "definition": "verbatim substring copied exactly from a paragraph",
            "definedIn": "clause1 | null",
            "paragraphs": [0],
        }
    ],
    "obligations": [
        {
            "id": "obligation1",
            "action": "short verb phrase (e.g. Pay Invoices, Audit Records)",
            "summary": "one short sentence paraphrasing the duty",
            "text": "verbatim substring copied exactly from a paragraph",
            "obligor": "party1 | null",
            "beneficiary": "party2 | null",
            "clause": "clause1 | null",
            "deadline": "within 30 days of receipt | null",
            "frequency": "once per calendar year | null",
            "paragraphs": [0],
        }
    ],
    "rights": [
        {
            "id": "right1",
            "action": "short verb phrase",
            "summary": "one short sentence paraphrasing the entitlement",
            "text": "verbatim substring copied exactly from a paragraph",
            "obligor": "party1 | null",
            "beneficiary": "party2 | null",
            "clause": "clause1 | null",
            "deadline": "null",
            "frequency": "null",
            "paragraphs": [0],
        }
    ],
    "prohibitions": [
        {
            "id": "prohibition1",
            "action": "short verb phrase",
            "summary": "one short sentence paraphrasing the restriction",
            "text": "verbatim substring copied exactly from a paragraph",
            "obligor": "party1 | null",
            "beneficiary": "party2 | null",
            "clause": "clause1 | null",
            "deadline": "null",
            "frequency": "null",
            "paragraphs": [0],
        }
    ],
    "conditions": [
        {
            "id": "condition1",
            "trigger": "verbatim substring stating the prerequisite",
            "operator": "IF | UNLESS | UNTIL | UPON",
            "gates": "obligation1 | clause1",
            "paragraphs": [0],
        }
    ],
    "references": [
        {
            "id": "reference1",
            "name": "ISO 27001 | GDPR | Delaware General Corporation Law",
            "citation": "Article 30 | Section 262 | null",
            "citedBy": "clause1 | obligation1",
            "paragraphs": [0],
        }
    ],
    "values": [
        {
            "id": "value1",
            "valueType": "Currency | Percentage | Duration | Quantity",
            "amount": "5,000,000",
            "unit": "USD | % | days",
            "quantifies": "obligation1 | clause1",
            "paragraphs": [0],
        }
    ],
    "relations": [
        {
            "type": " | ".join(RELATION_TYPES),
            "source": "clause1 | obligation1",
            "target": "Section 3.1 | Confidential Information",
            "evidence": "verbatim substring that states the link",
            "paragraphs": [0],
        }
    ],
}
