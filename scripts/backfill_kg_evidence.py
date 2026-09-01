from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from services.graph.knowledge.evidence import anchor_to_evidence  # noqa: E402

DEONTIC_KEYS = ("obligations", "rights", "prohibitions")
# Every field the prompt declares verbatim, with the collection it lives in.
VERBATIM_FIELDS = (
    ("conditions", "trigger"),
    ("definedTerms", "definition"),
)


def load_paragraphs(path: Path) -> list[tuple[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data if isinstance(data, list) else data.get("paragraphs") or data.get("nodes") or []
    return [
        (str(row.get("id")), str(row.get("text") or ""))
        for row in rows
        if row.get("id") and row.get("text")
    ]


def backfill(kg: dict, paragraphs: list[tuple[str, str]]) -> dict[str, int]:
    stats = {"checked": 0, "reanchored": 0, "split": 0, "unverified": 0}

    for key in DEONTIC_KEYS:
        for node in kg.get(key) or []:
            stats["checked"] += 1
            declared = list(node.get("paragraphIds") or [])
            pids, spans, verified = anchor_to_evidence(node.get("text") or "", declared, paragraphs)
            node["evidenceVerified"] = verified
            node["evidenceSpans"] = spans
            if verified is False:
                stats["unverified"] += 1
                continue
            if len(spans) > 1:
                stats["split"] += 1
            if pids and pids != declared:
                stats["reanchored"] += 1
                node["paragraphIds"] = pids

    # Conditions and defined terms carry verbatim spans too, but no UI reads a
    # verification flag off them yet — only the anchor is worth correcting.
    for key, field in VERBATIM_FIELDS:
        for node in kg.get(key) or []:
            declared = list(node.get("paragraphIds") or [])
            pids, _, verified = anchor_to_evidence(node.get(field) or "", declared, paragraphs)
            if verified and pids and pids != declared:
                stats["reanchored"] += 1
                node["paragraphIds"] = pids

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kg-dir", type=Path, default=ROOT / "infra/json/kg")
    parser.add_argument("--paragraphs-dir", type=Path, default=ROOT / "infra/json/paragraphs")
    parser.add_argument("--dry-run", action="store_true", help="report without writing")
    args = parser.parse_args()

    total = {"checked": 0, "reanchored": 0, "split": 0, "unverified": 0}
    for kg_path in sorted(args.kg_dir.glob("*.json")):
        paragraphs_path = args.paragraphs_dir / kg_path.name
        if not paragraphs_path.exists():
            print(f"  skip {kg_path.name}: no paragraph dump")
            continue
        paragraphs = load_paragraphs(paragraphs_path)
        if not paragraphs:
            print(f"  skip {kg_path.name}: empty paragraph dump")
            continue

        kg = json.loads(kg_path.read_text(encoding="utf-8"))
        stats = backfill(kg, paragraphs)
        for name, value in stats.items():
            total[name] += value
        if not args.dry_run:
            kg_path.write_text(
                json.dumps(kg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
            )
        print(
            f"  {kg_path.name[:52]:54} {stats['checked']:4} checked ·"
            f" {stats['reanchored']:3} re-anchored ·"
            f" {stats['split']:3} split ·"
            f" {stats['unverified']:3} unverified"
        )

    print(
        f"\ntotal: {total['checked']} statements ·"
        f" {total['reanchored']} re-anchored ·"
        f" {total['split']} split ·"
        f" {total['unverified']} unverified"
        + (" (dry run, nothing written)" if args.dry_run else "")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
