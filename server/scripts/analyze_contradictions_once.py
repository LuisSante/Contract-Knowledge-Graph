from __future__ import annotations

import argparse
import json
from pathlib import Path

from schemas.types import ContradictionAnalysisRequest
from services.contradictions.analysis import analyze_document_contradictions


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze contradictions for all paragraphs in one GPT call using a graph payload."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to input JSON containing at least {documentId, graph}.",
    )
    parser.add_argument(
        "--output",
        required=False,
        default="contradiction_analysis_output.json",
        help="Path to write analysis output JSON.",
    )
    parser.add_argument(
        "--provider",
        required=False,
        default="openai",
        choices=["openai", "gemini"],
        help="LLM provider to use.",
    )
    parser.add_argument(
        "--temperature",
        required=False,
        type=float,
        default=0.3,
        help="Sampling temperature for the LLM request.",
    )
    parser.add_argument(
        "--model",
        required=False,
        default=None,
        help="Optional model override for the selected provider.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    with input_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    payload["provider"] = args.provider
    payload["temperature"] = args.temperature
    payload["model"] = args.model

    request = ContradictionAnalysisRequest.model_validate(payload)
    response = analyze_document_contradictions(request)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(response.model_dump(), f, ensure_ascii=False, indent=2)

    print(f"Saved {output_path}")


if __name__ == "__main__":
    main()
