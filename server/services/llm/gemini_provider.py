from __future__ import annotations

from typing import Any

from services.llm.base import LLMProvider


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, *, api_key: str, model: str = "gemini-2.5-flash"):
        try:
            from google import genai
        except ImportError as exc: 
            raise RuntimeError(
                "Gemini provider requires the `google-genai` package. "
                "Install dependencies and retry."
            ) from exc

        self._client = genai.Client(api_key=api_key)
        self._model = model

    def generate(self, *, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        prompt = (
            f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\n"
            f"USER REQUEST:\n{user_prompt}\n\n"
            "Return only the requested JSON object."
        )

        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=prompt,
                config={"temperature": temperature},
            )
        except Exception as exc: 
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

        text = self._extract_text(response)
        if not text:
            raise RuntimeError("Gemini returned an empty response")
        return text

    @staticmethod
    def _extract_text(response: Any) -> str:
        text = getattr(response, "text", None)
        if isinstance(text, str) and text.strip():
            return text.strip()

        candidates = getattr(response, "candidates", None)
        if not isinstance(candidates, list):
            return ""

        extracted: list[str] = []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None)
            if not isinstance(parts, list):
                continue
            for part in parts:
                value = getattr(part, "text", None)
                if isinstance(value, str) and value.strip():
                    extracted.append(value.strip())

        return "\n".join(extracted).strip()
