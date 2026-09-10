import json, collections, sys, glob
import networkx as nx

D, TOL, MAXIT = 0.85, 1e-9, 200

def build(path):
    kg = json.load(open(path))
    d = [dict(n, kind=k[:-1]) for k in ('obligations','rights','prohibitions') for n in kg[k]]
    ids = [p['id'] for p in kg['parties']]+[c['id'] for c in kg['clauses']]+[t['id'] for t in kg['definedTerms']] \
        + [v['id'] for v in d]+[c['id'] for c in kg['conditions']]+[r['id'] for r in kg['references']]+[v['id'] for v in kg['values']]
    idx = {i: n for n, i in enumerate(ids)}
    adj = [[] for _ in ids]
    for e in kg['edges']:
        s, t = idx.get(e['source']), idx.get(e['target'])
        if s is not None and t is not None:
            adj[s].append(t); adj[t].append(s)     # no dirigido, aristas repetidas incluidas
    V = collections.defaultdict(list)
    for v in d:
        if v.get('clauseId'): V[v['clauseId']].append(v['id'])
    pi = [0.0]*len(ids)
    for c, vs in V.items():
        for x in vs: pi[idx[x]] += 1.0/(len(V)*len(vs))
    return kg, ids, idx, adj, V, pi

def ours(ids, adj, pi, start=None):
    n = len(ids); r = list(start) if start else pi[:]
    it = 0
    for it in range(1, MAXIT+1):
        nx_ = [0.0]*n; dang = 0.0
        for j in range(n):
            k = len(adj[j])
            if k == 0: dang += r[j]; continue
            sh = D*r[j]/k
            for nb in adj[j]: nx_[nb] += sh
        base = 1 - D + D*dang
        delta = 0.0
        for i in range(n):
            nx_[i] += base*pi[i]; delta += abs(nx_[i]-r[i])
        r = nx_
        if delta < TOL: break
    return r, it

for path in sorted(glob.glob('infra/json/kg/*.json')):
    kg, ids, idx, adj, V, pi = build(path)
    r, iters = ours(ids, adj, pi)

    # 1 · propiedades
    mass = sum(r); neg = sum(1 for x in r if x < 0)

    # 2 · residuo del punto fijo: aplicar una iteración más
    r2, _ = ours(ids, adj, pi, start=r)
    resid = sum(abs(a-b) for a, b in zip(r, r2))

    # 3 · unicidad: arrancar desde uniforme
    uni = [1/len(ids)]*len(ids)
    r3, it3 = ours(ids, adj, pi, start=uni)
    same = max(abs(a-b) for a, b in zip(r, r3))

    # 4 · referencia networkx, mismo multigrafo no dirigido
    G = nx.MultiGraph()
    G.add_nodes_from(ids)
    for j, nbs in enumerate(adj):
        for nb in nbs:
            if j < nb: G.add_edge(ids[j], ids[nb])
    pers = {ids[i]: pi[i] for i in range(len(ids))}
    ref = nx.pagerank(G, alpha=D, personalization=pers, dangling=pers, tol=1e-12, max_iter=500)
    diff = max(abs(r[idx[k]] - ref[k]) for k in ref)

    # 5 · el ranking de cláusulas, que es lo que se usa
    mine = sorted(V, key=lambda c: -sum(r[idx[x]] for x in V[c]))
    theirs = sorted(V, key=lambda c: -sum(ref[x] for x in V[c]))

    print(f"\n{path.split('/')[-1][:46]}")
    print(f"   nodos {len(ids):4} · iteraciones {iters:3} · masa {mass:.12f} · negativos {neg}")
    print(f"   residuo del punto fijo   {resid:.3e}")
    print(f"   desde vector uniforme    {same:.3e}   (unicidad)")
    print(f"   vs networkx.pagerank     {diff:.3e}   ({'IGUAL' if diff < 1e-9 else 'DIFIERE'})")
    print(f"   mismo orden de cláusulas: {mine == theirs}")
