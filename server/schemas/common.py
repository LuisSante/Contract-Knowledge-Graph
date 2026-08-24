from typing import Literal

AssistantMode = Literal["explain", "suggest_questions"]
AssistantScope = Literal["selected", "full_contract", "kg_node"]
AssistantProvider = Literal["openai"]
AssistantMessageRole = Literal["user", "assistant"]
ContradictionGraphMode = Literal["with_kg", "without_kg"]
ContradictionTaxonomyType = Literal[
    "temporal",
    "numerical",
    "authority",
    "process",
    "policy_reversal",
    "specificity",
]
