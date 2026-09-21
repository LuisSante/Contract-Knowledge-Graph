import json
import logging
import re
from collections import Counter
from pathlib import Path

logger = logging.getLogger(__name__)

PAGE_NUMBER_ONLY_RE = re.compile(r"^(?:\d+|[ivxlcdm]{1,8})$", re.IGNORECASE)
PAGE_LABEL_RE = re.compile(r"^(?:page|pagina|p[aá]g\.?)\s*\d+(?:\s*(?:\/|of|de)\s*\d+)?$", re.IGNORECASE)
BOUNDARY_SCAN_LINES = 3


def normalize_text(raw: str) -> str:
    return re.sub(r"\s+", " ", raw or "").strip()


def is_page_marker(text: str) -> bool:
    if not text:
        return False
    return bool(PAGE_NUMBER_ONLY_RE.match(text) or PAGE_LABEL_RE.match(text))


def is_repeated_boundary_candidate(text: str) -> bool:
    if is_page_marker(text):
        return True
    if len(text) > 180:
        return False
    words = [token for token in text.split(" ") if token]
    return 0 < len(words) <= 22


def detect_repeated_boundary_texts(pages: list[dict]):
    boundaries_by_page: dict[int, dict[str, list[tuple[int, str]]]] = {}
    top_counts: Counter[str] = Counter()
    bottom_counts: Counter[str] = Counter()

    for page_idx, page in enumerate(pages):
        non_empty_entries: list[tuple[int, str]] = []
        for element_idx, element in enumerate(page.get("elements", [])):
            text = normalize_text(str(element.get("text", "")))
            if text:
                non_empty_entries.append((element_idx, text))

        if not non_empty_entries:
            continue

        top_entries = non_empty_entries[:BOUNDARY_SCAN_LINES]
        bottom_entries = non_empty_entries[max(len(non_empty_entries) - BOUNDARY_SCAN_LINES, 0) :]
        top_entries_keyed = [(idx, text.lower()) for idx, text in top_entries]
        bottom_entries_keyed = [(idx, text.lower()) for idx, text in bottom_entries]
        boundaries_by_page[page_idx] = {
            "top": top_entries_keyed,
            "bottom": bottom_entries_keyed,
        }
        for _, text_key in top_entries_keyed:
            top_counts[text_key] += 1
        for _, text_key in bottom_entries_keyed:
            bottom_counts[text_key] += 1

    repeated_top = {text for text, count in top_counts.items() if count >= 2 and is_repeated_boundary_candidate(text)}
    repeated_bottom = {text for text, count in bottom_counts.items() if count >= 2 and is_repeated_boundary_candidate(text)}

    return boundaries_by_page, repeated_top, repeated_bottom


def build_paragraphs(pages: list[dict], doc_id: str) -> list[dict]:
    boundaries_by_page, repeated_top_texts, repeated_bottom_texts = detect_repeated_boundary_texts(pages)

    all_paragraphs_input: list[dict] = []

    for page_idx, page in enumerate(pages):
        boundary = boundaries_by_page.get(page_idx, {})
        top_boundary = boundary.get("top", [])
        bottom_boundary = boundary.get("bottom", [])

        for idx, el in enumerate(page.get("elements", [])):
            text_content = normalize_text(str(el.get("text", "")))
            if not text_content:
                continue
            if is_page_marker(text_content):
                continue

            text_key = text_content.lower()
            if text_key in repeated_top_texts and any(
                idx == boundary_idx and text_key == boundary_text for boundary_idx, boundary_text in top_boundary
            ):
                continue
            if text_key in repeated_bottom_texts and any(
                idx == boundary_idx and text_key == boundary_text for boundary_idx, boundary_text in bottom_boundary
            ):
                continue

            all_paragraphs_input.append(
                {
                    "id": el.get("id"),
                    "documentId": doc_id,
                    "text": text_content,
                    "page": page.get("pageNumber"),
                    "paragraph_enum": idx,
                }
            )

    return all_paragraphs_input


SECTION_HEADING_RE = re.compile(r"^\s*(?:(?:ARTICLE|Article|SECTION|Section)\s+)?(\d+(?:\.\d+){0,3})\s*([.)])?\s+(\S.*)$")
HEADING_PREVIEW_CHARS = 70


def _accept_heading(text: str) -> tuple[str, str] | None:
    """A numbered heading, or None. A bare number with no separator is rejected:
    "30 days from the invoice date" opens a paragraph the same way "1. Term" does."""
    match = SECTION_HEADING_RE.match(text)
    if not match:
        return None
    ref, separator, rest = match.group(1), match.group(2), match.group(3)
    if not separator and "." not in ref and not text.lstrip()[:1].isalpha():
        return None
    return ref, rest[:HEADING_PREVIEW_CHARS].strip()


def _longest_numbering_run(headings: list[dict]) -> list[dict]:
    """Recitals are numbered too, and their run collides with the sections'. Splitting
    wherever the top-level number stops growing separates the two; the body is the longer."""
    runs: list[list[dict]] = []
    current: list[dict] = []
    top = 0
    for heading in headings:
        head = int(heading["ref"].split(".")[0])
        if current and "." not in heading["ref"] and head <= top:
            runs.append(current)
            current = []
        current.append(heading)
        if "." not in heading["ref"]:
            top = head
    if current:
        runs.append(current)
    return max(runs, key=len) if runs else []


def build_clause_tree(paragraphs: list[dict]) -> list[dict]:
    """Section hierarchy read off the numbering, with no model in the loop.

    The KG carries the same tree in its `Clause` nodes, but that one costs a call and
    varies between runs; this one is a function of the text, so chunking and navigation
    can rely on it being the same every time.
    """
    headings: list[dict] = []
    for row in paragraphs:
        text = normalize_text(str(row.get("text") or ""))
        accepted = _accept_heading(text)
        if accepted:
            ref, preview = accepted
            headings.append(
                {
                    "ref": ref,
                    "heading": preview,
                    "level": ref.count(".") + 1,
                    "paragraphId": row.get("id"),
                    "children": [],
                }
            )

    body = _longest_numbering_run(headings)
    by_ref = {node["ref"]: node for node in body}
    roots: list[dict] = []
    for node in body:
        parent_ref = node["ref"].rsplit(".", 1)[0] if "." in node["ref"] else None
        parent = by_ref.get(parent_ref) if parent_ref else None
        (parent["children"] if parent else roots).append(node)
    return roots


def _safe_filename(value: str) -> str:
    token = re.sub(r"[^a-zA-Z0-9_-]+", "_", (value or "").strip())
    token = re.sub(r"_+", "_", token).strip("_")
    return token or "unknown"


def save_paragraphs_dump(doc_id: str, paragraphs: list[dict], output_dir: Path) -> tuple[Path, list[dict]]:
    """Returns the dump path and the section tree stored in it, so the caller can hand
    the frontend the same tree the extraction will chunk by."""
    output_dir.mkdir(parents=True, exist_ok=True)
    tree = build_clause_tree(paragraphs)
    payload = {
        "documentId": doc_id,
        "tree": tree,
        "paragraphs": [
            {
                "id": row.get("id"),
                "text": row.get("text", ""),
                "paragraph_enum": row.get("paragraph_enum", 0),
                "page": row.get("page"),
            }
            for row in paragraphs
        ],
    }
    path = output_dir / f"{_safe_filename(doc_id)}.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    logger.info("Saved %d paragraphs to %s", len(payload["paragraphs"]), path)
    return path, tree


def load_paragraphs_dump(doc_id: str, output_dir: Path) -> list[dict]:
    path = output_dir / f"{_safe_filename(doc_id)}.json"
    if not path.exists():
        return []
    try:
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        logger.exception("Could not read the paragraph dump at %s", path)
        return []
    paragraphs = payload.get("paragraphs") if isinstance(payload, dict) else None
    if not isinstance(paragraphs, list):
        return []
    return sorted(paragraphs, key=lambda row: (row.get("page") or 0, row.get("paragraph_enum") or 0))
