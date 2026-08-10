from typing import Literal

AssistantMode = Literal["explain", "suggest_questions"]
AssistantScope = Literal["selected", "full_contract"]
AssistantProvider = Literal["openai", "gemini"]
AssistantMessageRole = Literal["user", "assistant"]
