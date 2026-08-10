# ContraVis

**Evidence-Grounded Visual Analytics for Contradiction Review in Legal Contracts**

> Legal contracts are structurally complex documents in which contradictions may
> emerge across distant and inter-connected provisions. Although large language
> models (LLMs) improve legal language understanding, contradiction analysis
> remains a human-centered and evidence-grounded review task. We present
> **ContraVis**, a visual analytics system for human-in-the-loop contradiction
> analysis in legal contracts. The system models contracts as **typed paragraph
> graphs** that combine explicit contractual references with semantic
> relationships between paragraphs, supporting graph-conditioned LLM reasoning and
> coordinated visual exploration for contradiction triage, evidence inspection,
> neighborhood exploration, and expert validation.
>
> — *ContraVis (SIBGRAPI), abstract.*

Formally, given a contract `C = {p₁, p₂, …, pₙ}`, ContraVis builds a typed
paragraph graph `G = (V, Eᵣ, Eₛ)` where each node `vᵢ ∈ V` is a contract
paragraph `pᵢ`, with two edge types: **`Eᵣ`** (explicit contractual references)
and **`Eₛ`** (semantic relationships). This README explains how that graph is
produced — starting from the rendering engine that turns a `.docx` into the
paragraphs (the graph nodes).

> **Installation and how to run the project:** see [INSTALL.md](INSTALL.md).

---

## The rendering engine (`docx-engine`)

The frontend ([`web/`](web)) contains a self-contained, app-agnostic engine that
turns a Word document into faithful HTML. It lives at
[`web/src/features/docx/utils/docx-engine/`](web/src/features/docx/utils/docx-engine)
and its only external dependency is `docx4js` (the OOXML parser).

### Input → Output

A `.docx` goes in; the engine produces **two** things: the visual HTML and the
list of paragraphs (the graph nodes).

```
            ┌─► Faithful HTML        (the visual document, paginated like Word)
docx ─► engine ┤
            └─► paragraphs           (the data: [{ id, text, page }, …])
```

- **Output A — HTML:** the document parsed from XML and rendered as DOM, page by
  page (real page size, fonts, line spacing, indentation, etc.).
- **Output B — paragraphs:** for every paragraph the engine emits
  `{ id, text, page, element }`. **These paragraphs are the graph nodes.**

That is the engine's *entire* job: **render the HTML and extract the
paragraphs.** It knows nothing about the graph, contradictions, or the backend —
those are ContraVis layers built on top of its output.

### How each paragraph gets its `id`

While the engine walks the XML and builds the DOM, the moment it creates a
paragraph element it assigns a stable id and writes it in **two** places at once:

```js
paragraphCounter += 1;                            // incremental counter
const nodeId = `${docId}-p-${paragraphCounter}`;  // e.g. "RitterPharma…-p-12"

element.dataset.nodeId = nodeId;                  // 1) into the HTML  → <p data-node-id="…-p-12">
paragraphElementById.set(nodeId, element);        // 2) into a map     → id → element
```

So the paragraph in the HTML and the paragraph in the data are **born with the
same id, at the same instant.** That shared id is what lets us link them later.

The id lives on the **paragraph** (`<p>`); the inner `<span>`s are *runs* (text
fragments with uniform formatting) and carry no id:

```html
<p data-node-id="…-p-12">          <!-- the PARAGRAPH carries the id -->
   <span>“Affiliate” </span>        <!-- a run (bold/underlined/…) -->
   <span>means, with respect to…</span>
</p>
```

---

## From paragraphs to graph

The paragraphs emitted by the engine are the **nodes**. The **edges** are
computed by the backend.

```
NODES (paragraphs from the engine)
        │
        ▼  POST /api/v1/process
backend computes EDGES   (Eᵣ references + Eₛ semantic similarity)
        │
        ▼
GRAPH = nodes + edges
```

- **`Eᵣ` — references:** explicit pointers such as *“see Section 5.2”* become an
  edge to the paragraph of that clause.
- **`Eₛ` — semantic:** sentence embeddings link paragraphs that talk about the
  same thing.

The engine gives you the **nodes**; the backend gives you the **edges**.
Together they form the typed paragraph graph `G = (V, Eᵣ, Eₛ)`.

---

## Linking the graph back to the HTML

When the graph returns, it is combined with the HTML **by id** — nothing is
re-rendered. Each edge references paragraph ids; you look up the matching element
and **decorate** it.

```
Graph (from backend)            HTML (from engine)
 edges:                          <p data-node-id="…-p-12">…</p>
  p-12 ──► p-45                  <p data-node-id="…-p-45">…</p>
     │                                   ▲
     │   for each edge, look up          │
     └── id → element  ──────────────────┘
            (paragraphElementById map)
            and decorate that <p>
```

"Decorating" means annotating the existing `<p>` with: a relation-count badge,
highlights/connectors to related paragraphs, and contradiction evidence on
click. The graph is a **layer on top** of the already-painted HTML — it annotates
it, it does not replace it.

### Full round trip

```
docx ─► engine ─► HTML (with data-node-id)  +  nodes
                          ▲                     │
                          │                     ▼  /process
                          │                   graph (edges by id)
                          │                     │
                          └──── decorate by id ─┘
```

The paragraph **`id`** is the single bridge: it is identical in the HTML and in
the graph, so the graph can always be drawn as an annotation over the rendered
document.

---

## Repository structure

- [`web/`](web): Next.js frontend (the rendering engine + visual analytics UI).
- [`server/`](server): FastAPI backend (paragraph graph, contradiction analysis).
- [`infra/`](infra): datasets and support files (CUAD, ContractNLI, etc.).
- [`notebooks/`](notebooks): exploration and experiment notebooks.
- [`client/`](client): legacy SvelteKit frontend (superseded by `web/`).

## Documentation

- **Setup & run:** [INSTALL.md](INSTALL.md)
- Backend: [server/README.md](server/README.md)
- Frontend: [web/README.md](web/README.md)
