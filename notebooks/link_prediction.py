from __future__ import annotations

import collections
import json
import logging
import math
import os
import re
import unicodedata
import warnings
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# Necesario para que las multiplicaciones en GPU sean deterministas; tiene que fijarse antes
# de que torch arranque CUDA.
os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")

# La raíz del repositorio: la primera carpeta por encima que contiene infra/ (vale aunque el
# cuaderno se mueva de carpeta).
ROOT = next(p for p in Path(__file__).resolve().parents if (p / "infra").is_dir())
KG_DIR = ROOT / "infra/json/kg"
PARAGRAPHS_DIR = ROOT / "infra/json/paragraphs"
GOLD_DIR = ROOT / "infra/json/gold"

# Los tres grafos del pipeline actual. Los otros tres (Ritter, TomOnline, Healthcentral)
# vienen del pipeline viejo y no se usan.
CONTRACTS = {
    "SteelVault": "root_SteelVaultCorp_20081224_10-K_EX-10_16_3074935_EX-10_16_Affiliate_Agreement",
    "Ediets": "root_EdietsComInc_20001030_10QSB_EX-10_4_2606646_EX-10_4_Co-Branding_Agreement",
    "Bellicum": "root_BELLICUMPHARMACEUTICALS_INC_05_07_2019-EX-10_1-Supply_Agreement",
}

DEONTIC = {"obligations": "obligation", "rights": "right", "prohibitions": "prohibition"}
PARTY_RELATIONS = ("assigns_obligation_to", "grants_right_to")
CLAUSE_RELATIONS = ("depends_on", "modifies", "references")

WORD = re.compile(r"[a-z0-9]+")
# Las mismas palabras vacías que `evaluate_kg.ipynb`: las que comparte cualquier frase de un contrato.
_STOPWORDS_TEXT = (
    "a an the of and or to in on at by for from with as is are be been shall will may must not no any all "
    "such this that its their each other either both party parties agreement hereunder herein under"
)
STOPWORDS = frozenset(_STOPWORDS_TEXT.split())


def norm(text: str | None) -> str:
    text = unicodedata.normalize("NFKC", text or "").replace("’", "'").replace("“", '"').replace("”", '"')
    return " ".join(text.lower().split())


def paragraph_number(pid: str) -> int:
    return int(re.search(r"p-(\d+)$", str(pid)).group(1))


# --------------------------------------------------------------------------------------- #
# Datos
# --------------------------------------------------------------------------------------- #


@dataclass
class Contract:
    name: str
    stem: str
    kg: dict
    statements: dict  # id -> nodo, con "kind"
    clauses: dict
    parties: dict
    conditions: dict
    values: dict
    triples: list  # (origen, tipo, destino), sin repetir
    position: dict  # id de enunciado -> orden en el documento
    clause_text: dict  # id de cláusula -> título y texto de sus párrafos
    paragraph_text: dict  # número de párrafo -> texto
    parent: dict  # id de cláusula -> cláusula madre (o None)
    twin: dict = field(default_factory=dict)  # enunciado -> su gemelo bilateral

    def other_party(self, pid: str) -> str:
        (other,) = [p for p in self.parties if p != pid]
        return other

    def party_edge(self, sid: str):
        """(tipo, parte) de la única arista de parte que sale de un enunciado, o None."""
        s = self.statements[sid]
        if s["kind"] == "right":
            return ("grants_right_to", s["benefitPartyId"]) if s.get("benefitPartyId") else None
        return ("assigns_obligation_to", s["burdenPartyId"]) if s.get("burdenPartyId") else None


def load_contract(name: str) -> Contract:
    stem = CONTRACTS[name]
    kg = json.loads((KG_DIR / f"{stem}.json").read_text(encoding="utf-8"))
    paragraphs = json.loads((PARAGRAPHS_DIR / f"{stem}.json").read_text(encoding="utf-8"))["paragraphs"]
    text_of = {paragraph_number(p["id"]): p["text"] for p in paragraphs}

    statements = {s["id"]: dict(s, kind=kind) for coll, kind in DEONTIC.items() for s in kg[coll]}
    clauses = {c["id"]: c for c in kg["clauses"]}
    triples = sorted({(e["source"], e["type"], e["target"]) for e in kg["edges"]})

    position = {
        sid: (min(paragraph_number(p) for p in s["paragraphIds"]) if s.get("paragraphIds") else 10**6, i)
        for i, (sid, s) in enumerate(statements.items())
    }
    clause_text = {
        cid: " ".join([c.get("heading") or ""] + [text_of.get(paragraph_number(p), "") for p in c.get("paragraphIds") or []])
        for cid, c in clauses.items()
    }
    parent = {cid: None for cid in clauses}
    for h, r, t in triples:
        if r == "is_part_of" and h in clauses and t in clauses:
            parent[h] = t

    contract = Contract(
        name=name,
        stem=stem,
        kg=kg,
        statements=statements,
        clauses=clauses,
        parties={p["id"]: p for p in kg["parties"]},
        conditions={c["id"]: c for c in kg["conditions"]},
        values={v["id"]: v for v in kg["values"]},
        triples=triples,
        position=position,
        clause_text=clause_text,
        paragraph_text=text_of,
        parent=parent,
    )

    groups = collections.defaultdict(list)
    for sid, s in statements.items():
        groups[(s["kind"], s.get("clauseId"), norm(s.get("text")))].append(sid)
    for ids in groups.values():
        if len(ids) == 2:
            contract.twin[ids[0]], contract.twin[ids[1]] = ids[1], ids[0]
    return contract


def entity_ids(contract: Contract) -> tuple[dict, dict]:
    """Ids enteros fijos para todas las entidades y tipos de arista de un contrato."""
    entities = sorted({x for h, _, t in contract.triples for x in (h, t)} | set(contract.statements) | set(contract.clauses))
    relations = sorted({r for _, r, _ in contract.triples})
    return {e: i for i, e in enumerate(entities)}, {r: i for i, r in enumerate(relations)}


def folds(n: int, k: int, seed: int) -> np.ndarray:
    """Pliegue de cada uno de n elementos, al azar pero reproducible."""
    order = np.random.default_rng(seed).permutation(n)
    out = np.empty(n, dtype=int)
    out[order] = np.arange(n) % k
    return out


# --------------------------------------------------------------------------------------- #
# Texto
# --------------------------------------------------------------------------------------- #

_ENCODER = None


def encode(texts: list[str]) -> np.ndarray:
    """MiniLM (all-MiniLM-L6-v2), local: se carga de la caché, sin red y sin coste."""
    global _ENCODER
    if _ENCODER is None:
        from sentence_transformers import SentenceTransformer

        logging.getLogger("sentence_transformers").setLevel(logging.ERROR)
        _ENCODER = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", local_files_only=True, device="cpu")
    return _ENCODER.encode(list(texts), normalize_embeddings=True, show_progress_bar=False, batch_size=64)


def tfidf_similarity(queries: list[str], documents: list[str]) -> np.ndarray:
    from sklearn.feature_extraction.text import TfidfVectorizer

    vectorizer = TfidfVectorizer(stop_words="english", sublinear_tf=True).fit(list(queries) + list(documents))
    q, d = vectorizer.transform(queries), vectorizer.transform(documents)
    return (q @ d.T).toarray()


def statement_text(s: dict) -> str:
    return s.get("text") or s.get("summary") or s.get("action") or ""


# --------------------------------------------------------------------------------------- #
# Métricas
# --------------------------------------------------------------------------------------- #


def wilson(successes: float, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (math.nan, math.nan)
    p = successes / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (centre - half, centre + half)


def rank_of_first(scores: dict, correct: set) -> float:
    """Rango (1 = primero) de la primera respuesta correcta; los empates se promedian."""
    best = max(scores[c] for c in correct if c in scores)
    above = sum(1 for v in scores.values() if v > best)
    tied = sum(1 for v in scores.values() if v == best)
    return above + (tied + 1) / 2


def ranking_metrics(ranks: list[float], ks=(1, 3, 10)) -> dict:
    ranks = np.asarray(ranks, dtype=float)
    out = {"n": len(ranks), "MRR": float(np.mean(1 / ranks))}
    for k in ks:
        out[f"Hits@{k}"] = float(np.mean(ranks <= k))
    return out


def bootstrap_mrr(ranks: list[float], reps: int = 2000, seed: int = 0) -> tuple[float, float]:
    rr = 1 / np.asarray(ranks, dtype=float)
    rng = np.random.default_rng(seed)
    means = rr[rng.integers(0, len(rr), size=(reps, len(rr)))].mean(axis=1)
    return float(np.quantile(means, 0.025)), float(np.quantile(means, 0.975))


# --------------------------------------------------------------------------------------- #
# Modelos de embeddings de grafo (PyKEEN)
# --------------------------------------------------------------------------------------- #

KGE_MODELS = ("TransE", "TransH", "TransR", "RotatE", "DistMult", "ComplEx", "RGCN", "CompGCN")

def _device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


# En GPU si la hay: con contratos largos (Bellicum, 1.3k nodos) cada época en CPU tarda
# segundos. Las operaciones se fijan deterministas, para que dos corridas den lo mismo.
DEVICE = _device()

KGE_DEFAULTS = {
    "embedding_dim": 64,
    "epochs": 200,
    "lr": 0.01,
    "batch_size": 256,
    "loss": "1vsall",
    "negatives": 32,
}


def train_kge(model_name: str, train_triples: list, e2i: dict, r2i: dict, seed: int, **overrides):
    """
    - `loss="1vsall"`: cada arista conocida contra todas las entidades a la vez, con entropía
      cruzada, prediciendo destino y origen (Ruffinelli et al., ICLR 2020);
    - `loss="margin"`: la de los artículos originales de TransE/TransH/TransR — negativos al
      azar cambiando origen o destino, y la pérdida por defecto de cada modelo en PyKEEN."""
    import torch
    from pykeen.models import model_resolver
    from pykeen.triples import TriplesFactory

    logging.getLogger("pykeen").setLevel(logging.ERROR)
    warnings.filterwarnings("ignore")
    cfg = {**KGE_DEFAULTS, **overrides}
    torch.use_deterministic_algorithms(True, warn_only=True)
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    device = torch.device(DEVICE)

    # CompGCN necesita las aristas inversas para pasar mensajes en los dos sentidos.
    inverse = model_name == "CompGCN"
    tf = TriplesFactory.from_labeled_triples(
        np.array(train_triples, dtype=str),
        entity_to_id=e2i,
        relation_to_id=r2i,
        create_inverse_triples=inverse,
    )
    kwargs = {"embedding_dim": cfg["embedding_dim"]}
    if model_name == "TransR":
        kwargs["relation_dim"] = cfg["embedding_dim"] // 2
    if model_name == "RGCN":
        kwargs["num_layers"] = 2
    if model_name == "CompGCN":
        kwargs = {"embedding_dim": cfg["embedding_dim"], "encoder_kwargs": {"num_layers": 2}}
    model = model_resolver.make(model_name, triples_factory=tf, random_seed=seed, **kwargs).to(device)
    model.train()
    optimizer = torch.optim.Adam(model.get_grad_params(), lr=cfg["lr"])
    mapped = tf.mapped_triples
    if inverse:  # las inversas solo sirven al codificador; se entrena con las directas
        mapped = mapped[mapped[:, 1] < len(r2i)]
    mapped = mapped.to(device)
    ce = torch.nn.CrossEntropyLoss()
    num_entities = len(e2i)
    for _ in range(cfg["epochs"]):
        order = torch.as_tensor(rng.permutation(len(mapped)), device=device)
        for start in range(0, len(order), cfg["batch_size"]):
            hrt = mapped[order[start : start + cfg["batch_size"]]]
            if cfg["loss"] == "1vsall":
                loss = ce(model.score_t(hr_batch=hrt[:, :2]), hrt[:, 2])
                loss = loss + ce(model.score_h(rt_batch=hrt[:, 1:]), hrt[:, 0])
            else:  # "margin": negativos al azar y la pérdida propia de cada modelo
                k = cfg["negatives"]
                negative = hrt.repeat_interleave(k, dim=0).clone()
                corrupt_head = torch.as_tensor(rng.random(len(negative)) < 0.5, device=device)
                random_entity = torch.as_tensor(rng.integers(0, num_entities, len(negative)), device=device)
                negative[corrupt_head, 0] = random_entity[corrupt_head]
                negative[~corrupt_head, 2] = random_entity[~corrupt_head]
                positive_scores = model.score_hrt(hrt)
                negative_scores = model.score_hrt(negative).view(len(hrt), k)
                loss = model.loss.process_slcwa_scores(positive_scores=positive_scores, negative_scores=negative_scores)
            loss = loss + model.collect_regularization_term()
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            model.post_parameter_update()
    model.eval()
    return model


def kge_tail_scores(model, queries: list, e2i: dict, r2i: dict) -> np.ndarray:
    """Puntuación de cada entidad como destino de cada consulta (origen, tipo)."""
    import torch

    hr = torch.tensor([[e2i[h], r2i[r]] for h, r in queries], dtype=torch.long, device=model.device)
    with torch.no_grad():
        return model.score_t(hr_batch=hr).cpu().numpy()


def kge_validation_mrr(model_name: str, contract: Contract, seed: int = 0, share: float = 0.1, **cfg) -> float:
    """MRR filtrado de un modelo sobre un 10% de aristas al azar, de cualquier tipo, que no ve
    al entrenar. Sirve para elegir su configuración sin mirar las tareas T1–T3."""
    e2i, r2i = entity_ids(contract)
    triples = contract.triples
    rng = np.random.default_rng(seed)
    held = set(rng.choice(len(triples), size=max(1, int(share * len(triples))), replace=False).tolist())
    train = [t for i, t in enumerate(triples) if i not in held]
    valid = [triples[i] for i in sorted(held)]
    model = train_kge(model_name, train, e2i, r2i, seed=seed, **cfg)
    tails = collections.defaultdict(set)
    for h, r, t in triples:
        tails[(h, r)].add(e2i[t])
    scores = kge_tail_scores(model, [(h, r) for h, r, _ in valid], e2i, r2i)
    rr = []
    for row, (h, r, t) in zip(scores, valid):
        target = e2i[t]
        others = [i for i in tails[(h, r)] if i != target]
        row = row.copy()
        row[others] = -np.inf
        rr.append(1.0 / (1 + np.sum(row > row[target]) + 0.5 * (np.sum(row == row[target]) - 1)))
    return float(np.mean(rr))


def kge_entity_vectors(model) -> np.ndarray:
    """Vector de cada entidad (parte real si es compleja), para medir cercanía estructural."""
    import torch

    rep = model.entity_representations[0]
    with torch.no_grad():
        x = rep(indices=None)
    x = x.detach().cpu()
    if torch.is_complex(x):
        x = torch.cat([x.real, x.imag], dim=-1)
    x = x.reshape(x.shape[0], -1).numpy()
    return x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-12)


# --------------------------------------------------------------------------------------- #
# NBFNet — implementación mínima (Zhu et al., NeurIPS 2021)
# --------------------------------------------------------------------------------------- #


def _nbfnet_class():
    import torch
    from torch import nn

    class NBFNet(nn.Module):
        """Bellman-Ford generalizado: la representación de cada nodo es la suma, sobre todos
        los caminos desde el origen de la consulta, del producto de las aristas recorridas
        (mensaje DistMult), con vectores de relación que dependen de la consulta. No guarda
        un vector por entidad: lo que aprende vale para cualquier nodo y cualquier grafo con
        los mismos tipos de arista."""

        def __init__(self, num_relations: int, dim: int = 32, layers: int = 4):
            super().__init__()
            self.num_relations, self.dim = num_relations, dim
            self.query = nn.Embedding(num_relations, dim)
            self.relation = nn.ModuleList([nn.Linear(dim, num_relations * dim) for _ in range(layers)])
            self.linear = nn.ModuleList([nn.Linear(2 * dim, dim) for _ in range(layers)])
            self.norm = nn.ModuleList([nn.LayerNorm(dim) for _ in range(layers)])
            self.mlp = nn.Sequential(nn.Linear(2 * dim, dim), nn.ReLU(), nn.Linear(dim, 1))

        def forward(self, src, dst, etype, num_nodes, heads, rels, edge_mask=None):
            batch = heads.shape[0]
            q = self.query(rels)
            boundary = torch.zeros(batch, num_nodes, self.dim)
            boundary[torch.arange(batch), heads] = q
            hidden = boundary
            keep = None if edge_mask is None else edge_mask.unsqueeze(-1).float()  # B,E,1
            for relation, linear, norm in zip(self.relation, self.linear, self.norm):
                w = relation(q).view(batch, self.num_relations, self.dim)
                message = hidden[:, src, :] * w[:, etype, :]
                if keep is not None:
                    message = message * keep
                aggregate = torch.zeros_like(hidden).index_add_(1, dst, message) + boundary
                hidden = hidden + torch.relu(norm(linear(torch.cat([hidden, aggregate], dim=-1))))
            feature = torch.cat([hidden, q.unsqueeze(1).expand(-1, num_nodes, -1)], dim=-1)
            return self.mlp(feature).squeeze(-1)

    return NBFNet


def train_nbfnet(
    train_triples: list,
    queries: list,
    candidates_of,
    e2i: dict,
    r2i: dict,
    seed: int,
    epochs: int = 60,
    dim: int = 32,
    layers: int = 4,
    lr: float = 5e-3,
    batch_size: int = 16,
):
    """Entrena NBFNet para las consultas `queries` = [(origen, tipo, destino)] (aristas de
    entrenamiento de las relaciones objetivo). `candidates_of(origen, tipo)` da la lista de
    destinos entre los que se elige. Mientras se entrena una consulta, su propia arista se
    quita del grafo: si no, aprendería a ver la respuesta en vez de a deducirla."""
    import torch

    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    num_rel = len(r2i)
    src = torch.tensor([e2i[h] for h, _, _ in train_triples] + [e2i[t] for _, _, t in train_triples])
    dst = torch.tensor([e2i[t] for _, _, t in train_triples] + [e2i[h] for h, _, _ in train_triples])
    etype = torch.tensor([r2i[r] for _, r, _ in train_triples] + [r2i[r] + num_rel for _, r, _ in train_triples])
    edge_index = {(h, r, t): i for i, (h, r, t) in enumerate(train_triples)}
    n_edges = len(train_triples)

    model = _nbfnet_class()(2 * num_rel, dim=dim, layers=layers)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    n = len(e2i)
    for _ in range(epochs):
        order = rng.permutation(len(queries))
        for start in range(0, len(order), batch_size):
            batch = [queries[i] for i in order[start : start + batch_size]]
            mask = torch.ones(len(batch), 2 * n_edges, dtype=torch.bool)
            for b, triple in enumerate(batch):
                i = edge_index.get(triple)
                if i is not None:
                    mask[b, i] = False
                    mask[b, i + n_edges] = False
            heads = torch.tensor([e2i[h] for h, _, _ in batch])
            rels = torch.tensor([r2i[r] for _, r, _ in batch])
            scores = model(src, dst, etype, n, heads, rels, mask)
            loss = 0.0
            for b, (h, r, t) in enumerate(batch):
                cands = candidates_of(h, r)
                idx = torch.tensor([e2i[c] for c in cands])
                target = cands.index(t)
                loss = loss + torch.nn.functional.cross_entropy(scores[b, idx].unsqueeze(0), torch.tensor([target]))
            optimizer.zero_grad()
            (loss / len(batch)).backward()
            optimizer.step()
    model.eval()
    model._graph = (src, dst, etype, n)
    return model


def nbfnet_scores(model, queries: list, e2i: dict, r2i: dict) -> np.ndarray:
    import torch

    src, dst, etype, n = model._graph
    with torch.no_grad():
        heads = torch.tensor([e2i[h] for h, _ in queries])
        rels = torch.tensor([r2i[r] for _, r in queries])
        return model(src, dst, etype, n, heads, rels).numpy()


# --------------------------------------------------------------------------------------- #
# T1 — atribución de partes
# --------------------------------------------------------------------------------------- #


def party_queries(contract: Contract) -> list:
    """(enunciado, tipo de arista, parte) por cada arista de parte del grafo."""
    out = []
    for sid in contract.statements:
        edge = contract.party_edge(sid)
        if edge:
            out.append((sid, edge[0], edge[1]))
    return out


def aliases(party: dict) -> list[str]:
    names = [party.get("name") or ""] + list(party.get("aliases") or [])
    return sorted({norm(n) for n in names if n and len(n) > 2}, key=len, reverse=True)


def subject_party(contract: Contract, text: str):
    """La parte nombrada antes en el texto: quien abre la frase suele ser el obligado de un
    deber o el titular de un derecho. None si no nombra a ninguna."""
    t = norm(text)
    first = {}
    for pid, party in contract.parties.items():
        hits = [m.start() for a in aliases(party) for m in re.finditer(r"\b" + re.escape(a) + r"\b", t)]
        if hits:
            first[pid] = min(hits)
    if not first:
        return None
    return min(first, key=first.get)


def t1_baselines(contract: Contract, train: list, test: list, embeddings: dict | None = None) -> dict:
    """Predicciones de las líneas base para las consultas de prueba: {método: {sid: parte}}.
    Solo ven las partes de `train`."""
    known = {sid: p for sid, _, p in train}
    rel_of = {sid: r for sid, r, _ in train + test}
    majority = {}
    for r in PARTY_RELATIONS:
        c = collections.Counter(p for sid, rr, p in train if rr == r)
        majority[r] = c.most_common(1)[0][0] if c else next(iter(contract.parties))

    by_clause = collections.defaultdict(collections.Counter)
    for sid, r, p in train:
        by_clause[(contract.statements[sid].get("clauseId"), r)][p] += 1

    def clause_vote(sid):
        """Mayoría de su cláusula para el mismo tipo de arista; si la cláusula no tiene
        ninguna conocida, la de su madre. Un empate no decide."""
        r = rel_of[sid]
        cid = contract.statements[sid].get("clauseId")
        votes = by_clause.get((cid, r))
        while not votes and cid is not None:
            cid = contract.parent.get(cid)
            if cid is None:
                break
            votes = by_clause.get((cid, r))
        if not votes:
            return None
        top = votes.most_common()
        return top[0][0] if len(top) == 1 or top[0][1] > top[1][1] else None

    def twin_vote(sid):
        twin = contract.twin.get(sid)
        return contract.other_party(known[twin]) if twin in known else None

    out = {m: {} for m in ("mayoría", "cláusula", "gemelo→cláusula", "sujeto", "gemelo→sujeto→cláusula")}
    for sid, r, _ in test:
        text = statement_text(contract.statements[sid])
        m = majority[r]
        cv = clause_vote(sid) or m
        tv = twin_vote(sid)
        sv = subject_party(contract, text)
        out["mayoría"][sid] = m
        out["cláusula"][sid] = cv
        out["gemelo→cláusula"][sid] = tv or cv
        out["sujeto"][sid] = sv or cv
        out["gemelo→sujeto→cláusula"][sid] = tv or sv or cv

    if embeddings is not None:
        from sklearn.linear_model import LogisticRegression

        parties = sorted(contract.parties)
        X = np.array([np.r_[embeddings[sid], float(r == "grants_right_to")] for sid, r, _ in train])
        y = np.array([parties.index(p) for _, _, p in train])
        Xt = np.array([np.r_[embeddings[sid], float(r == "grants_right_to")] for sid, r, _ in test])
        if len(set(y)) > 1:
            clf = LogisticRegression(C=1.0, max_iter=2000).fit(X, y)
            pred = clf.predict(Xt)
        else:
            pred = np.full(len(test), y[0])
        out["texto: regresión logística"] = {sid: parties[k] for (sid, _, _), k in zip(test, pred)}
        # vecino más cercano: el enunciado de entrenamiento más parecido
        E = np.array([embeddings[sid] for sid, _, _ in train])
        for (sid, _, _), row in zip(test, Xt):
            j = int(np.argmax(E @ row[:-1]))
            out.setdefault("texto: vecino más cercano", {})[sid] = train[j][2]
    return out


# --------------------------------------------------------------------------------------- #
# T3 — relaciones entre cláusulas
# --------------------------------------------------------------------------------------- #

# «Section 3.2(c)», «Sections 13.1 [Breach of Warranty] and 13.2», «Article 4», «§ 7»
SECTION = re.compile(
    r"\b(?:sections?|articles?|clauses?|paragraphs?|§)\s*"
    r"((?:\d+(?:\.\d+)*\.?(?:\s*\([a-z0-9]+\))*(?:\s*\[[^\]]{0,80}\])?(?:\s*(?:,|and|or|through|to|-)\s*)?)+)",
    re.IGNORECASE,
)
NUMBER = re.compile(r"\d+(?:\.\d+)*")


def clause_queries(contract: Contract) -> list:
    return [(h, r, t) for h, r, t in contract.triples if r in CLAUSE_RELATIONS]


def source_text(contract: Contract, node: str) -> str:
    if node in contract.statements:
        return statement_text(contract.statements[node])
    return contract.clause_text.get(node, "")


def source_context(contract: Contract, node: str) -> str:
    """El texto que rodea a un enunciado: sus párrafos enteros. Ahí suele estar el «Subject to
    Section 13.3» que el fragmento literal del enunciado deja fuera."""
    if node in contract.statements:
        pids = contract.statements[node].get("paragraphIds") or []
        return " ".join(contract.paragraph_text.get(paragraph_number(p), "") for p in pids)
    return contract.clause_text.get(node, "")


def source_clause(contract: Contract, node: str):
    if node in contract.statements:
        return contract.statements[node].get("clauseId")
    return node


def clause_by_number(contract: Contract) -> dict:
    out = {}
    for cid, c in contract.clauses.items():
        m = NUMBER.search(c.get("ref") or "")
        if m:
            out.setdefault(m.group(0).strip("."), cid)
    return out


def mentioned_clauses(contract: Contract, text: str) -> list:
    """Cláusulas citadas por número en el texto («Section 3.2(c)», «Article 4», «Sections 13.1
    and 13.2»), en orden de aparición. Un número que no existe sube a su madre (3.2.1 → 3.2)."""
    numbers = clause_by_number(contract)
    out = []
    for m in SECTION.finditer(text or ""):
        for num in NUMBER.findall(m.group(1)):
            num = num.strip(".")
            while num and num not in numbers and "." in num:
                num = num.rsplit(".", 1)[0]
            if num in numbers and numbers[num] not in out:
                out.append(numbers[num])
    return out


def tree_distance(contract: Contract, a, b) -> int:
    if a is None or b is None:
        return 99

    def chain(x):
        out = [x]
        while contract.parent.get(out[-1]):
            out.append(contract.parent[out[-1]])
        return out

    ca, cb = chain(a), chain(b)
    common = next((x for x in ca if x in cb), None)
    if common is None:
        return len(ca) + len(cb)
    return ca.index(common) + cb.index(common)


def clause_order(contract: Contract) -> dict:
    return {cid: i for i, cid in enumerate(contract.clauses)}


def t3_baseline_scores(contract: Contract, test: list, sims: dict, train: list = ()) -> dict:
    """{método: [vector de puntuaciones por cláusula]} para cada consulta de prueba.
    `sims` trae las similitudes de texto ya calculadas: {"tfidf": M, "minilm": M}, con una
    fila por consulta y una columna por cláusula (en el orden de `contract.clauses`).
    `train` son las aristas conocidas del mismo tipo, para la línea base de frecuencia."""
    cids = list(contract.clauses)
    order = clause_order(contract)
    popular = collections.defaultdict(collections.Counter)
    for _, r, t in train:
        popular[r][t] += 1
    out = collections.defaultdict(list)
    for qi, (h, r, _) in enumerate(test):
        out["destino más frecuente"].append(np.array([popular[r][c] for c in cids], dtype=float))
        own = source_clause(contract, h)
        prox = np.array([-tree_distance(contract, own, c) - 1e-3 * abs(order.get(own, 0) - order[c]) for c in cids], dtype=float)
        # lo citado en el propio enunciado va antes que lo citado en el resto de su párrafo
        own_mentions = mentioned_clauses(contract, source_text(contract, h))
        mentioned = own_mentions + [m for m in mentioned_clauses(contract, source_context(contract, h)) if m not in own_mentions]
        cited = np.zeros(len(cids))
        for k, c in enumerate(mentioned):
            cited[cids.index(c)] = len(mentioned) - k + (100 if c in own_mentions else 0)
        out["cercanía en el árbol"].append(prox)
        out["número citado→cercanía"].append(cited * 1000 + prox)
        out["texto: TF-IDF"].append(sims["tfidf"][qi])
        out["texto: MiniLM"].append(sims["minilm"][qi])
        out["número citado→MiniLM"].append(cited * 1000 + sims["minilm"][qi])
        out["_cited"].append(cited)  # no es un método: lo usan las combinaciones con modelos de grafo
    return out


def percentile_rows(scores: np.ndarray) -> np.ndarray:
    """Cada fila pasada a su orden relativo en [0, 1): sirve para poner una puntuación de modelo
    detrás de la regla del número citado sin que su escala importe."""
    order = np.argsort(np.argsort(scores, axis=1, kind="stable"), axis=1, kind="stable")
    return order / scores.shape[1]


# Los modelos de grafo que se prueban también detrás de la regla del número citado: dónde el
# texto no cita nada, ¿ordena mejor la estructura que la cercanía en el árbol?
HYBRID_MODELS = ("TransE", "NBFNet")


def filtered_rank(scores: np.ndarray, candidates: list, target, also_true: set) -> float:
    """Rango del destino entre los candidatos, quitando los otros destinos verdaderos."""
    keep = [i for i, c in enumerate(candidates) if c == target or c not in also_true]
    sub = {candidates[i]: float(scores[i]) for i in keep}
    return rank_of_first(sub, {target})


# --------------------------------------------------------------------------------------- #
# T2 — cadenas de exposición
# --------------------------------------------------------------------------------------- #


def duties(contract: Contract) -> list:
    """Lo que se puede incumplir: obligaciones (con las garantías) y prohibiciones."""
    return [sid for sid, s in contract.statements.items() if s["kind"] in ("obligation", "prohibition")]


def gating_conditions(contract: Contract) -> dict:
    out = collections.defaultdict(list)
    for c in contract.conditions.values():
        if c.get("gatesId"):
            out[c["gatesId"]].append(c)
    return out


def match_gold_statements(contract: Contract, gold: dict, one_to_one: bool = True) -> dict:
    """Cada enunciado de la referencia anotada → el enunciado del grafo que lo recoge: mismo
    párrafo, texto que se solapa y, a igualdad, mismo tipo y misma parte. Versión reducida
    del emparejamiento de `evaluate_kg.ipynb`.

    Con `one_to_one=False` devuelve, para cada uno, el conjunto de todos los enunciados del
    grafo que lo recogen con la misma parte obligada: el grafo a veces parte en dos lo que la
    referencia anota como uno (la garantía de §8.4 son dos enunciados), y cualquiera de las
    dos mitades es una respuesta correcta."""
    stop = STOPWORDS

    def tokens(text):
        return {w for w in WORD.findall(norm(text)) if w not in stop}

    def short(pid):
        return paragraph_number(pid)

    gold_party = {}
    for g in gold["parties"]:
        names = {norm(n) for n in [g["name"], *g.get("aliases", [])]}
        for pid, p in contract.parties.items():
            if names & {norm(n) for n in [p["name"], *p.get("aliases", [])]}:
                gold_party[g["key"]] = pid

    pairs = []
    for g in gold["statements"]:
        gp = {short(p) for p in g["paragraphs"]}
        tg = tokens(g["text"])
        for sid, s in contract.statements.items():
            if not gp & {short(p) for p in s.get("paragraphIds") or []}:
                continue
            tk = tokens(statement_text(s))
            if not tg or not tk:
                continue
            inter = len(tg & tk)
            cg, ck = inter / len(tg), inter / len(tk)
            f1 = 0 if cg + ck == 0 else 2 * cg * ck / (cg + ck)
            if not (f1 >= 0.5 or cg >= 0.8 or (ck >= 0.8 and len(tk) >= 4)):
                continue
            same_party = s.get("burdenPartyId") == gold_party.get(g["burden"])
            bonus = 0.2 * (s["kind"] == g["kind"]) + 0.3 * same_party
            pairs.append((f1 + bonus, g["id"], sid, same_party))
    if not one_to_one:
        many = collections.defaultdict(set)
        for _, gid, sid, same_party in pairs:
            if same_party or gold_party.get(next(x["burden"] for x in gold["statements"] if x["id"] == gid)) is None:
                many[gid].add(sid)
        return dict(many)
    out, used = {}, set()
    for _, gid, sid, _ in sorted(pairs, reverse=True):
        if gid not in out and sid not in used:
            out[gid] = sid
            used.add(sid)
    return out


def t2_scores(contract: Contract, consequence: str, candidates: list, trigger: str, method: str, cache: dict) -> np.ndarray:
    """Puntuación de cada deber candidato como el incumplido que abre `consequence`."""
    s = contract.statements[consequence]
    query_text = f"{trigger} {statement_text(s)}".strip()
    if method == "orden del documento":
        here = contract.position[consequence]
        # el deber suele ir escrito antes que su remedio; a igual distancia, el anterior
        return np.array([-abs(here[0] - contract.position[c][0]) - 0.5 * (contract.position[c] > here) for c in candidates], dtype=float)
    if method == "texto: TF-IDF":
        return tfidf_similarity([query_text], [statement_text(contract.statements[c]) for c in candidates])[0]
    if method == "texto: MiniLM":
        q = encode([query_text])[0]
        return np.array([cache["minilm"][c] @ q for c in candidates])
    if method.startswith("estructura: "):
        vectors, e2i = cache[method]
        v = vectors[e2i[consequence]]
        return np.array([vectors[e2i[c]] @ v for c in candidates])
    raise ValueError(method)


def same_beneficiary(contract: Contract, consequence: str, candidates: list) -> np.ndarray:
    """1 si el deber protege a la misma parte que la consecuencia: el remedio va a quien era
    acreedor del deber incumplido. Usa `benefitPartyId`, un campo que ya está en el grafo."""
    b = contract.statements[consequence].get("benefitPartyId")
    return np.array([float(b is not None and contract.statements[c].get("benefitPartyId") == b) for c in candidates])


# --------------------------------------------------------------------------------------- #
# Experimentos completos
# --------------------------------------------------------------------------------------- #

RESULTS_DIR = ROOT / "infra/json/link_prediction"


def fingerprint(path: Path) -> str:
    import hashlib

    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:12]


def cached(key: str, compute, inputs: dict, depends: list | None = None, recompute: bool = False):
    """Guarda el resultado de un experimento largo en `infra/json/link_prediction/results.json`
    junto a la huella de lo que lo produjo: los grafos, la configuración y el código. El código
    es este módulo entero, o solo las funciones de `depends` si se dan. Si algo cambia, se
    recalcula; con `recompute=True`, siempre."""
    import inspect

    path = RESULTS_DIR / "results.json"
    code = "".join(inspect.getsource(f) for f in depends) if depends else Path(__file__).read_text()
    stamp = json.dumps({**inputs, "code": __import__("hashlib").sha256(code.encode()).hexdigest()[:12]}, sort_keys=True, default=str)
    store = json.loads(path.read_text()) if path.exists() else {}
    entry = store.get(key)
    if entry and entry["inputs"] == stamp and not recompute:
        return entry["result"]
    result = compute()
    store = json.loads(path.read_text()) if path.exists() else {}
    store[key] = {"inputs": stamp, "result": result}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, ensure_ascii=False, indent=1, default=float))
    return result


TUNING_GRID = {
    "loss": ("1vsall", "margin"),
    "lr": (0.003, 0.01, 0.03, 0.1),
    "epochs": (100, 300),
    "embedding_dim": (32, 128),
}


def tune_kge(contract: Contract, models=KGE_MODELS, seeds=(0, 1), log=print) -> dict:
    """Rejilla pequeña por modelo, elegida por el MRR sobre aristas de validación de cualquier
    tipo (`kge_validation_mrr`): la configuración se fija sin mirar T1, T2 ni T3."""
    import itertools

    rows, best = [], {}
    for m in models:
        for loss, lr, epochs, dim in itertools.product(*TUNING_GRID.values()):
            cfg = {"loss": loss, "lr": lr, "epochs": epochs, "embedding_dim": dim}
            value = float(np.mean([kge_validation_mrr(m, contract, seed=s, **cfg) for s in seeds]))
            rows.append({"modelo": m, **cfg, "MRR validación": value})
            if m not in best or value > best[m]["MRR validación"]:
                best[m] = {**cfg, "MRR validación": value}
        log(f"{m}: {best[m]}")
    return {"best": best, "rows": rows}


def table(rows: list, columns: list | None = None, digits: int = 3):
    """Una lista de diccionarios como tabla Markdown, para que el cuaderno se lea sin pandas."""
    from IPython.display import Markdown

    if not rows:
        return Markdown("*(vacío)*")
    columns = columns or [c for c in rows[0] if not c.startswith("_")]

    def cell(v):
        if isinstance(v, float):
            return "—" if math.isnan(v) else f"{v:.{digits}f}"
        if isinstance(v, (np.floating,)):
            return f"{float(v):.{digits}f}"
        if isinstance(v, dict):
            return ", ".join(f"{k} {x}" for k, x in v.items()) or "—"
        if isinstance(v, (list, tuple, set)):
            return ", ".join(map(str, v))
        return str(v).replace("|", "\\|").replace("\n", " ")

    lines = ["| " + " | ".join(columns) + " |", "|" + "---|" * len(columns)]
    lines += ["| " + " | ".join(cell(r.get(c, "")) for c in columns) + " |" for r in rows]
    return Markdown("\n".join(lines))


def _argmax_party(row: np.ndarray, parties: list, e2i: dict):
    scores = [row[e2i[p]] for p in parties]
    if scores[0] == scores[1]:
        return None  # empate: medio acierto
    return parties[int(np.argmax(scores))]


def run_t1(
    contract: Contract,
    kge_configs: dict,
    repeats: int = 3,
    k: int = 5,
    nbfnet_epochs: int = 10,
    twins_as_nbfnet_queries: bool = False,
    log=print,
) -> dict:
    """Validación cruzada sobre las aristas de parte de los enunciados **unilaterales**.

    Los gemelos bilaterales no se prueban: su parte la fija la extracción por construcción (uno
    por parte) y cualquier predicción de una sola parte acierta la mitad. Sí se quedan en el
    grafo como contexto conocido. Devuelve {método: {repetición: {enunciado: parte o None}}}."""
    queries = [q for q in party_queries(contract) if q[0] not in contract.twin]
    known_twins = [q for q in party_queries(contract) if q[0] in contract.twin]
    e2i, r2i = entity_ids(contract)
    parties = sorted(contract.parties)
    embeddings = dict(zip(contract.statements, encode([statement_text(s) for s in contract.statements.values()])))
    preds = collections.defaultdict(lambda: collections.defaultdict(dict))
    for rep in range(repeats):
        fold_of = folds(len(queries), k, seed=rep)
        for fold in range(k):
            test = [q for q, f in zip(queries, fold_of) if f == fold]
            train = [q for q, f in zip(queries, fold_of) if f != fold] + known_twins
            held = set(test)
            graph = [t for t in contract.triples if t not in held]
            for method, out in t1_baselines(contract, train, test, embeddings).items():
                preds[method][rep].update(out)
            for model_name, cfg in kge_configs.items():
                model = train_kge(model_name, graph, e2i, r2i, seed=rep, **cfg)
                scores = kge_tail_scores(model, [(h, r) for h, r, _ in test], e2i, r2i)
                for (sid, _, _), row in zip(test, scores):
                    preds[model_name][rep][sid] = _argmax_party(row, parties, e2i)
            nbf_queries = [q for q in train if twins_as_nbfnet_queries or q[0] not in contract.twin]
            model = train_nbfnet(graph, nbf_queries, lambda h, r: parties, e2i, r2i, seed=rep, epochs=nbfnet_epochs)
            scores = nbfnet_scores(model, [(h, r) for h, r, _ in test], e2i, r2i)
            for (sid, _, _), row in zip(test, scores):
                preds["NBFNet"][rep][sid] = _argmax_party(row, parties, e2i)
        log(f"{contract.name}: repetición {rep + 1}/{repeats} hecha")
    return {"queries": [list(q) for q in queries], "preds": {m: {str(r): p for r, p in v.items()} for m, v in preds.items()}}


def t1_summary(result: dict) -> list:
    """Acierto por método: media y rango entre repeticiones, e intervalo de Wilson al 95%
    sobre todas las predicciones juntas."""
    truth = {sid: p for sid, _, p in result["queries"]}
    rows = []
    for method, by_rep in result["preds"].items():
        accs, hits, n = [], 0.0, 0
        for pred in by_rep.values():
            score = [1.0 if pred[s] == truth[s] else 0.5 if pred[s] is None else 0.0 for s in pred]
            accs.append(float(np.mean(score)))
            hits += sum(score)
            n += len(score)
        lo, hi = wilson(hits, n)
        rows.append({"método": method, "acierto": np.mean(accs), "peor": min(accs), "mejor": max(accs), "IC95 bajo": lo, "IC95 alto": hi, "n": len(truth)})
    return sorted(rows, key=lambda r: -r["acierto"])


def provision_groups(contract: Contract, queries: list) -> list:
    """Grupo de cada consulta: la misma arista sale de los dos gemelos de una disposición
    bilateral, y si uno queda en entrenamiento y el otro en prueba, el modelo copia la
    respuesta en vez de deducirla. Los dos van juntos al mismo pliegue."""
    present = set(queries)
    out = []
    for h, r, t in queries:
        twin = contract.twin.get(h)
        out.append(f"{min(h, twin)}|{r}|{t}" if twin and (twin, r, t) in present else f"{h}|{r}|{t}")
    return out


def grouped_folds(groups: list, k: int, seed: int) -> np.ndarray:
    keys = sorted(set(groups))
    fold_of_key = dict(zip(keys, folds(len(keys), k, seed)))
    return np.array([fold_of_key[g] for g in groups])


def run_t3(
    contract: Contract,
    kge_configs: dict,
    repeats: int = 3,
    k: int = 5,
    nbfnet_epochs: int = 20,
    group_twins: bool = True,
    log=print,
) -> dict:
    """Validación cruzada sobre las aristas `depends_on`, `modifies` y `references`: se oculta
    cada pliegue y se ordenan todas las cláusulas como destino. Las dos aristas iguales de un
    par de gemelos caen en el mismo pliegue (`provision_groups`); `group_twins=False` las reparte
    al azar, solo para medir cuánto infla eso a los modelos de grafo. Rangos filtrados: los otros
    destinos verdaderos de la misma consulta no cuentan como error."""
    queries = clause_queries(contract)
    cids = list(contract.clauses)
    cidx = [entity_ids(contract)[0][c] for c in cids]
    true_targets = collections.defaultdict(set)
    for h, r, t in queries:
        true_targets[(h, r)].add(t)
    e2i, r2i = entity_ids(contract)
    texts = [source_text(contract, h) for h, _, _ in queries]
    clause_texts = [contract.clause_text[c] for c in cids]
    sims_all = {"tfidf": tfidf_similarity(texts, clause_texts), "minilm": encode(texts) @ encode(clause_texts).T}
    groups = provision_groups(contract, queries) if group_twins else [f"{h}|{r}|{t}" for h, r, t in queries]
    ranks = collections.defaultdict(lambda: collections.defaultdict(dict))
    k = min(k, len(set(groups)))
    for rep in range(repeats):
        fold_of = grouped_folds(groups, k, seed=rep)
        for fold in range(k):
            idx = [i for i, f in enumerate(fold_of) if f == fold]
            test = [queries[i] for i in idx]
            held = set(test)
            graph = [t for t in contract.triples if t not in held]
            sims = {name: m[idx] for name, m in sims_all.items()}
            scored = {}
            known = [t for t in graph if t[1] in CLAUSE_RELATIONS]
            scored.update(t3_baseline_scores(contract, test, sims, known))
            cited = np.asarray(scored.pop("_cited"))
            for model_name, cfg in kge_configs.items():
                model = train_kge(model_name, graph, e2i, r2i, seed=rep, **cfg)
                scored[model_name] = kge_tail_scores(model, [(h, r) for h, r, _ in test], e2i, r2i)[:, cidx]
            if known:
                model = train_nbfnet(graph, known, lambda h, r: cids, e2i, r2i, seed=rep, epochs=nbfnet_epochs)
                scored["NBFNet"] = nbfnet_scores(model, [(h, r) for h, r, _ in test], e2i, r2i)[:, cidx]
            for model_name in HYBRID_MODELS:
                if model_name in scored:
                    scored[f"número citado→{model_name}"] = cited * 1000 + percentile_rows(np.asarray(scored[model_name]))
            for method, rows in scored.items():
                for (h, r, t), row in zip(test, rows):
                    ranks[method][str(rep)][f"{h}|{r}|{t}"] = filtered_rank(np.asarray(row), cids, t, true_targets[(h, r)] - {t})
        log(f"{contract.name}: repetición {rep + 1}/{repeats} hecha")
    return {"queries": [list(q) for q in queries], "ranks": {m: dict(v) for m, v in ranks.items()}}


def t3_summary(result: dict, relation: str | None = None) -> list:
    rows = []
    for method, by_rep in result["ranks"].items():
        per_rep = []
        for ranks in by_rep.values():
            values = [v for key, v in ranks.items() if relation is None or key.split("|")[1] == relation]
            if values:
                per_rep.append(ranking_metrics(values))
        if not per_rep:
            continue
        mrrs = [m["MRR"] for m in per_rep]
        row = {"método": method, "MRR": np.mean(mrrs), "peor": min(mrrs), "mejor": max(mrrs)}
        for key in ("Hits@1", "Hits@3", "Hits@10"):
            row[key] = np.mean([m[key] for m in per_rep])
        row["n"] = per_rep[0]["n"]
        rows.append(row)
    return sorted(rows, key=lambda r: -r["MRR"])


# --------------------------------------------------------------------------------------- #
# De las aristas al veredicto: a quién favorece y qué exposición genera
# --------------------------------------------------------------------------------------- #

KIND_ES = {"obligation": "obligación", "right": "derecho", "prohibition": "prohibición"}


def direction(contract: Contract, sid: str):
    """(quien carga, quien se beneficia) de un enunciado, o None si le falta una de las dos.
    Sale de las aristas de parte y de `benefitPartyId`/`burdenPartyId`: en estos grafos las dos
    partes son siempre distintas, así que conocer una basta para conocer la otra."""
    s = contract.statements[sid]
    burden, benefit = s.get("burdenPartyId"), s.get("benefitPartyId")
    if burden and not benefit:
        benefit = contract.other_party(burden)
    if benefit and not burden:
        burden = contract.other_party(benefit)
    return (burden, benefit) if burden and benefit else None


def clause_verdicts(contract: Contract) -> list:
    """Veredicto de cada cláusula sin pesos, en dos grados:

    - **unánime**: todos sus enunciados unilaterales sirven a la misma parte. Vale para
      cualquier peso positivo que se le dé a cada enunciado.
    - **dominante**: una parte recibe al menos tantos derechos, obligaciones a su favor y
      prohibiciones a su favor como la otra, y más en alguno de los tres. Vale para cualquier
      peso positivo por tipo, así que ningún slider puede darle la vuelta.
    - **depende de los pesos**: lo demás. Es la respuesta honesta cuando el resultado
      cambiaría según cuánto se valore un derecho frente a una obligación.

    Los gemelos bilaterales se cuentan aparte, como recíprocos: sirven a las dos partes."""
    rows = []
    for cid, clause in list(contract.clauses.items()) + [(None, {"ref": "—", "heading": "(sin cláusula)"})]:
        sids = [sid for sid, s in contract.statements.items() if s.get("clauseId") == cid]
        if not sids:
            continue
        counts = {p: collections.Counter() for p in contract.parties}
        favour = {p: [] for p in contract.parties}
        reciprocal, unknown = [], []
        for sid in sids:
            if sid in contract.twin:
                reciprocal.append(sid)
                continue
            d = direction(contract, sid)
            if d is None:
                unknown.append(sid)
                continue
            counts[d[1]][contract.statements[sid]["kind"]] += 1
            favour[d[1]].append(sid)
        a, b = sorted(contract.parties)
        kinds = ("right", "obligation", "prohibition")
        ge_a = all(counts[a][x] >= counts[b][x] for x in kinds)
        ge_b = all(counts[b][x] >= counts[a][x] for x in kinds)
        if favour[a] and not favour[b]:
            verdict, winner = "unánime", a
        elif favour[b] and not favour[a]:
            verdict, winner = "unánime", b
        elif ge_a and not ge_b:
            verdict, winner = "dominante", a
        elif ge_b and not ge_a:
            verdict, winner = "dominante", b
        elif favour[a] or favour[b]:
            verdict, winner = "depende de los pesos", None
        elif reciprocal:
            verdict, winner = "recíproca", None
        else:
            verdict, winner = "sin partes", None
        rows.append(
            {
                "cláusula": cid,
                "ref": clause.get("ref") or "—",
                "título": clause.get("heading") or "",
                "veredicto": verdict,
                "a favor de": contract.parties[winner]["name"] if winner else "",
                **{f"sirve a {contract.parties[p]['name']}": dict(counts[p]) for p in (a, b)},
                "recíprocos": len(reciprocal),
                "sin parte": len(unknown),
                "_favour": favour,
            }
        )
    return rows


CURRENT_WEIGHTS = {"right": 0.3, "obligation": 0.7, "prohibition": 1.0}


def weighted_share(contract: Contract, cid, weights: dict = CURRENT_WEIGHTS) -> dict:
    """El reparto que dibuja hoy la barra (`benefit-share.ts`), recalculado aquí solo para
    compararlo: cada enunciado suma su peso a la parte que sirve; los recíprocos, a las dos."""
    total = collections.Counter()
    for sid, s in contract.statements.items():
        if s.get("clauseId") != cid:
            continue
        if sid in contract.twin:
            for p in contract.parties:
                total[p] += weights[s["kind"]] / 2  # cada gemelo suma a una; el par, a las dos
            continue
        d = direction(contract, sid)
        if d:
            total[d[1]] += weights[s["kind"]]
    return dict(total)


WEIGHT_SETS = {
    "pesos actuales (0,3 · 0,7 · 1,0)": CURRENT_WEIGHTS,
    "contar (1 · 1 · 1)": {"right": 1.0, "obligation": 1.0, "prohibition": 1.0},
    "al revés (1,0 · 0,7 · 0,3)": {"right": 1.0, "obligation": 0.7, "prohibition": 0.3},
}


def weight_flips(contract: Contract) -> list:
    """Para cada cláusula que «depende de los pesos», quién gana la barra con cada juego de
    pesos de `WEIGHT_SETS`. Si el ganador cambia, el veredicto de la barra era de los pesos."""
    rows = []
    for v in clause_verdicts(contract):
        if v["veredicto"] != "depende de los pesos":
            continue
        row = {"§": v["ref"], "título": v["título"][:30]}
        winners = set()
        for label, weights in WEIGHT_SETS.items():
            share = weighted_share(contract, v["cláusula"], weights)
            total = sum(share.values())
            if not total or len(set(share.values())) == 1 and len(share) == 2:
                row[label] = "empate"
                winners.add(None)
                continue
            best = max(share, key=share.get)
            row[label] = f"{contract.parties[best]['name'][:18]} {share[best] / total:.0%}"
            winners.add(best)
        row["cambia de ganador"] = len(winners) > 1
        rows.append(row)
    return rows


def exposure_paths(contract: Contract, links: dict) -> list:
    """Un camino de exposición por consecuencia: deber(es) de A → disparador → consecuencia a
    favor de B → cifras.

    `links` = {consecuencia: {"duties": [deberes incumplidos], "generic": parte o None,
    "source": "anotado" | "predicho"}}. Cada camino usa solo lo que ya está en el grafo
    —aristas de parte, la condición que cierra la consecuencia (`gatesId`) y los valores que la
    cuantifican (`quantifiesId`)— más el vínculo consecuencia → deber, que es lo único que se
    predice y que se guarda fuera del grafo."""
    gates = gating_conditions(contract)
    quantified = collections.defaultdict(list)
    for v in contract.values.values():
        if v.get("quantifiesId"):
            quantified[v["quantifiesId"]].append(v)

    def ref(sid):
        return contract.clauses.get(contract.statements[sid].get("clauseId"), {}).get("ref") or "—"

    paths = []
    for consequence, link in links.items():
        cons = contract.statements[consequence]
        d = direction(contract, consequence)
        creditor = d[1] if d else cons.get("benefitPartyId")
        duty_ids = list(link.get("duties") or [])
        debtors = {(direction(contract, x) or (None, None))[0] for x in duty_ids} or {link.get("generic")}
        debtor = debtors.pop() if len(debtors) == 1 else None
        if duty_ids:
            ordered = sorted(duty_ids, key=lambda x: contract.position[x])
            described = "; ".join(f"{x} (§{ref(x)})" for x in ordered[:2])
            if len(ordered) > 2:
                rest = sorted({ref(x) for x in ordered[2:]})
                described += f" y {len(ordered) - 2} más (§{', §'.join(rest)})"
        else:
            described = f"cualquier deber de {contract.parties[debtor]['name']}" if debtor else "?"
        paths.append(
            {
                "expone a": contract.parties[debtor]["name"] if debtor else "?",
                "deber incumplido": described,
                "disparador": " / ".join(c["trigger"] for c in gates.get(consequence, [])),
                "consecuencia": f"{consequence} (§{ref(consequence)})",
                "tipo": KIND_ES[cons["kind"]],
                "a favor de": contract.parties[creditor]["name"] if creditor else "?",
                "cifras": ", ".join(f"{v['amount']} {v['unit']}".strip() for v in quantified.get(consequence, [])),
                "vínculo": link.get("source", ""),
            }
        )
    return paths


def limiting_paths(contract: Contract) -> list:
    """Caminos de neutralización: un derecho de A que `modifies` una cláusula donde A debe algo
    a B. Es la forma en que el grafo dice «esta exclusión recorta aquella garantía»."""
    out = []
    for h, r, t in contract.triples:
        if r != "modifies" or h not in contract.statements:
            continue
        d = direction(contract, h)
        if not d or contract.statements[h]["kind"] != "right":
            continue
        holder = d[1]
        owed = [
            sid
            for sid, s in contract.statements.items()
            if s.get("clauseId") == t and s["kind"] in ("obligation", "prohibition") and (direction(contract, sid) or (None,))[0] == holder
        ]
        if h in owed or contract.statements[h].get("clauseId") == t:
            continue  # se modifica a sí misma o a su propia cláusula: no recorta nada ajeno
        for sid in owed:
            out.append(
                {
                    "derecho que recorta": h,
                    "§ derecho": contract.clauses.get(contract.statements[h].get("clauseId"), {}).get("ref"),
                    "titular": contract.parties[holder]["name"],
                    "cláusula recortada": contract.clauses[t].get("ref"),
                    "deber recortado": sid,
                    "a quien protegía": contract.parties[contract.other_party(holder)]["name"],
                }
            )
    return out


# --------------------------------------------------------------------------------------- #
# T2 — experimento
# --------------------------------------------------------------------------------------- #

T2_METHODS = ("orden del documento", "texto: TF-IDF", "texto: MiniLM")


def expected_random_rr(n: int, m: int) -> float:
    """1/rango esperado de la primera de m respuestas correctas entre n, ordenadas al azar."""
    from math import comb

    return sum((1 / r) * comb(n - r, m - 1) / comb(n, m) for r in range(1, n - m + 2))


def t2_queries(contract: Contract, gold: dict, proposal: list) -> list:
    """Las filas «específica» de la anotación, pasadas a ids del grafo: (condición anotada,
    consecuencia, conjunto de deberes correctos)."""
    one = match_gold_statements(contract, gold)
    many = match_gold_statements(contract, gold, one_to_one=False)
    out = []
    for cond, consequence, kind, breached, _note in proposal:
        if kind != "específica" or consequence not in one:
            continue
        correct = set().union(*(many.get(b, set()) for b in breached))
        if correct:
            out.append((cond, one[consequence], correct))
    return out


def run_t2(contract: Contract, queries: list, structure: dict) -> dict:
    """Rango del primer deber correcto para cada consulta y método. `structure` trae, por
    modelo, (vectores de entidad, e2i) de un modelo de grafo entrenado con el grafo entero:
    no hay ninguna arista consecuencia → deber de la que aprender, así que lo único que puede
    aportar la estructura es cercanía."""
    gates = gating_conditions(contract)
    candidates_all = duties(contract)
    cache = {"minilm": dict(zip(contract.statements, encode([statement_text(s) for s in contract.statements.values()])))}
    methods = list(T2_METHODS)
    for name, value in structure.items():
        cache[f"estructura: {name}"] = value
        methods.append(f"estructura: {name}")
    rows = []
    for cond, consequence, correct in queries:
        trigger = " ".join(c["trigger"] for c in gates.get(consequence, []))
        cands = [c for c in candidates_all if c != consequence]
        benef = same_beneficiary(contract, consequence, cands)
        row = {
            "condición": cond,
            "consecuencia": consequence,
            "correctos": sorted(correct),
            "candidatos": len(cands),
            # al azar: (candidatos, correctos entre ellos), para calcular lo esperado
            "al azar": (len(cands), len(correct & set(cands))),
            "al azar, mismo beneficiario": (int(benef.sum()), len(correct & {c for c, b in zip(cands, benef) if b})),
        }
        clause_of = {c: contract.statements[c].get("clauseId") for c in cands}
        correct_clauses = {clause_of[c] for c in correct if c in clause_of}
        for method in methods:
            scores = t2_scores(contract, consequence, cands, trigger, method, cache)
            for label, s in ((method, scores), (f"mismo beneficiario → {method}", scores + 1e6 * benef)):
                row[label] = rank_of_first(dict(zip(cands, s)), correct)
                # en el esquema actual: consecuencia → cláusula del deber (depends_on a cláusula)
                best = {}
                for c, v in zip(cands, s):
                    best[clause_of[c]] = max(best.get(clause_of[c], -np.inf), v)
                row[f"[cláusula] {label}"] = rank_of_first(best, correct_clauses)
        rows.append(row)
    return {"rows": rows, "methods": methods}


def paired_mrr_difference(ranks_a: dict, ranks_b: dict, reps: int = 2000, seed: int = 0) -> tuple:
    """Diferencia de MRR (a − b) sobre las mismas consultas y su intervalo bootstrap al 95%,
    remuestreando consultas: lo que se compara es el mismo conjunto de aristas."""
    keys = sorted(set(ranks_a) & set(ranks_b))
    diff = 1 / np.array([ranks_a[k] for k in keys], dtype=float) - 1 / np.array([ranks_b[k] for k in keys], dtype=float)
    rng = np.random.default_rng(seed)
    means = diff[rng.integers(0, len(diff), size=(reps, len(diff)))].mean(axis=1)
    return float(diff.mean()), float(np.quantile(means, 0.025)), float(np.quantile(means, 0.975))


def expected_random_hits(n: int, m: int, k: int) -> float:
    """Probabilidad de que alguna de m respuestas correctas entre n caiga en las k primeras."""
    from math import comb

    if m == 0:
        return 0.0
    return 1 - comb(n - m, k) / comb(n, k) if k <= n else 1.0


def t2_summary(result: dict, prefix: str = "") -> list:
    """MRR y Hits@k por método. `prefix="[cláusula] "` da la versión a nivel de cláusula."""
    rows = result["rows"]
    out = []
    if not prefix:
        for label in ("al azar", "al azar, mismo beneficiario"):
            nm = [r[label] for r in rows]
            met = {"n": len(rows), "MRR": float(np.mean([expected_random_rr(n, m) if m else 0.0 for n, m in nm]))}
            for k in (1, 3, 10):
                met[f"Hits@{k}"] = float(np.mean([expected_random_hits(n, m, k) for n, m in nm]))
            out.append({"método": label + " (esperado)", **met, "IC95 bajo": np.nan, "IC95 alto": np.nan})
    for base in result["methods"]:
        for label in (base, f"mismo beneficiario → {base}"):
            ranks = [r[f"{prefix}{label}"] for r in rows]
            met = ranking_metrics(ranks)
            lo, hi = bootstrap_mrr(ranks)
            out.append({"método": label, **met, "IC95 bajo": lo, "IC95 alto": hi})
    return sorted(out, key=lambda r: -r["MRR"])

_COMMON_CODE = [Contract, load_contract, entity_ids, folds, norm, paragraph_number, statement_text, encode]
_GRAPH_CODE = [train_kge, kge_tail_scores, _nbfnet_class, train_nbfnet, nbfnet_scores]
T1_CODE = [*_COMMON_CODE, *_GRAPH_CODE, run_t1, t1_baselines, party_queries, aliases, subject_party, _argmax_party]
T3_CODE = [
    *_COMMON_CODE,
    *_GRAPH_CODE,
    run_t3,
    percentile_rows,
    provision_groups,
    grouped_folds,
    t3_baseline_scores,
    clause_queries,
    source_text,
    source_context,
    source_clause,
    clause_by_number,
    mentioned_clauses,
    tree_distance,
    clause_order,
    filtered_rank,
    rank_of_first,
    tfidf_similarity,
]
