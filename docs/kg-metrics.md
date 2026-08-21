# KG Metrics — burden / benefit / attention

Living reference for the party-centric metrics computed in
`web/src/features/docx/utils/knowledge/attention.ts`. Update this file whenever a
formula changes.

**Objective:** for a focused party, identify which clauses burden vs benefit it,
and how heavily — using the contract's structure (Personalized PageRank).

---

## Variables

| Symbol | Meaning |
|---|---|
| $P$ | the focused party (the seed) |
| $v$ | a **deontic statement** — one obligation, right, or prohibition (a provision) |
| $\text{kind}(v)$ | one of `obligation`, `right`, `prohibition` |
| $c$ | a clause (groups several statements) |
| $\text{sev}(\text{kind})$ | severity weight per kind — **user-tunable (sliders)**. Default: obligation `0.7`, right `0.3`, prohibition `1.0` |
| $\text{PPR}_P(v)$ | Personalized PageRank of node $v$ seeded on $P$. **Off** (toggle) → replaced by `1` for every node |
| $\text{tone}(v,P)$ | `burden`, `benefit`, or none — how $v$ affects $P$ (see below) |
| $N_\text{burden}, N_\text{benefit}$ | count of statements with that tone for $P$ |

### Tone (which side a statement falls on, for party P)

$$
\text{tone}(v,P) =
\begin{cases}
\text{burden} & \text{if } \text{kind}(v)\neq\text{right } \wedge\ \text{burdenPartyId}(v)=P\\
\text{benefit} & \text{else if } \text{benefitPartyId}(v)=P\\
\text{none} & \text{otherwise (does not touch }P)
\end{cases}
$$

`burdenPartyId` = who must comply / is prohibited. `benefitPartyId` = who holds the
right or is owed the duty.

---

## Magnitude — the one shared quantity

Everything below is an aggregation of the same per-statement weight:

$$
w(v) = \text{PPR}_P(v)\cdot \text{sev}(\text{kind}(v))
$$

With the PageRank toggle **off**, $\text{PPR}_P(v)=1$, so $w(v)=\text{sev}(\text{kind}(v))$
(the raw baseline).

---

## Metric 1 — Burden / Benefit (party level)

### Total bar (volume — the count matters)

$$
\text{Burden}(P) = \!\!\sum_{v:\ \text{tone}=\text{burden}}\!\! w(v),
\qquad
\text{Benefit}(P) = \!\!\sum_{v:\ \text{tone}=\text{benefit}}\!\! w(v)
$$

Displayed split: $\ \text{burden\%} = \dfrac{\text{Burden}(P)}{\text{Burden}(P)+\text{Benefit}(P)}$.

### Intensity bar (per statement — the count is removed)

$$
\text{BurdenIntensity}(P) = \frac{\text{Burden}(P)}{N_\text{burden}},
\qquad
\text{BenefitIntensity}(P) = \frac{\text{Benefit}(P)}{N_\text{benefit}}
$$

Displayed split: $\ \dfrac{\text{BurdenIntensity}}{\text{BurdenIntensity}+\text{BenefitIntensity}}$.

> **Reading the two bars:** the gap between *Total* and *Intensity* is the **count
> effect**. Big gap → the dominance is volume (many light statements). Small gap →
> it is intensity (each statement weighs/ranks more), not volume.

### Example cases (burden %)

| Case | Total | Intensity | Reading |
|---|---|---|---|
| **A** | 88% | 86% | Genuinely burdened — many burdens **and** each weighs more. |
| **B** | 85% | 55% | *Looks* burdened, but it's **volume**: many light burdens; each is barely heavier than each benefit. |
| **C** | 55% | 82% | Doesn't *look* that burdened, but each burden is **brutal**: few burdens, very heavy (benefits are many and light). |
| **D** | 25% | 22% | Genuinely benefited — few, light burdens; what it receives weighs more. |

- **Total ≈ Intensity** → what you see is real (A, D).
- **Total > Intensity** (big gap) → count inflated it (B: many weak burdens).
- **Intensity > Total** → few but heavy (C: Total looks calm, each burden still hits hard).

See [`kg-metrics-example.md`](./kg-metrics-example.md) for both bars computed by hand.

---

## Metric 2 — Heaviest clauses (per-clause split)

Per clause $c$, split the same $w(v)$ by tone:

$$
\text{Burden}(c) = \!\!\sum_{v\in c:\ \text{tone}=\text{burden}}\!\! w(v),
\qquad
\text{Benefit}(c) = \!\!\sum_{v\in c:\ \text{tone}=\text{benefit}}\!\! w(v)
$$

Ranked by **total involvement** $\text{Burden}(c)+\text{Benefit}(c)$, top 5.
Each drawn as a diverging bar: length $\propto$ total involvement (relative to the
max), split = burden(red)/benefit(green) composition.

---

## Node sizing (the graph)

$$
\text{nodeScore}(v) = \frac{w(v)}{\max_u w(u)}\in[0,1]
$$

Clauses use $\sum_{v\in c} w(v)$ normalized the same way; the focused party = `1`.

---

## Fixed parameters (not exposed yet)

| Parameter | Value | Where |
|---|---|---|
| PPR restart / teleport | `0.15` (damping $d=0.85$) | `RESTART` |
| PPR iterations | `80` | `ITERATIONS` |
| PPR graph | **undirected**, seed = one-hot on $P$ | `personalizedPageRank` |
| Heaviest clauses shown | top `5` | `TOP_CLAUSES` |

---

## Known simplifications / open questions

- **Severity is heuristic** — exposed as sliders so it can be explored / ablated.
- **PPR is undirected** — a party has no outgoing edges, so a directed walk would
  dead-end on the seed; undirected lets weight flow party → statements → clauses.
- **Rights don't burden the counterparty** — the tone guard skips `burden` for
  rights, so a right held by A does not register as a Hohfeldian duty on B.
- **Aggregation (Problem A)** — Total is a sum (count matters); the Per-item bar is
  the count-invariant view. No normalized/proportion mode beyond that yet.

---

## Changelog

- Bar unified with PPR + raw/PageRank toggle; per-clause burden/benefit split;
  intensity bar added (labelled "Intensity"); example cases documented.
