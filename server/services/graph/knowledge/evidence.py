from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

MIN_FRAGMENT_CHARS = 15

_ELLIPSIS = re.compile(r"\s*(?:\.{3,}|…)\s*")


@dataclass(frozen=True)
class EvidenceMatch:
    spans: list[str]
    paragraph_ids: list[str]
    verified: bool


_UNVERIFIED = EvidenceMatch(spans=[], paragraph_ids=[], verified=False)


def _pattern(span: str) -> re.Pattern[str] | None:
    cleaned = span.strip()
    if len(cleaned) < MIN_FRAGMENT_CHARS:
        return None
    return re.compile(r"\s+".join(re.escape(part) for part in cleaned.split()), re.IGNORECASE)


def _locate(span: str, paragraphs: Sequence[tuple[str, str]]) -> str | None:
    pattern = _pattern(span)
    if pattern is None:
        return None
    for paragraph_id, text in paragraphs:
        if pattern.search(text):
            return paragraph_id
    return None


def verify_evidence(span: str, paragraphs: Sequence[tuple[str, str]]) -> EvidenceMatch:
    whole = span.strip()
    if not whole:
        return _UNVERIFIED

    found = _locate(whole, paragraphs)
    if found:
        return EvidenceMatch(spans=[whole], paragraph_ids=[found], verified=True)

    fragments = [
        fragment
        for fragment in (part.strip() for part in _ELLIPSIS.split(whole))
        if len(fragment) >= MIN_FRAGMENT_CHARS
    ]
    if len(fragments) < 2:
        return _UNVERIFIED

    located = [(fragment, _locate(fragment, paragraphs)) for fragment in fragments]
    if any(paragraph_id is None for _, paragraph_id in located):
        return _UNVERIFIED

    return EvidenceMatch(
        spans=[fragment for fragment, _ in located],
        paragraph_ids=sorted({paragraph_id for _, paragraph_id in located if paragraph_id}),
        verified=True,
    )


def anchor_to_evidence(
    span: str,
    declared_paragraph_ids: list[str],
    paragraphs: Sequence[tuple[str, str]],
) -> tuple[list[str], list[str], bool | None]:
    if not span.strip():
        return declared_paragraph_ids, [], None
    match = verify_evidence(span, paragraphs)
    if match.verified:
        return match.paragraph_ids, match.spans, True
    return declared_paragraph_ids, [], False
