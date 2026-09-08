# Clause Impact Explorer

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
paragraphs.** It knows nothing about the knowledge graph or the backend — those are
layers built on top of its output.

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

## From paragraphs to the knowledge graph

The paragraphs emitted by the engine are the **evidence layer**: every statement the
knowledge graph holds points back at the paragraph ids it was extracted from.

```
NODES (paragraphs from the engine)
        │
        ▼  POST /api/v1/extract_paragraphs      (dump, no compute)
infra/json/paragraphs/<doc>.json
        │
        ▼  notebooks/KG/build_kg.ipynb          (LLM extraction)
infra/json/kg/<doc>.json
```

The knowledge graph is built offline per document, not on load. It holds parties,
clauses, obligations, rights, prohibitions, conditions, values, defined terms and
references — each carrying the paragraph ids and the verbatim spans that evidence it.

> An earlier version also computed a *paragraph graph* on the backend (reference and
> semantic-similarity edges between paragraphs) and drew it over the document. That
> layer was removed: the knowledge graph carries its own structure, and the embedding
> compute it required is gone with it.

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

"Decorating" means annotating the existing `<p>` with the entity underlines and the
connectors of the evidence bridge. The graph is a **layer on top** of the
already-painted HTML — it annotates it, it does not replace it.

### Full round trip

```
docx ─► engine ─► HTML (with data-node-id)  +  paragraphs
                          ▲                        │
                          │                        ▼  offline extraction
                          │                   knowledge graph (paragraph ids)
                          │                        │
                          └──── decorate by id ────┘
```

The paragraph **`id`** is the single bridge: it is identical in the HTML and in
the knowledge graph, so the graph can always be drawn as an annotation over the
rendered document.

---

## Repository structure

- [`web/`](web): Next.js frontend (the rendering engine + visual analytics UI).
- [`server/`](server): Django + DRF backend (paragraph dump, knowledge-graph store, chat).
- [`infra/`](infra): datasets and support files (CUAD, ContractNLI, etc.).
- [`notebooks/`](notebooks): exploration and experiment notebooks.

## Documentation

- **Setup & run:** [INSTALL.md](INSTALL.md)
- Corpus measurements: [docs/medidas/corpus.md](docs/medidas/corpus.md)
- Graph schema: [docs/ontologia/esquema.md](docs/ontologia/esquema.md)
- Backend: [server/README.md](server/README.md)
- Frontend: [web/README.md](web/README.md)
