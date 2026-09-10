from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

DAMPING = 0.85
TOLERANCE = 1e-9
MAX_ITERATIONS = 200

DEONTIC_COLLECTIONS = ("obligations", "rights", "prohibitions")
NODE_COLLECTIONS = (
    "parties",
    "clauses",
    "definedTerms",
    *DEONTIC_COLLECTIONS,
    "conditions",
    "references",
    "values",
)


@dataclass(frozen=True)
class PersonalizedPageRank:
    by_clause: dict[str, float]
    by_statement: dict[str, float]
    peak: float
    iterations: int


def _node_ids(kg: dict) -> list[str]:
    return [node["id"] for collection in NODE_COLLECTIONS for node in kg.get(collection) or []]


def _statements(kg: dict) -> list[dict]:
    return [node for collection in DEONTIC_COLLECTIONS for node in kg.get(collection) or []]


def compute(kg: dict, counted: Iterable[str] | None = None) -> PersonalizedPageRank:
    """`counted` restricts the prior to the statements on screen; the walk still runs
    over the whole graph."""
    allowed = set(counted) if counted is not None else None

    members: dict[str, list[str]] = {}
    for statement in _statements(kg):
        clause_id = statement.get("clauseId")
        if not clause_id:
            continue
        if allowed is not None and statement["id"] not in allowed:
            continue
        members.setdefault(clause_id, []).append(statement["id"])
    if not members:
        return PersonalizedPageRank({}, {}, 0.0, 0)

    ids = _node_ids(kg)
    index = {node_id: position for position, node_id in enumerate(ids)}

    adjacency: list[list[int]] = [[] for _ in ids]
    for edge in kg.get("edges") or []:
        source = index.get(edge.get("source"))
        target = index.get(edge.get("target"))
        if source is None or target is None:
            continue
        adjacency[source].append(target)
        adjacency[target].append(source)

    prior = [0.0] * len(ids)
    for group in members.values():
        share = 1 / (len(members) * len(group))
        for node_id in group:
            position = index.get(node_id)
            if position is not None:
                prior[position] += share

    rank = prior[:]
    iterations = 0
    for iterations in range(1, MAX_ITERATIONS + 1):
        nxt = [0.0] * len(ids)
        dangling = 0.0
        for j in range(len(ids)):
            degree = len(adjacency[j])
            if degree == 0:
                dangling += rank[j]
                continue
            share = DAMPING * rank[j] / degree
            for neighbour in adjacency[j]:
                nxt[neighbour] += share
        reinjected = 1 - DAMPING + DAMPING * dangling
        delta = 0.0
        for i in range(len(ids)):
            nxt[i] += reinjected * prior[i]
            delta += abs(nxt[i] - rank[i])
        rank = nxt
        if delta < TOLERANCE:
            break

    by_statement = {
        node_id: rank[index[node_id]]
        for group in members.values()
        for node_id in group
        if node_id in index
    }
    by_clause = {
        clause_id: sum(by_statement.get(node_id, 0.0) for node_id in group)
        for clause_id, group in members.items()
    }
    return PersonalizedPageRank(
        by_clause=by_clause,
        by_statement=by_statement,
        peak=max(by_clause.values(), default=0.0),
        iterations=iterations,
    )
