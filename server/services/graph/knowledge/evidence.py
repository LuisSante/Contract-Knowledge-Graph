from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

"""
Verification of the verbatim spans the extraction claims.

The prompt already demands an exact substring with no ellipsis, and the model still
breaks it on roughly a third of the statements — so the rule is enforced here rather
than asked for again. Two things come out of that:

- the anchor is *derived* from where the span is actually found, instead of trusting the
  paragraph index the model declared. On the reference contract four statements pointed
  at the section heading rather than the body that holds the quote.
- a span the model elided is split on the ellipsis and each fragment located on its own,
  which recovers the quote minus the part it chose to drop.
"""

# A fragment shorter than this anchors nothing: it would match half the contract.
MIN_FRAGMENT_CHARS = 15

_ELLIPSIS = re.compile(r"\s*(?:\.{3,}|…)\s*")


@dataclass(frozen=True)
class EvidenceMatch:
    """Where a claimed span really is, as opposed to where it was said to be."""

    spans: list[str]
    paragraph_ids: list[str]
    verified: bool


_UNVERIFIED = EvidenceMatch(spans=[], paragraph_ids=[], verified=False)


def _pattern(span: str) -> re.Pattern[str] | None:
    cleaned = span.strip()
    if len(cleaned) < MIN_FRAGMENT_CHARS:
        return None
    # Whitespace is the renderer's business — line breaks and non-breaking spaces land
    # wherever it decides — so a run in the span matches any run in the paragraph.
    return re.compile(
        r"\s+".join(re.escape(part) for part in cleaned.split()), re.IGNORECASE
    )


def _locate(span: str, paragraphs: Sequence[tuple[str, str]]) -> str | None:
    pattern = _pattern(span)
    if pattern is None:
        return None
    for paragraph_id, text in paragraphs:
        if pattern.search(text):
            return paragraph_id
    return None


def verify_evidence(span: str, paragraphs: Sequence[tuple[str, str]]) -> EvidenceMatch:
    """Locate `span` among `(paragraph_id, text)` pairs, splitting an ellipsis if needed."""
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
    # Partial recovery would leave a quote that reads as continuous but is not.
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
    """
    Resolve the provenance of one claimed span.

    Returns the paragraph ids to store, the verbatim fragments that were found, and
    whether the span verified — `None` when there was nothing to check. An unverified
    span keeps the declared ids: it is flagged, not silently discarded, because the
    statement may still be sound even when its quote is a paraphrase.
    """
    if not span.strip():
        return declared_paragraph_ids, [], None
    match = verify_evidence(span, paragraphs)
    if match.verified:
        return match.paragraph_ids, match.spans, True
    return declared_paragraph_ids, [], False
