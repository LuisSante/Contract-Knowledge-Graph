"""The two walks drawn from a contract's graph.

Relevance, which orders the rows for the party that reads: a walk between clauses only, along
the links that say one clause is needed to read another.

    A modifies B      reading B needs A
    A depends on B    reading A needs B
    A refers to B     reading A needs B

It starts only on the clauses where that party has a statement: a clause is relevant to the
party when its own clauses need it. There is no relevance without a party.

The whole graph, for the graph tab: one walk over every node and every edge, both ways.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field

# The walk over the whole graph.
DAMPING = 0.85
# The walk between clauses. Shorter: at 0.85 two clauses that need each other keep the walk
# between them and end above clauses that many others need.
RELEVANCE_DAMPING = 0.5
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

# How each edge between clauses reads from the clause that needs the other one.
RELATION_BY_EDGE = {"modifies": "modified_by", "depends_on": "depends_on", "references": "refers_to"}


@dataclass(frozen=True)
class Need:
    """One edge of the graph, read as «to understand `reader`, read `needed`»."""

    reader: str
    needed: str
    relation: str


@dataclass(frozen=True)
class PersonalizedPageRank:
    # Each row's relevance for the party the contract is read from: what the clauses on that
    # party's way send it. Empty with no party.
    by_clause: dict[str, float]
    by_statement: dict[str, float]
    peak: float
    iterations: int
    # The walk over the whole graph, its restart vector, and what it leaves on each row's
    # statements.
    by_node: dict[str, float] = field(default_factory=dict)
    prior_by_node: dict[str, float] = field(default_factory=dict)
    graph_by_clause: dict[str, float] = field(default_factory=dict)
    # Per row that some clause needs: those clauses and how, in the contract's order. Read
    # from a party, only the clauses on its way: a row left out has no place by relevance.
    needed_by: dict[str, list[Need]] = field(default_factory=dict)


def _node_ids(kg: dict) -> list[str]:
    return [node["id"] for collection in NODE_COLLECTIONS for node in kg.get(collection) or []]


def _statements(kg: dict) -> list[dict]:
    return [node for collection in DEONTIC_COLLECTIONS for node in kg.get(collection) or []]


def walk(successors: list[list[int]], prior: list[float], damping: float) -> tuple[list[float], int]:
    """The fixed point of a walk that follows `successors` and restarts on `prior`, and how
    many rounds it took. A node with nowhere to go hands its mass back to the prior."""
    rank = prior[:]
    iterations = 0
    for iterations in range(1, MAX_ITERATIONS + 1):
        nxt = [0.0] * len(prior)
        dangling = 0.0
        for j, targets in enumerate(successors):
            if not targets:
                dangling += rank[j]
                continue
            share = damping * rank[j] / len(targets)
            for target in targets:
                nxt[target] += share
        reinjected = 1 - damping + damping * dangling
        delta = 0.0
        for i in range(len(prior)):
            nxt[i] += reinjected * prior[i]
            delta += abs(nxt[i] - rank[i])
        rank = nxt
        if delta < TOLERANCE:
            break
    return rank, iterations


def needs(kg: dict) -> list[Need]:
    """Every `modifies`, `depends_on` and `references` edge between two different clauses,
    turned the way a reader needs it, in the graph's order. An edge that names a section
    holds for the clauses under it; a section that is only a heading (clauses under it, no
    statement of its own) is not a clause to read."""
    position = {clause["id"]: at for at, clause in enumerate(kg.get("clauses") or [])}
    home = {statement["id"]: statement.get("clauseId") for statement in _statements(kg)}
    with_statements = {clause_id for clause_id in home.values() if clause_id}

    edges = kg.get("edges") or []
    children: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        if edge.get("type") == "is_part_of" and edge.get("source") in position and edge.get("target") in position:
            children[edge["target"]].append(edge["source"])

    def held_by(clause_id: str) -> list[str]:
        found, stack, seen = [], [clause_id], set()
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            if current in with_statements or not children[current]:
                found.append(current)
            stack.extend(children[current])
        return sorted(found, key=position.__getitem__)

    out: list[Need] = []
    for edge in edges:
        relation = RELATION_BY_EDGE.get(edge.get("type"))
        named = edge.get("target")
        if relation is None or named not in position:
            continue
        source = edge.get("source")
        written_in = home.get(source) or source
        if written_in not in position:
            continue
        for clause_id in held_by(named):
            reader, needed = (clause_id, written_in) if relation == "modified_by" else (written_in, clause_id)
            if reader != needed:
                out.append(Need(reader, needed, relation))
    return out


def _reached(successors: list[list[int]], begins: Iterable[int]) -> set[int]:
    """Every clause a reader gets to from `begins` by following `successors`, `begins` included."""
    seen = set(begins)
    stack = list(seen)
    while stack:
        for target in successors[stack.pop()]:
            if target not in seen:
                seen.add(target)
                stack.append(target)
    return seen


def _relevance(kg: dict, rows: list[str], start: set[str] | None = None) -> tuple[dict[str, float], dict[str, list[Need]]]:
    """How much one party's clauses need each row, and the clauses that need it.

    The walk goes from a clause to one it needs, two edges that say the same being two ways
    there, and it starts only on the rows in `start`, that party's own clauses. A row weighs
    what the clauses on the party's way send it: being one of the party's own gives a row no
    share, so a clause of the other party that conditions them can stand first.

    With no party (`start` is None) there is no walk and no relevance: what matters depends on
    who reads. The clauses that need each row are still told, a fact of the contract."""
    ids = [clause["id"] for clause in kg.get("clauses") or []]
    index = {clause_id: at for at, clause_id in enumerate(ids)}
    shown = [clause_id for clause_id in rows if clause_id in index]

    links = needs(kg)
    successors: list[list[int]] = [[] for _ in ids]
    for link in links:
        successors[index[link.reader]].append(index[link.needed])

    # Where the reader starts: on the party's own rows, or with no party on any row.
    begins = [index[clause_id] for clause_id in shown if start is None or clause_id in start]
    weight = [0.0] * len(ids)
    if start is not None and begins:
        prior = [0.0] * len(ids)
        for position in begins:
            prior[position] = 1 / len(begins)
        rank, _ = walk(successors, prior, RELEVANCE_DAMPING)
        # What each clause is sent by the ones that need it: the walk's second term, without
        # the restart that only the party's own clauses get.
        for reader, targets in enumerate(successors):
            for target in targets:
                weight[target] += RELEVANCE_DAMPING * rank[reader] / len(targets)

    # Only the clauses on the reader's way are a reason: one that is not a row and that no
    # row leads to is never read, so it sends nobody to another clause.
    on_the_way = _reached(successors, begins)
    on_screen = set(shown)
    needed_by: dict[str, list[Need]] = defaultdict(list)
    for link in sorted(set(links), key=lambda link: (index[link.reader], link.relation)):
        if link.needed in on_screen and index[link.reader] in on_the_way:
            needed_by[link.needed].append(link)
    by_clause = {} if start is None else {clause_id: weight[index[clause_id]] if clause_id in index else 0.0 for clause_id in rows}
    return by_clause, dict(needed_by)


def compute(kg: dict, counted: Iterable[str] | None = None, start: Iterable[str] | None = None) -> PersonalizedPageRank:
    """`counted` restricts the rows, and the restart of the walk over the whole graph, to the
    statements on screen: the rows are the clauses that hold one. Both walks still run over
    the whole contract.

    `start` is one party's statements among them: the relevance is read from that party, the
    walk between clauses starting only on the rows that hold one. Without it there is no
    relevance and `by_clause` is empty; `needed_by` then tells every clause that needs each
    row. The walk over the whole graph does not depend on it."""
    allowed = set(counted) if counted is not None else None
    begun = set(start) if start is not None else None

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

    rank, iterations = walk(adjacency, prior, DAMPING)

    by_statement = {node_id: rank[index[node_id]] for group in members.values() for node_id in group if node_id in index}
    own = None if begun is None else {clause_id for clause_id, group in members.items() if not begun.isdisjoint(group)}
    by_clause, needed_by = _relevance(kg, list(members), own)
    return PersonalizedPageRank(
        by_clause=by_clause,
        by_statement=by_statement,
        peak=max(by_clause.values(), default=0.0),
        iterations=iterations,
        by_node={node_id: rank[position] for node_id, position in index.items()},
        prior_by_node={node_id: prior[position] for node_id, position in index.items() if prior[position] > 0},
        graph_by_clause={clause_id: sum(by_statement.get(node_id, 0.0) for node_id in group) for clause_id, group in members.items()},
        needed_by=needed_by,
    )
