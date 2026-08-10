from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Simple provider strategy interface for chat-completion style models."""

    name: str

    @abstractmethod
    def generate(self, *, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        raise NotImplementedError
