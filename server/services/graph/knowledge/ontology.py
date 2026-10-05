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
    "obligation": (
        "a duty the obligor party MUST perform ('shall', 'must', 'agrees to'). A REPRESENTATION "
        "or WARRANTY ('represents and warrants that', 'warrants that') is an obligation too: the "
        "party giving it answers for what it states being true, owed to the other party. Emit one "
        "per warranted statement; when a list follows a lead-in ('X represents and warrants "
        "that:'), each item is X's."
    ),
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
    "uses": ('a clause or statement invokes a defined term. target = the exact term string (e.g. "Confidential Information").'),
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

# What the first pass reads off the whole contract, once: the ids every later call must use.
SKELETON_SHAPE = {
    "parties": [
        {
            "id": "party1",
            "name": "full legal name as written",
            "role": "short role label (e.g. Company, Distributor, Supplier)",
            "address": "physical address if stated, else null",
            "aliases": ["every other name or defined term the contract uses for this party"],
            "paragraphs": [0],
        }
    ],
    "roles": [
        {
            "role": "Receiving Party",
            "playedBy": ["party1", "party2"],
        }
    ],
    "definedTerms": [
        {
            "id": "term1",
            "term": "Confidential Information",
            "definition": "verbatim substring copied exactly from a paragraph",
            "paragraphs": [0],
        }
    ],
    "clauseHeadings": [
        {
            "clause": "clause-3",
            "heading": "the clause's title as the contract writes it, or null if it has none",
        }
    ],
}

# What each block call returns. Parties, clauses and defined terms are not in it: they come
# from the skeleton, and a block can only point at them by id.
OUTPUT_SHAPE = {
    "obligations": [
        {
            "id": "obligation1",
            "action": "short verb phrase (e.g. Pay Invoices, Audit Records)",
            "summary": "one short sentence paraphrasing the duty",
            "text": "verbatim substring copied exactly from a paragraph",
            "obligor": "party-1 | null",
            "beneficiary": "party-2 | null",
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
            "obligor": "party-1 | null",
            "beneficiary": "party-2 | null",
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
            "obligor": "party-1 | null",
            "beneficiary": "party-2 | null",
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
            "gates": "obligation1 | clause-1",
            "paragraphs": [0],
        }
    ],
    "references": [
        {
            "id": "reference1",
            "name": "ISO 27001 | GDPR | Delaware General Corporation Law",
            "citation": "Article 30 | Section 262 | null",
            "citedBy": "obligation1 | clause-1",
            "paragraphs": [0],
        }
    ],
    "values": [
        {
            "id": "value1",
            "valueType": "Currency | Percentage | Duration | Quantity",
            "amount": "5,000,000",
            "unit": "USD | % | days",
            "quantifies": "obligation1 | clause-1",
            "paragraphs": [0],
        }
    ],
    "relations": [
        {
            "type": " | ".join(RELATION_TYPES),
            "source": "obligation1 | clause-1",
            "target": "clause-4 | term-2",
            "evidence": "verbatim substring that states the link",
            "paragraphs": [0],
        }
    ],
}

CONDITION_OPERATORS: tuple[str, ...] = ("IF", "UNLESS", "UNTIL", "UPON")


def _field_schema(field: str, example: object, closed: dict[str, list[str]]) -> dict[str, object]:
    if field in closed:
        if not closed[field]:
            # Nothing to choose from — no party found, no clause numbered: only null fits.
            return {"type": "null"}
        # anyOf rather than an enum holding null: the form strict mode documents.
        values = {"type": "string", "enum": closed[field]}
        return {"anyOf": [values, {"type": "null"}]} if example is None or "null" in str(example) else values
    if field == "id":
        return {"type": "string"}
    if isinstance(example, list):
        item_is_int = bool(example) and isinstance(example[0], int)
        return {"type": "array", "items": {"type": "integer" if item_is_int else "string"}}
    if isinstance(example, int):
        return {"type": ["integer", "null"]}
    return {"type": ["string", "null"]}


def _json_schema(name: str, shape: dict, closed: dict[str, dict[str, list[str]]]) -> dict[str, object]:
    """A shape as a strict JSON schema: the prompt shows the shape, the API enforces it.

    Strict mode wants every field required, so "unknown" is a null value, never a missing
    key. closed[collection][field] lists the only values a field may take.
    """
    properties: dict[str, object] = {}
    for collection, (example,) in shape.items():
        fields = closed.get(collection, {})
        item_properties = {field: _field_schema(field, value, fields) for field, value in example.items()}
        properties[collection] = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": item_properties,
                "required": list(item_properties),
                "additionalProperties": False,
            },
        }
    return {
        "name": name,
        "schema": {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False},
    }


def skeleton_json_schema(clause_ids: list[str]) -> dict[str, object]:
    return _json_schema("contract_skeleton", SKELETON_SHAPE, {"clauseHeadings": {"clause": clause_ids}})


def block_json_schema(party_ids: list[str], clause_ids: list[str], term_ids: list[str]) -> dict[str, object]:
    """The block schema for one contract: a party field can only name a party the skeleton
    found, and a relation can only land on a clause or term that exists."""
    parties = {"obligor": party_ids, "beneficiary": party_ids}
    closed: dict[str, dict[str, list[str]]] = {kind: parties for kind in ("obligations", "rights", "prohibitions")}
    closed["conditions"] = {"operator": list(CONDITION_OPERATORS)}
    closed["relations"] = {"type": list(RELATION_TYPES), "target": clause_ids + term_ids}
    return _json_schema("contract_block", OUTPUT_SHAPE, closed)
