# PageRank personalizado — impacto deóntico por parte

*Formalization draft — a starting point to refine, not final wording.*

> **Status: kept as the write-up of a method the system moved away from.** The clause
> weight is now a plain severity sum over each party's own statements; see the status
> note in [`burden-benefit.md`](./burden-benefit.md) for what was measured and why. PPR still
> runs to rank the paragraphs the document highlights. Keep this file for the paper's
> method section and for the negative result — do not read it as a description of what
> the grid shows.

## 1. The deontic knowledge graph

We model a contract as a typed, directed graph **G = (V, E)** extracted per document.

**Node types** (9): `Party`, `Clause`, `DefinedTerm`, `Obligation`, `Right`,
`Prohibition`, `Condition`, `Reference`, `Value`. We write the set of **deontic
statements** as **S = Obligations ∪ Rights ∪ Prohibitions ⊆ V**.

**Edge types** (10): structural (`is_part_of`, `defines`), party-attachment
(`assigns_obligation_to`, `grants_right_to`), and semantic
(`uses`, `references`, `depends_on`, `supersedes`, `modifies`, `contradicts`).

Each statement `s ∈ S` carries a **kind** `k(s) ∈ {obligation, right, prohibition}`,
a **clause** `c(s)`, and two party roles:
- **burden party** `b(s)` — who must comply / is restricted,
- **benefit party** `β(s)` — who benefits / holds the right.

These roles are the deontic **tone**: a statement *burdens* `b(s)` and *benefits* `β(s)`.

## 2. Party-centric attention (the core question)

> *Research question: which clauses are most burdensome / beneficial for each party?*

For a focused party **P ∈ Parties**, we want a per-statement **importance** that reflects
not just *whether* P is named, but *how structurally central* that statement is to P.
A statement buried under a heavily-referenced, much-depended-on clause should weigh more
than an isolated one. This is exactly what **Personalized PageRank (PPR)** captures.

### 2.1 Personalized PageRank

Treat G as undirected for diffusion. Let **A** be its adjacency, `deg(v)` the degree,
and **e_P** the *personalization (teleport) vector* — a one-hot seed on the focused party:

$$
(\mathbf{e}_P)_v = \begin{cases} 1 & v = P \\ 0 & \text{otherwise} \end{cases}
$$

PPR is the stationary distribution of a random walk that, at each step, with probability
`1 − r` follows a neighbor and with probability `r` teleports **back to P**:

$$
\mathrm{PPR}_P^{(t+1)}(v) = r\,(\mathbf{e}_P)_v \;+\; (1-r)\!\!\sum_{u \sim v} \frac{\mathrm{PPR}_P^{(t)}(u)}{\deg(u)}
$$

with restart `r = 0.15`, iterated to convergence (≈80 iterations); dangling mass is
re-injected onto the seed. **Interpretation:** `PPR_P(v)` = the share of P's structural
influence that reaches node `v` — high for statements P is closely, centrally tied to.

*Precedent:* GraphQAG (IEEE TVCG 2024) uses PageRank with a structural prior to rank
element importance for generation; we specialize the personalization to a single party
to make the ranking **party-relative**.

### 2.2 Severity-weighted magnitude

Not all deontic kinds carry equal weight. A user-tunable **severity** `σ: kind → [0,1]`
(default `prohibition = 1.0`, `obligation = 0.7`, `right = 0.3`) scales the structural
importance into an **impact magnitude**:

$$
w_P(s) = \mathrm{PPR}_P(s)\;\cdot\;\sigma\big(k(s)\big)
$$

This is the single quantity behind every view: party bar, clause ranking, node size —
*one magnitude, three granularities.*

### 2.3 Signed impact (tone)

A statement's contribution to P is signed by whether it burdens or benefits P:

$$
\mathrm{impact}_P(s) =
\begin{cases}
-\,w_P(s) & \text{if } k(s)\neq\text{right and } b(s)=P \quad(\text{burden}) \\
+\,w_P(s) & \text{if } \beta(s)=P \quad(\text{benefit}) \\
0 & \text{otherwise}
\end{cases}
$$

Let `S_P = { s : s burdens or benefits P }` be P's relevant statements.

## 3. The two metrics: Total vs Intensity

Aggregating `w_P` over each side gives two complementary, deliberately different readings.

| | Definition | Reads as | Answers |
|---|---|---|---|
| **Total** | `Σ_{s∈S_P, burden} w_P(s)` vs `Σ benefit` | **volume** — count matters | "How much burden vs benefit overall?" |
| **Intensity** | same sums **÷ N_burden**, **÷ N_benefit** | **per-statement** — count-invariant | "Are the individual duties heavy, regardless of how many?" |

The **gap** between Total and Intensity is itself informative: a party dominant in Total
but not Intensity carries burden *by volume* (many small duties); dominant in both means
*heavy duties too*.

### 3.1 Heaviest clauses (per-clause split)

Rolling `w_P` up to the clause `c(s)`, split by tone, ranks the clauses that most
burden / benefit P — the clause-level answer to the RQ.

## 4. The PPR ablation (why PPR, not counting)

The system exposes a **raw ↔ PPR toggle**: with PPR off, `w_P(s) = σ(k(s))` (every
statement weighs 1 × severity — a naive count). This is a built-in **ablation**:

- **PPR off:** every duty of P counts equally → dominated by sheer number.
- **PPR on:** duties tied to central, referenced, depended-on clauses rise.

Where the two rankings **disagree** is the evidence that structural centrality adds signal
beyond counting — a concrete claim to demonstrate with a worked example.

## 5. Human-in-the-loop party canonicalization

Extracted parties are over-produced (a company, its role aliases, mutual-role
placeholders). Because merging affects the metric (a party split across nodes splits its
impact), the graph offers **interactive merge / split / hide** with an **LLM
resolver-as-hint** (compatible nodes green, incompatible amber). *LLM proposes, human
disposes* — matching the ContraVis / GraphQAG philosophy — and keeps the stored KG
untouched (all view-time, reversible).

## 6. One-line summary

> A party-relative Personalized-PageRank over the deontic graph, weighted by
> kind-severity and signed by burden/benefit tone, yields a single impact magnitude that
> answers *which clauses matter most for whom* — read at two altitudes (volume vs
> intensity), ablated against naive counting, and refined by human-in-the-loop merges.

---

*Related: [`burden-benefit.md`](./burden-benefit.md) (formulas as implemented),
[`../ontologia/esquema.md`](../ontologia/esquema.md) (what the graph is made of).*
polygon/hypergraph line (why a dyadic, directed deontic graph doesn't fit that metaphor).*
