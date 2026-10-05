from abc import ABC, abstractmethod
from typing import Any


class LLMOutputTruncated(RuntimeError):
    """The reply hit the output token limit. Asking again gets the same cut, so callers
    should not retry it."""


class LLMProvider(ABC):
    name: str

    @abstractmethod
    def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        json_schema: dict[str, Any] | None = None,
    ) -> str:
        """json_schema: {"name": ..., "schema": ...}; when given, the reply is guaranteed to
        parse as that schema instead of being asked for it in the prompt."""
        raise NotImplementedError
