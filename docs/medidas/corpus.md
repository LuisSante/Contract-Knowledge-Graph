# Mediciones del corpus

What the paper's results section is built on. Three tables, measured over every
knowledge graph in `infra/json/kg/`.

Regenerate with:

```bash
python3 scripts/measure_kg_corpus.py
```

Structural only — it reads the stored JSON. No LLM calls, no application code, so it
can run while the app is being changed.

**Status: 3 contracts. That is not yet a result.** Every claim below is provisional
until the sample is larger; see [What is missing](#what-is-missing).

---

## Why these tables exist

Almost everything the design rests on was measured on **one document**, and that
document is the *summary* of the Bellicum–Miltenyi contract — 74 statements, not the
372 of the full one. These tables exist to find out which of those observations are
properties of contract knowledge graphs and which are properties of that one file.

---

## Table 1 — Edge budget

**What it measures.** For each contract, how many of its edges say something the
grid's *position* does not already say.

The grid puts a statement in a row (its clause) and a lane (its party). That makes two
edge families redundant by construction:

| family | edge types | what position already says |
|---|---|---|
| containment | `is_part_of` | which clause it belongs to → **the row** |
| party | `assigns_obligation_to`, `grants_right_to` | which party it concerns → **the lane** |

Everything else — `uses`, `defines`, `references`, `depends_on` — is *informative*: a
link would have to draw it, because no position encodes it.

| contract | edges | `is_part_of` | party | informative | % redundant |
|---|---|---|---|---|---|
| BELLICUM–MILTENYI (summary) | 158 | 92 | 63 | **3** | 98.1% |
| BELLICUM (full) | 1083 | 556 | 284 | **243** | **77.6%** |
| SteelVault Affiliate | 154 | 72 | 82 | **0** | 100.0% |

**What it already says.** The redundancy is large in all three — between 78% and 100%
of edges repeat the position. That is the argument for the grid, and it survives.

**What it corrects.** The claim "155 of 158 edges are redundant, only 3 survive" is a
property of the **summary**, not of contract knowledge graphs. The full contract keeps
**243** informative edges — the `uses` (111), `defines` (68), `references` (50) and
`depends_on` (14) that a summary simply does not contain, because a summary does not
repeat cross-references.

So the paper cannot say *"the graph had nothing left to draw"*. It can say the
position absorbs the large majority of edges. A reviewer who runs the pipeline on a
full contract will get 78%, not 98%; the abstract has to hold the number that
survives that test.

---

## Table 2 — Contract shape

**What it measures.** How big the thing being drawn actually is: how many clause bands,
how many are empty, and how many marks land in the fullest one.

| contract | clauses | empty | statements | max/clause |
|---|---|---|---|---|
| BELLICUM–MILTENYI (summary) | 14 | 3 | 74 | 11 |
| BELLICUM (full) | **142** | 34 | 372 | **15** |
| SteelVault Affiliate | 26 | 1 | 76 | 16 |

**What it already says.** Two view decisions that were taken by eye are justified by
the numbers:

- **Pagination.** 142 clauses is not a list anyone scrolls. The grid opening on ten
  rows, with a step of ten, is not a nicety.
- **Wrapping the lane.** The fullest clause holds 15–16 statements, above the ten
  columns of a lane, so marks must wrap into a matrix or the lanes drift out of
  alignment.

"Empty" means the clause holds no statement at all. The reason varies — *Governing
Law* carries no duty by nature, while an empty operative clause is an extraction miss —
so the count is reported, not interpreted.

---

## Table 3 — Correlativity and gaps

**What it measures.** Two different things that both live in the party fields.

*Correlativity* — how often a statement names **both** a burden party and a different
benefit party. That is the Hohfeldian pair: a prohibition on one side is a protection
on the other. The grid currently reads one of the two and discards the other.

*Gaps* — statements the extraction could not place: no clause, no party named, or
attached to an "each Party" node that sits in its own disconnected component.

| contract | both parties | % | no clause | no party | island | island stmts |
|---|---|---|---|---|---|---|
| BELLICUM–MILTENYI (summary) | 40 | 54% | 12 | 6 | 1 | 6 |
| BELLICUM (full) | 200 | 54% | 50 | 54 | 0 | 0 |
| SteelVault Affiliate | 33 | 43% | 4 | 16 | 0 | 0 |

**What it already says.**

- **Correlativity is stable: 54%, 54%, 43%.** Roughly half of all statements carry the
  second party already. This is not a peculiarity of one contract, so the signed
  reading has data behind it in every document measured.
- **The "each Party" island appears in 1 of 3.** It is a failure mode, not a constant —
  worth fixing, but it does not by itself justify changing the ontology.
- **The gaps are not negligible**: the full contract leaves 50 statements without a
  clause and 54 without a party. Those are extraction quality, and they belong in the
  paper as a limitation with a number, not as a footnote.

---

## What is missing

**More contracts.** Three cannot separate a property of contracts from a property of a
file. Ten is enough to see whether the edge budget clusters or spreads; the number that
goes in the abstract is the one that holds across them.

**Extraction variance.** The probe battery has been run three times and gave 7/12,
7/12 **over different subsets**, and 11/12 after changing the chunk size. Three isolated
readings are not a measurement. It needs K runs over M contracts, reported as mean ±
standard deviation.

**Cost.** Every new knowledge graph is a set of LLM calls. Ten first, then scale only if
the distribution asks for it.

---

## Related

- [`pagerank.md`](../metricas/pagerank.md) — the Personalized PageRank the clause weight
  used to be built on, before it was replaced by the plain severity sum.
- `scripts/measure_kg_corpus.py` — the script that produces these tables.
- [`esquema.md`](../ontologia/esquema.md) — what the graph these tables measure is made of.
