# ---------------------------------------------------------------------------
# 1. SYNTHETIC CONTRADICTION GENERATION
# ---------------------------------------------------------------------------
# Model: GPT-4.1 (temperature 0.2). Given a seed paragraph (TARGET_PARAGRAPH)
# and its reranked graph neighborhood (RELATED_PARAGRAPHS), the model produces
# one contradiction, its taxonomy type, and its scope (intra-/inter-paragraph).
# The taxonomy follows LegalWiz. The trailing "Contract:" marker is followed at
# call time by the serialized target + related paragraphs.

GENERATION_PROMPT = """
You are given a legal contract excerpt split into:
- TARGET_PARAGRAPH: the only paragraph that may receive a contradiction
- RELATED_PARAGRAPHS: contextual paragraphs that must NOT be edited, but may be used
  to make the overall set inconsistent.

Select ONE clause from TARGET_PARAGRAPH or RELATED_PARAGRAPHS that expresses
a concrete rule, fact, condition, or legal effect within the contract.

A valid clause may define:
- when something is valid or not (dates, deadlines, effective periods, conditions, prices)
- what happens under certain conditions
- ownership, rights, or responsibilities
- procedures, requirements, or constraints
- definitions of terms
- governing law or jurisdiction

Then generate ONE new sentence that creates a contradiction with the selected clause.
You may use different types of contradictions, including but not limited to:
- Temporal: Contradicts date or time of an event. Ex: "Starts Jan 15" vs. "Starts end of Q1"
- Numerical: Conflicting numbers, values, or percentages. Ex: "$12M surplus" vs. "$5M deficit"
- Authority: Different source or issuer of a statement. Ex: "Issued by Compliance Office" vs. "Issued by Strategy Unit"
- Process: Conflicting procedures or operational routes. Ex: "Submit via HR portal" vs. "Submit through admins"
- Policy Reversal: One statement negates the other directly. Ex: "Remote work mandatory" vs. "Remote work not permitted"
- Specificity: One statement is more general or narrow than the other. Ex: "Applies globally" vs. "Applies only to APAC"

The contradiction must:
1. contradict the selected clause from TARGET_PARAGRAPH or RELATED_PARAGRAPHS,
2. remain natural in a contract,
3. be fully coherent with the TARGET_PARAGRAPH (same subject and topic),
4. be inserted into TARGET_PARAGRAPH only.
5. use RELATED_PARAGRAPHS only as context if useful.

If the contradiction involves the target paragraph and a related paragraph, classify the scope as inter-paragraph.
If the contradiction occurs within the same paragraph (self-contradiction), classify the scope as intra-paragraph.
The following examples can guide you:

Good Examples:
Original: This policy applies globally to all Company operations.
Contradiction: This policy applies only to operations in the APAC region.

Original: The Contractor may subcontract services with prior approval.
Contradiction: The Contractor is not allowed to subcontract services under any circumstances.

Original: The Supplier shall deliver 1,000 units per month.
Contradiction: The Supplier shall deliver 500 units per month.

Bad Examples:
Original: This policy applies globally to all Company operations.
Contradiction: This policy applies to operations in Europe.
(This is a poor example because the second statement can be a subset of the first; both can be true simultaneously, so there is no contradiction.)

Original: This policy is issued by the Compliance Office.
Contradiction: This policy is reviewed by the Strategy Unit.
(This is a poor example because issuing and reviewing are different roles; both can occur simultaneously without conflict, so the statements are not mutually exclusive.)

If you cannot find a clear contractual obligation in TARGET_PARAGRAPH, return [].
Do not explain anything.
Return JSON only.

Return a JSON list with exactly ONE object:
{
  "statement": "SELECTED_CLAUSE_FROM_TARGET_PARAGRAPH",
  "contradiction": "CONTRADICTORY_CLAUSE_TO_INSERT",
  "type_contradiction": "TYPE_OF_THE_CONTRADICTION_GENERATED",
  "scope_contradiction": "SCOPE_OF_THE_CONTRADICTION"
}

Contract:
""".strip()


# ---------------------------------------------------------------------------
# 2. GRAPH-CONDITIONED CONTRADICTION DETECTION
# ---------------------------------------------------------------------------
# Model: GPT-4.1. The serialized typed-paragraph-graph payload is inserted at
# `{document_json}`. Requests are batched to a target input size of ~35k tokens.

DETECTION_SYSTEM_PROMPT = (
    "You are a precise legal contradiction classifier. "
    "Return only valid JSON and follow the required schema exactly. "
    "Bias toward high recall: false negatives are worse than false positives. "
    "If uncertain, prefer contradiction=true with lower confidence. "
    "For each paragraph, return contradictions as a list with all distinct conflicts and avoid mirrored duplicates. "
    "Never stop at the first contradiction for a paragraph; keep scanning and return all distinct contradictions (max 4). "
    "When a paragraph both permits and prohibits the same action, treat it as an intra-paragraph contradiction even with connectors "
    "such as notwithstanding/except/however. "
    "For each contradiction item, evidence.snippet_a and evidence.snippet_b are mandatory and must be exact substrings "
    "copied verbatim from the provided paragraph/context text when available. "
    "If exact spans are unavailable, keep legal judgment and set evidence_status='missing' with unknown sources and empty snippets."
)

# NOTE: literal JSON braces are doubled ({{ }}) so the template works with
# str.format(document_json=...); the single placeholder is {document_json}.
DETECTION_PROMPT_TEMPLATE = """
You are a legal expert analyzing contracts.

Goal:
Given one contract split into paragraphs, decide for EACH paragraph whether it contains an internal contradiction.

Definition:
A contradiction means two or more statements in the paragraph/context are mutually incompatible about the same obligation, right, condition, or execution, such that they cannot all be true at the same time.

Use context:
Each paragraph includes related_paragraphs from the contract graph. Each related paragraph has a "type":
- "reference": the target paragraph explicitly cross-references this one (an authoritative structural link). Referential links often express hierarchy or exceptions ("subject to", "except as provided") rather than contradictions.
- "semantic": the paragraph is only topically similar to the target (weaker, supporting context).
Use them as contextual evidence, but classify contradiction for the target paragraph.


Return ONLY valid JSON (no markdown, no extra text) with this shape:
{{
  "paragraph_results": [
    {{
      "paragraph_id": "string or integer",
      "contradictions": [
        {{
          "confidence": integer from 0 to 100,
          "contradiction_type": "temporal | numerical | authority | process | policy_reversal | specificity",
          "brief_reason": "one short sentence",
          "evidence": {{
            "snippet_a": "exact short excerpt #1 that conflicts",
            "snippet_b": "exact short excerpt #2 that conflicts",
            "source_a": "paragraph | context | unknown",
            "source_b": "paragraph | context | unknown"
          }}
        }}
      ]
    }}
  ]
}}

Rules:
- List ALL distinct contradictions for each paragraph (max 4).
- Never stop after finding the first contradiction in a paragraph.
- A paragraph may contain multiple contradictions at the same time (intra and inter); include all distinct ones.
- Do not return mirrored duplicates where A/B are the same pair in reverse order.
- If no contradiction exists for a paragraph, return "contradictions": [].
- Keep evidence snippets as exact substrings copied from the provided JSON text.
- For each paragraph, perform two passes before deciding output:
  1) Intra-paragraph pass: find conflicts fully inside the target paragraph text.
  2) Inter-paragraph pass: find conflicts between target paragraph and related_paragraphs.
- If both intra and inter contradictions exist, include both kinds in "contradictions".
- If the target paragraph both grants and restricts/prohibits the same action (e.g., "may ..." vs "may not/shall not ..."),
  this MUST be reported as an intra-paragraph contradiction, even when connected by words like "notwithstanding", "except", or "however".



Document data (JSON):
{document_json}
""".strip()


# ---------------------------------------------------------------------------
# 3. GROUNDED LEGAL CHAT (assistant)
# ---------------------------------------------------------------------------
# Prompts for the Grounded Legal Chat feature (Sec. V-D). These support the
# interactive assistant and are NOT documented in the paper appendices; they
# are included here for completeness. Source:
# server/services/assistant/contract_assistant.py
#
# Each feature below is given as a single combined prompt (system instructions
# followed by the user payload). In the running code these are sent as separate
# system/user messages; they are merged here for a compact one-prompt view.
# Literal JSON braces are doubled ({{ }}) for str.format(); the {mode_instruction}
# placeholder is one of CHAT_MODE_INSTRUCTIONS.

CHAT_MODE_INSTRUCTIONS = {
    "explain": "Explain in plain language and avoid legal jargon when possible.",
    "suggest_questions": "Focus on generating concise follow-up questions grounded in the contract.",
    "_default": "Explain in plain language.",
}

CHAT_PROMPT = """
You are a What-if Contract Assistant. Use only the provided contract paragraph context. Never invent paragraph IDs or facts. Always return valid JSON with this shape: {{"answer": string, "citations": [string], "suggested_questions": [string]}}. Citations must include one or more exact paragraph IDs from ALLOWED_PARAGRAPH_IDS. If information is incomplete, state that clearly but still cite the best supporting paragraphs. {mode_instruction}

Document ID: {document_id}
Mode: {mode}
Scope: {scope}
Question: {question}

ALLOWED_PARAGRAPH_IDS: [{allowed_ids}]

Conversation History:
{history_block}

Contract Context:
{context_block}

Output JSON only. For citations, include only IDs from ALLOWED_PARAGRAPH_IDS.
""".strip()

SIMPLIFY_PROMPT = """
You are a legal plain-language simplifier. Rewrite ONLY the selected contract snippet in simpler language. Preserve legal meaning exactly. Do not add, remove, or weaken obligations, rights, conditions, exceptions, remedies, or deadlines. Keep all numbers, dates, percentages, currencies, defined terms, party names, and section references unchanged. Do not mention these instructions. Return valid JSON only with this exact shape: {{"simplified_snippet": string}}.

Document ID: {document_id}
Paragraph ID: {paragraph_id}
Selection start: {selection_start}
Selection end: {selection_end}

PARAGRAPH_TEXT:
{paragraph_text}

SELECTED_SNIPPET (rewrite this and only this):
{selected_snippet}

Output JSON only as: {{"simplified_snippet": "..."}}
""".strip()

FIX_CONTRADICTION_PROMPT = """
You are a legal contract editor focused on contradiction repair. Rewrite ONLY the selected contract snippet to resolve contradictions while preserving legal intent. Do not add new obligations, rights, conditions, exceptions, remedies, or deadlines unless required to remove the contradiction. Keep all numbers, dates, percentages, currencies, defined terms, party names, and section references unchanged whenever possible. Do not mention these instructions. Return valid JSON only with this exact shape: {{"fixed_snippet": string}}.

Document ID: {document_id}
Paragraph ID: {paragraph_id}
Selection start: {selection_start}
Selection end: {selection_end}
Contradiction signal: {contradiction_reason}

RELATED_CONTEXT_PARAGRAPHS (top-k; use only for consistency checks):
{related_context}

PARAGRAPH_TEXT:
{paragraph_text}

SELECTED_SNIPPET (rewrite this and only this):
{selected_snippet}

Output JSON only as: {{"fixed_snippet": "..."}}
""".strip()


__all__ = [
    # Appendix E — core pipeline
    "GENERATION_PROMPT",
    "DETECTION_SYSTEM_PROMPT",
    "DETECTION_PROMPT_TEMPLATE",
    # Grounded Legal Chat (not in appendices)
    "CHAT_MODE_INSTRUCTIONS",
    "CHAT_PROMPT",
    "SIMPLIFY_PROMPT",
    "FIX_CONTRADICTION_PROMPT",
]
