from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

RECIPROCAL = re.compile(r"\b(?:each|either|both)\s+part(?:y|ies)\b|\bthe other(?:'s)?\b", re.I)

# El único documento en estudio. Los demás grafos de `infra/json/kg/` se midieron con
# versiones distintas del extractor, así que sus números no son comparables con estos.
STUDY_DOC = "root_BELLICUM_MILTENYI_Supply_Agreement_Summary"

SHORT_NAMES = {STUDY_DOC: "Bellicum–Miltenyi (resumen)"}

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


def gfm(headers: list[str], rows: list[list[str]]) -> str:
    """
    A Markdown table. With a single document the table is transposed — one column of
    numbers under a name is a list, not a table.
    """
    if len(rows) == 1:
        headers, rows = ["medida", rows[0][0]], [
            [h, v] for h, v in zip(headers[1:], rows[0][1:])
        ]
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join(lines)


def inject(doc: Path, tables: dict[str, str]) -> None:
    """
    Replace what sits between `<!-- tabla:N -->` and `<!-- /tabla:N -->`, leaving the
    prose around it alone. The numbers in the documentation are generated; the
    sentences that interpret them are not.
    """
    text = doc.read_text(encoding="utf-8")
    for key, table in tables.items():
        start, end = f"<!-- tabla:{key} -->", f"<!-- /tabla:{key} -->"
        if start not in text or end not in text:
            print(f"  aviso: {doc.name} no tiene los marcadores de la tabla {key}")
            continue
        head, rest = text.split(start, 1)
        _, tail = rest.split(end, 1)
        text = f"{head}{start}\n{table}\n{end}{tail}"
    doc.write_text(text, encoding="utf-8")
    print(f"  tablas escritas en {doc}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kg-dir", type=Path, default=ROOT / "infra/json/kg")
    parser.add_argument(
        "--write",
        type=Path,
        nargs="?",
        const=ROOT / "docs/medidas/corpus.md",
        help="inyecta las tablas en el documento, entre sus marcadores",
    )
    parser.add_argument(
        "--all", action="store_true", help=f"mide todos los grafos, no solo {STUDY_DOC}"
    )
    args = parser.parse_args()

    paths = sorted(args.kg_dir.glob("*.json"))
    if not args.all:
        paths = [p for p in paths if p.stem == STUDY_DOC]
    results = [measure(p) for p in paths]
    if not results:
        print(f"No knowledge graphs in {args.kg_dir}")
        return 1

    def name(r: dict) -> str:
        return SHORT_NAMES.get(r["doc"], r["doc"][:38])

    columns = {
        "1": (
            ["contrato", "aristas", "`is_part_of`", "parte", "informativas", "% redundante"],
            [[name(r), str(r["edges"]), str(r["positional"]), str(r["party"]),
              f"**{r['informative']}**", f"{r['redundant_pct']:.1f}%"] for r in results],
        ),
        "2": (
            ["contrato", "cláusulas", "vacías", "enunciados", "máx/cláusula"],
            [[name(r), str(r["clauses"]), str(r["empty_clauses"]),
              str(r["statements"]), str(r["max_per_clause"])] for r in results],
        ),
        "3": (
            ["contrato", "ambas partes", "%", "sin cláusula", "sin parte", "isla", "enunc. en isla"],
            [[name(r), str(r["both"]), f"{r['both_pct']:.0f}%", str(r["unfiled"]),
              str(r["unattributed"]), str(r["island_parties"]), str(r["island_statements"])]
             for r in results],
        ),
    }

    if args.write:
        inject(args.write, {key: gfm(headers, rows) for key, (headers, rows) in columns.items()})

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
