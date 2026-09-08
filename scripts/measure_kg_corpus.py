from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

RECIPROCAL = re.compile(r"\b(?:each|either|both)\s+part(?:y|ies)\b|\bthe other(?:'s)?\b", re.I)

POSITIONAL_EDGES = ("is_part_of",)
PARTY_EDGES = ("assigns_obligation_to", "grants_right_to")


def deontic(kg: dict) -> list[dict]:
    return [
        dict(node, kind=key[:-1])
        for key in ("obligations", "rights", "prohibitions")
        for node in kg[key]
    ]


def owner_of(statement: dict) -> str | None:
    return statement.get("benefitPartyId") if statement["kind"] == "right" else statement.get("burdenPartyId")


def measure(path: Path) -> dict:
    kg = json.loads(path.read_text(encoding="utf-8"))
    statements = deontic(kg)
    edge_types = collections.Counter(edge["type"] for edge in kg["edges"])

    positional = sum(edge_types[t] for t in POSITIONAL_EDGES)
    party = sum(edge_types[t] for t in PARTY_EDGES)
    total = sum(edge_types.values())

    involvement = collections.Counter()
    for v in statements:
        for pid in (v.get("burdenPartyId"), v.get("benefitPartyId")):
            if pid:
                involvement[pid] += 1
    dyad = [pid for pid, _ in involvement.most_common(2)]

    adjacency = collections.defaultdict(set)
    for edge in kg["edges"]:
        adjacency[edge["source"]].add(edge["target"])
        adjacency[edge["target"]].add(edge["source"])
    seen, stack = set(dyad[:1]), list(dyad[:1])
    while stack:
        for neighbour in adjacency[stack.pop()]:
            if neighbour not in seen:
                seen.add(neighbour)
                stack.append(neighbour)
    island = [
        p["id"]
        for p in kg["parties"]
        if RECIPROCAL.search(p.get("name") or "") and p["id"] not in seen
    ]

    both_parties = [
        v
        for v in statements
        if v.get("burdenPartyId")
        and v.get("benefitPartyId")
        and v["burdenPartyId"] != v["benefitPartyId"]
    ]
    shared = [v for v in statements if owner_of(v) not in dyad]
    unattributed = [
        v for v in shared if not RECIPROCAL.search(f"{v.get('text', '')} {v.get('summary', '')}")
    ]
    per_clause = collections.Counter(v["clauseId"] for v in statements if v.get("clauseId"))

    n = len(statements) or 1
    return {
        "doc": path.stem,
        "clauses": len(kg["clauses"]),
        "empty_clauses": len(kg["clauses"]) - len(per_clause),
        "statements": len(statements),
        "max_per_clause": max(per_clause.values(), default=0),
        "edges": total,
        "positional": positional,
        "party": party,
        "informative": total - positional - party,
        "redundant_pct": 100 * (positional + party) / total if total else 0.0,
        "both": len(both_parties),
        "both_pct": 100 * len(both_parties) / n,
        "unfiled": sum(1 for v in statements if not v.get("clauseId")),
        "unattributed": len(unattributed),
        "island_parties": len(island),
        "island_statements": sum(1 for v in statements if owner_of(v) in island),
    }


def table(title: str, headers: list[str], widths: list[int], rows: list[list[str]]) -> None:
    print(f"\n{title}\n")
    print("".join(h.ljust(w) if i == 0 else h.rjust(w) for i, (h, w) in enumerate(zip(headers, widths))))
    for row in rows:
        print("".join(c.ljust(w) if i == 0 else c.rjust(w) for i, (c, w) in enumerate(zip(row, widths))))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kg-dir", type=Path, default=ROOT / "infra/json/kg")
    args = parser.parse_args()

    results = [measure(p) for p in sorted(args.kg_dir.glob("*.json"))]
    if not results:
        print(f"No knowledge graphs in {args.kg_dir}")
        return 1

    name = lambda r: r["doc"][:38]
    table(
        "TABLE 1 — Edge budget",
        ["contract", "edges", "is_part_of", "party", "informative", "% redundant"],
        [40, 8, 12, 8, 13, 13],
        [
            [name(r), str(r["edges"]), str(r["positional"]), str(r["party"]),
             str(r["informative"]), f"{r['redundant_pct']:.1f}%"]
            for r in results
        ],
    )
    table(
        "TABLE 2 — Contract shape",
        ["contract", "clauses", "empty", "statements", "max/clause"],
        [40, 9, 8, 12, 12],
        [
            [name(r), str(r["clauses"]), str(r["empty_clauses"]),
             str(r["statements"]), str(r["max_per_clause"])]
            for r in results
        ],
    )
    table(
        "TABLE 3 — Correlativity and gaps",
        ["contract", "both parties", "%", "no clause", "no party", "island", "island stmts"],
        [40, 14, 7, 11, 10, 8, 14],
        [
            [name(r), str(r["both"]), f"{r['both_pct']:.0f}%", str(r["unfiled"]),
             str(r["unattributed"]), str(r["island_parties"]), str(r["island_statements"])]
            for r in results
        ],
    )
    print(f"\n{len(results)} contract(s) measured.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
