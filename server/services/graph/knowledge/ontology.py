from __future__ import annotations

# Deontic modality of a provision.
PROVISION_TYPES: tuple[str, ...] = ("obligation", "right", "prohibition")

# Human-readable description of each provision type, injected into the prompt.
PROVISION_TYPE_GUIDE: dict[str, str] = {
    "obligation": "a duty the obligor party MUST perform ('shall', 'must', 'agrees to').",
    "right": "an entitlement/permission the beneficiary party HOLDS ('may', 'is entitled to').",
    "prohibition": "a restriction the obligor party MUST NOT breach ('shall not', 'may not').",
}

OUTPUT_SHAPE = {
    "parties": [
        {
            "id": "P1",
            "name": "full legal name as written",
            "role": "short role label (e.g. Company, Distributor, Supplier)",
            "aliases": ["defined-term or short name used for this party"],
            "paragraphs": [0],
        }
    ],
    "clauses": [
        {
            "id": "C1",
            "ref": "Section 3.2 | Article 5 | null",
            "heading": "clause heading if any",
            "paragraphs": [0],
        }
    ],
    "provisions": [
        {
            "id": "V1",
            "type": "obligation | right | prohibition",
            "summary": "one short sentence paraphrasing the duty/right/restriction",
            "text": "verbatim substring copied exactly from a paragraph",
            "obligor": "P1 | null",
            "beneficiary": "P2 | null",
            "clause": "C1 | null",
            "paragraphs": [0],
        }
    ],
}
