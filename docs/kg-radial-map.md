# KG Radial Map — visual design

Living reference for the radial clause map rendered by
`web/src/features/docx/components/knowledge-graph/KnowledgeGraphPanel.tsx`, laid out by
the pure module `web/src/features/docx/utils/knowledge/radial-layout.ts`.
For the metrics that feed it (tone, magnitude, PPR, the ledger) see
[`kg-metrics.md`](./kg-metrics.md) — this file documents only how those numbers become
a picture.

**Objective:** answer *which clauses demand this party's attention, and where they sit
in the contract*, by using the contract's own structure as the spatial substrate.

**Lineage:** adapted from the *Knowledge Map* of GraphQAG (arXiv:2607.27182, §V-B-1),
with two deliberate departures documented in [Provenance](#provenance).

> **On the numbers in this file.** Every measured figure comes from
> `target_BELLICUMPHARMACEUTICALS_INC_05_07_2019-EX-10.1-Supply_Agreement` (5 parties,
> 142 clauses, 372 statements, 1083 edges), computed with **severity weighting and PPR
> off** — the `usePageRank = false` mode the panel exposes as a toggle. Counts and
> geometry are exact; the specific weight *rankings* shift once PPR is on.

---

## 1. How to read it

Read it in this order. Each step uses one channel and nothing else.

1. **Go around the ring.** The circle is the contract, clockwise from 12 o'clock in
   document order. A clause's angular position *is* its position in the text.
2. **Look at sector widths.** A wide sector is a clause that weighs on the focused
   party. A hairline sector is a clause that barely touches it — still drawn, because
   "this clause does not concern you" is an answer.
3. **Look inward.** Distance to the centre is attention: **the closer to the centre, the
   heavier**. The focused party is the centre itself.
4. **Cross the dashed circle.** Inside it are the nodes that appear in *two or more*
   clauses — the couplers. Outside it are the nodes that live in exactly one.
5. **Read the rings around nodes.** Red = burden, green = benefit, arc length = share.
   A statement is always one solid colour; only a clause can show a split.
6. **Follow the chords.** Only relations that cross clauses are drawn. A chord through
   the middle means two distant parts of the contract are coupled.

> **The one-sentence reading:** *wide-and-near-the-centre with a red ring* = a clause
> that is heavy, structurally central, and against you.

### What the picture is not

Without a focused party there is no attention to encode, so the map stays on the entry
view — the parties alone. A "show me everything" state is deliberately unreachable: with
all scores at zero every node collapses onto one radius and the ring degenerates into a
necklace with a hairball inside.

---

## 2. Visual channels

| Channel | Encodes | Source |
|---|---|---|
| **Angle** | position of the clause in the document | median `paragraph_enum` |
| **Angular width** | weight of the clause for party $P$ | $\text{clauseScore}$ |
| **Radial distance** | attention (inverted: near = heavy) | $\text{nodeScore}$ |
| **Band** (in/out of the dashed circle) | couples several clauses vs lives in one | clause membership |
| **Ring around a node** | burden / benefit split | $\text{Burden}(c),\text{Benefit}(c)$ |
| **Node colour** | node kind | `NODE_COLORS` |
| **Node size** | node kind **only** | fixed per kind |
| **Chord** | a cross-clause relation | `KgEdge` |

Node size is deliberately *not* attention. Attention already owns the radial channel,
and encoding one variable twice makes two nodes of the same kind look like two different
things.

---

## 3. Geometry

All radii are fractions of the **usable radius**:

$$
R_\text{usable} = \frac{\min(\text{width},\text{height})}{2} - 28\ \text{px}
$$

### The two circles

| Circle | Radius | Role |
|---|---|---|
| **Outer ring** | $0.96\,R$ | Where the sector arcs are drawn. The contract's perimeter. |
| **Dashed boundary** | $0.58\,R$ | Splits couplers (inside) from single-clause nodes (outside). Purely a reading aid — nothing is drawn *on* it. |

### The bands

From the centre outwards:

| Band | Extent | Holds |
|---|---|---|
| Centre | $0$ | The focused party |
| **Connector** — scored | $0.20 - 0.42\,R$ | Nodes in ≥2 clauses, placed by value |
| **Connector** — unscored | $0.45 - 0.53\,R$ | Nodes in ≥2 clauses with no attention |
| *(dashed boundary)* | $0.58\,R$ | |
| **Local** — scored | $0.62 - 0.74\,R$ | Nodes in exactly 1 clause, placed by value |
| **Local** — unscored | $0.77 - 0.85\,R$ | Nodes in exactly 1 clause with no attention |
| **Clause anchors** | $0.89 - 0.94\,R$ | The clause nodes themselves |
| *(outer ring)* | $0.96\,R$ | |

Clauses get their own band because they **anchor** a sector rather than inhabit it. Each
one owns a unique angle, which is why two unscored clauses may share a radius without
ever colliding.

### Node radii (px, fixed)

| Kind | r |
|---|---|
| Party | 13 (24 on the entry view) |
| Clause | 8 |
| Defined term | 7 |
| Obligation / Right / Prohibition | 5.5 |
| Condition / Reference / Value | 4.5 |

Arc glyph: drawn at $r + 3.5$, stroke width $2.5$.

---

## 4. Angle — sector order and width

### Order: the median paragraph, not the first

A clause is ordered by the **median** of its paragraphs' `paragraph_enum`, not the
minimum. Extraction anchors a clause to *every* paragraph that mentions it, including
forward references from the definitions article:

> *"Firm Zone" shall have the meaning provided in Section 5.1(a)*

Taking the minimum lets one such stray drag a late clause to the front of the ring. In
the Bellicum–Miltenyi contract:

| Clause | by `min` | by median |
|---|---|---|
| Section 15.1 | 42 | **191** |
| Article 5 | 39 | **173** |
| Section 3.2 | 54 | **129** |

The median is robust to a minority of stray mentions. **Do not "simplify" this back to
`min`.**

### Width: a floor plus a share

Every clause receives a floor of $1.4°$; the remaining budget is split proportionally to
its weight:

$$
\theta_c = \theta_\text{min} + \frac{\text{clauseScore}(c)}{\sum_{c'}\text{clauseScore}(c')}\cdot\left(2\pi - n\,\theta_\text{min}\right)
$$

The floor is what keeps a zero-weight clause visible. Measured on the reference
contract: 142 sectors spanning $1.40°$ to $8.75°$, summing to exactly $360.00°$, with 70
carrying non-zero weight for a given party.

---

## 5. Radius — attention, and the absence of it

For a node **with** attention, the radius inverts the score inside its band:

$$
d(v) = R_\text{usable}\cdot\Big(\text{outer} - \text{score}(v)\cdot(\text{outer}-\text{inner})\Big)
$$

For a node **without** attention, there is nothing to encode. Mapping every such node to
$\text{score}=0$ would place all of them on the identical radius — this is exactly what
produced the dense "necklace" in the first iteration. They are instead fanned evenly
across their band's outer strip, ranked across the whole band (not per sector: most
sectors hold one or two nodes, and ranking inside them puts every singleton at the same
mid-band fraction).

**This means radius is only meaningful in the scored strip.** In the unscored strip it is
pure anti-occlusion.

### Tie separation

Two statements of the same kind in the same clause get the same severity, therefore the
same score, therefore the same radius — and a $1.4°$ sector leaves only a few px of arc
between them. Three prohibitions of `Section 2.2` came out **3.4 px** apart with radii of
5.5.

Siblings of a sector are therefore pushed outward in score order until each pair is at
least `minRadialGap = 13 px` apart, compressing if the band runs out, then the whole
group is slid back inward if the tail overran the band. Because $|d_i - d_j|$ lower-bounds
the distance between two points, a radial gap guarantees separation at *any* angle.
Ordering is preserved: of two tied nodes, the heavier still reads as the inner one.

Measured result:

| Focus size | Nodes drawn | Overlapping pairs |
|---|---|---|
| top-10 (default) | 13–14 | **0** |
| top-25 | 39–40 | **0** |
| top-50 (max) | 75–77 | 3–5 |

---

## 6. The arc glyph

A ring drawn around a node, split by tone. Implemented as two concentric circles with
`stroke-dasharray` — dash length is the share, rotation is where the second one starts —
rather than as path arcs.

- **Statements** carry a **solid** ring. Their tone is binary: a statement either burdens
  or benefits $P$, never both.
- **Clauses** carry a **split** arc, because a clause aggregates several statements.

On the reference contract, of the 70 clauses with any tone for Bellicum: **27 are mixed**
(a genuine split) and 43 are pure. Examples:

```
Section 2.2    burden 93.6%  ·  benefit  6.4%
Section 3.2    burden 12.5%  ·  benefit 87.5%
Article 5      burden 50.8%  ·  benefit 49.2%
```

Colours reuse the deontic palette on purpose: burden takes the obligation red, benefit
the right green — associations the reader already has from the node legend.

---

## 7. Node classification

| Class | Rule | Placement |
|---|---|---|
| **Centre** | the focused party | $d = 0$ |
| **Clause anchor** | is a clause | sector mid-angle, clause band |
| **Connector** | belongs to ≥2 clauses | circular mean of its clauses' mid-angles |
| **Local** | belongs to exactly 1 clause | spread across that sector |
| **Orphan** | belongs to none | ringed evenly at the local band's outer edge |

A node "belongs to" a clause if it is adjacent to it, **or** adjacent to a statement that
lives in it. That second hop is what anchors conditions, values and references, which
only ever attach to the statement they qualify.

Connector angles use a **circular mean** (angles summed as unit vectors), because
averaging 350° and 10° must land on 0°, not 180°.

---

## 8. Edges — what is drawn, and what is not

`is_part_of` is **excluded**. In a layout where position already encodes containment —
the node sits inside its clause's sector — drawing the containment edge is pure
redundancy. On the reference contract this removes **556 of 1083** chords without losing
any information, and it is the half that produced the string-art through the centre.

What remains are the relations that genuinely cross clauses:
`assigns_obligation_to`, `grants_right_to`, `depends_on`, `uses`, `references`,
`supersedes`, `modifies`, `contradicts`.

---

## 9. How PPR is used here

The formulas live in [`kg-metrics.md`](./kg-metrics.md). What matters for the *picture*:

**The scored set and the structure are not the same set.** PPR runs over the **entire**
graph — all node kinds, all edges, undirected — seeded one-hot on the focused party. But
only deontic statements and clauses receive a final `nodeScore`. Defined terms,
conditions, references and values influence the ranking, because they are paths the
random walk traverses, yet they never receive a score of their own.

Concretely, in this map:

| Quantity | Driven by | Visual channel |
|---|---|---|
| $\text{clauseScore}(c)$ | PPR × severity, rolled up | **sector width** and clause radius |
| $\text{nodeScore}(v)$ | PPR × severity | **radial distance** |
| $\text{Burden}/\text{Benefit}(c)$ | the same $w(v)$, split by tone | **arc glyph** |

So a single PPR pass feeds all three channels, and the whole figure is a function of
which party is focused. Focus the counterparty and the same contract draws a different
picture — that is the point.

**Consequence to be aware of:** the unscored kinds always land in the unscored strip, no
matter how central they are. Their structural contribution is real but invisible.

### Difference from GraphQAG

GraphQAG's PageRank (their Eq. 1) uses a **paragraph-uniform prior**: every paragraph
receives mass $1/|\mathcal{P}|$ and spreads it among its entities, so the ranking is a
property of the *document*. Ours is seeded **one-hot on a party**, so the ranking is a
property of the *reader*. That substitution is what turns their document map into a
party-impact map, and it is the substantive adaptation rather than the radial layout
itself.

---

## 10. Provenance

Taken from GraphQAG §V-B-1:

- sectors around an outer ring, in source order
- angular width ∝ importance of the unit
- inner region for shared entities, outer region for local ones
- radial distance = importance
- an arc glyph around each node

Changed:

| GraphQAG | Here | Why |
|---|---|---|
| sector = paragraph | sector = **clause** | the contract's own unit of obligation |
| radius = global entity importance | radius = **attention for the focused party** | the research question is party-indexed |
| arc = QA coverage | arc = **burden / benefit** | there are no QA pairs; composition is the question |
| all subgraph links drawn | `is_part_of` **dropped** | position already encodes containment |

Not taken: the *QA Space* (no QA pairs) and the *Evidence Bridge* — the document viewer,
with its paragraph highlights, entity marks and deontic rail, already is one. Convergent
design, worth citing as validation rather than rebuilding.

---

## 11. Determinism

Positions are a pure function of (graph, scores, paragraph order, viewport). There is no
simulation, no settling, no random seeding, and no frame-to-frame drift. Consequences:

- Toggling the kind filter never reshuffles the ring — the layout is computed over the
  whole graph and only the drawn subset changes.
- The same KG always produces the same figure, so a paper figure is reproducible.
- Nothing needs to be cached across rebuilds except the user's own pan/zoom.

Verified on the reference contract: 783 nodes placed, $360.00°$ total, 0 NaN positions,
0 nodes outside the ring.

---

## 12. Known limitations

- **The connector band is nearly empty — 41 nodes against 741 locals.** This is the
  `uses` extraction gap made visible: 111 `uses` edges against ~1398 textual mentions of
  defined terms (**7.9%** coverage), 24 defined terms with degree 0, and conditions,
  references and values all at degree exactly 1.0 (leaves, not paths). The inner ring
  will stay hollow until that layer is densified.
- **9 clauses are anchored only on a cross-reference** and therefore land in the
  definitions region of the ring regardless of aggregator. Fixable in extraction, not in
  the layout.
- **top-50 still overlaps** (3–5 pairs, ≈2.5 px). The local band is out of room; widening
  it costs the connector band.
- **Radius is meaningless in the unscored strip** — see §5.
- **Sector width and clause radius encode the same quantity.** Kept for a uniform rule
  ("radius is always attention"), at the cost of some redundancy.

---

## Changelog

- Initial version: radial clause map replaces the force-directed layout; median-based
  clause ordering; scored/unscored band split; radial tie separation; burden/benefit arc
  glyph; `is_part_of` excluded; hoverable sectors.
