# Relevancia de la cláusula — el orden «by relevance»

Decide en qué orden aparecen las filas del Clause Analyzer cuando el lector elige
«by relevance».

En una frase:

> **Sube la cláusula que las demás necesitan para leerse.**

La calcula `server/services/graph/knowledge/personalized_pagerank.py` y la sirve
`POST /api/v1/knowledge_graph/<doc>/clause_importance`. Todas las cifras de este documento
salen del fragmento del final, que llama al mismo módulo que usa el servidor.

Los otros dos órdenes no cambian: «by size» cuenta los cuadrados de la fila y «by order»
sigue el contrato.

---

## 1. Los enlaces, y hacia dónde apuntan

Tres aristas del grafo unen una cláusula con otra. Las tres salen del texto: la cláusula
que las escribe nombra a la otra.

El paseo no las recorre como están escritas. Las recorre **de la cláusula que se lee hacia
la que hace falta leer**. Esa flecha se escribe $c' \to c$ y se lee «para leer $c'$ hace
falta $c$»:

| En el grafo | Flecha del paseo | Por qué |
|---|---|---|
| A `modifies` B | $B \to A$ | Quien lee B tiene que ir a A: A la limita, la exceptúa o la cancela. |
| A `depends_on` B | $A \to B$ | Quien lee A tiene que ir a B: si A se aplica depende de B. |
| A `references` B | $A \to B$ | Quien lee A tiene que ir a B: A remite a ella. |

La cláusula a la que llega la flecha es la que recibe relevancia. Por eso `modifies` se
recorre al revés: si A modifica a B, la que hace falta es A.

Tres reglas más:

- **Un enlace que nombra una sección vale para las cláusulas que cuelgan de ella.** Si §13.1
  modifica «el Artículo 11», quien lee §11.1 necesita §13.1. Una sección que es solo un
  título (tiene subcláusulas y ningún enunciado propio) no entra como cláusula.
- **Cada arista cuenta una vez.** Si dos frases de una cláusula modifican a otra, son dos
  flechas.
- **Una cláusula no se enlaza consigo misma.**

**No se sigue nada más:**

- *Las partes.* Cada enunciado está unido a su parte, y la parte reparte lo que recibe entre
  todos sus enunciados: la fila con más enunciados recibe más y el orden vuelve a ser el del
  tamaño.
- *Las condiciones, los valores y las referencias.* Cuelgan de un solo enunciado; no unen
  dos cláusulas.
- *Los términos definidos.* Casi todas las cláusulas usan palabras de «Definitions», que
  quedaría primera en cualquier contrato sin decir nada nuevo.
- *La jerarquía por sí sola* (subcláusula → sección). Lleva el paseo a la sección sin un
  motivo que se pueda enseñar en la fila.

---

## 2. Las fórmulas

Es un PageRank personalizado sobre ese grafo de cláusulas.

**El prior.** Dice dónde empieza el paseo y dónde vuelve a empezar. Reparte lo mismo a cada
fila:

$$
\pi(c)=\begin{cases}\dfrac{1}{|F|} & c\in F\\[8pt] 0 & c\notin F\end{cases}
$$

**La iteración.** En cada ronda, cada cláusula reparte la mitad de lo que tiene entre las
cláusulas que necesita, y la otra mitad vuelve al prior:

$$
R^{(t+1)}(c)=\bigl(1-d+d\,D^{(t)}\bigr)\,\pi(c)\;+\;d\sum_{(c'\to c)\,\in\,E}\frac{R^{(t)}(c')}{\operatorname{sal}(c')}
$$

$$
D^{(t)}=\sum_{c\,:\,\operatorname{sal}(c)=0}R^{(t)}(c)\qquad\quad R^{(0)}=\pi\qquad\quad d=0.5
$$

**La parada.**

$$
\sum_{c}\bigl|R^{(t+1)}(c)-R^{(t)}(c)\bigr|<10^{-9}\qquad\text{o}\qquad t=200
$$

Las filas se ordenan de mayor a menor $R(c)$.

### Qué significa cada término

| Término | Significado |
|---|---|
| $c$, $c'$ | Cláusulas del contrato. |
| $F$ | Las filas: las cláusulas con algún enunciado entre las dos partes que están en pantalla. $\lvert F\rvert$ es cuántas son. |
| $\pi(c)$ | El prior de la cláusula $c$: la probabilidad de que el paseo empiece, o vuelva a empezar, en ella. Es igual para todas las filas y cero para lo demás. |
| $E$ | Las flechas del apartado 1. Si dos aristas del grafo dicen lo mismo, la flecha está dos veces. |
| $c' \to c$ | Una flecha: para leer $c'$ hace falta $c$. |
| $\operatorname{sal}(c')$ | Cuántas flechas salen de $c'$. Lo que tiene $c'$ se reparte a partes iguales entre ellas. |
| $d$ | La probabilidad de seguir una flecha en vez de volver a empezar. Vale 0.5 (apartado 4). |
| $D^{(t)}$ | Lo que hay, en la ronda $t$, en cláusulas de las que no sale ninguna flecha. Como no tienen a dónde ir, vuelve entero por el prior. |
| $R^{(t)}(c)$ | La relevancia de $c$ en la ronda $t$. Empieza siendo el prior. |
| $R(c)$ | La relevancia final: la parte del tiempo que el paseo pasa en $c$. Entre todas las cláusulas suma 1. |

### Las dos partes de la fórmula

La relevancia de una cláusula es la suma de dos cosas:

- **Lo que le toca por ser una fila:** $\bigl(1-d+d\,D\bigr)\,\pi(c)$. Es igual para todas.
- **Lo que le mandan las cláusulas que la necesitan:** $d\sum R(c')/\operatorname{sal}(c')$.
  Cuenta cuántas la necesitan, cuán relevantes son y entre cuántas reparten.

Una fila que ninguna cláusula necesita se queda solo con lo primero. A ese valor se le llama
la **base**:

$$
b=\frac{1-d+d\,D}{|F|}\qquad\qquad R(c)=b+d\sum_{(c'\to c)\,\in\,E}\frac{R(c')}{\operatorname{sal}(c')}\quad (c\in F)
$$

Todas las filas que nadie necesita valen exactamente $b$. El grafo no da ningún motivo para
poner una delante de otra: empatan y quedan en el orden del contrato, detrás de las que
suben. El tamaño de la fila no entra en ningún paso.

---

## 3. Un ejemplo inventado

Un contrato de siete cláusulas entre Party A y Party B, sin texto. Cada tabla es una pestaña
de la tabla del Clause Analyzer: cuántos cuadrados tiene cada cláusula en cada columna. La
columna «Linked» es la misma en las tres, como en la app: a la izquierda de la línea lo que
la cláusula necesita, a la derecha quién la necesita.

**Obligations**

| Cláusula | Party A | Both | Party B | Linked |
|---|---|---|---|---|
| 1 | 4 | 0 | 1 | Modified by 7 │ – |
| 2 | 7 | 2 | 2 | Modified by 6, 7 │ – |
| 3 | 3 | 1 | 5 | Modified by 7 │ – |
| 4 | 2 | 0 | 9 | Depends on 5 │ – |
| 5 | 10 | 0 | 1 | Refers to 6 │ Needed by 1 (la 4) |
| 6 | 9 | 0 | 2 | – │ Needed by 2 (la 2 y la 5) |
| 7 | 2 | 3 | 3 | – │ Needed by 3 (la 1, la 2 y la 3) |

**Rights**

| Cláusula | Party A | Both | Party B | Linked |
|---|---|---|---|---|
| 1 | 3 | 0 | 8 | Modified by 7 │ – |
| 2 | 7 | 2 | 4 | Modified by 6, 7 │ – |
| 3 | 10 | 1 | 2 | Modified by 7 │ – |
| 4 | 4 | 3 | 6 | Depends on 5 │ – |
| 5 | 2 | 0 | 9 | Refers to 6 │ Needed by 1 (la 4) |
| 6 | 6 | 2 | 3 | – │ Needed by 2 (la 2 y la 5) |
| 7 | 9 | 1 | 5 | – │ Needed by 3 (la 1, la 2 y la 3) |

**Prohibitions**

| Cláusula | Party A | Both | Party B | Linked |
|---|---|---|---|---|
| 1 | 8 | 2 | 1 | Modified by 7 │ – |
| 2 | 4 | 0 | 7 | Modified by 6, 7 │ – |
| 3 | 6 | 3 | 5 | Modified by 7 │ – |
| 4 | 9 | 1 | 2 | Depends on 5 │ – |
| 5 | 3 | 2 | 10 | Refers to 6 │ Needed by 1 (la 4) |
| 6 | 7 | 0 | 4 | – │ Needed by 2 (la 2 y la 5) |
| 7 | 5 | 1 | 6 | – │ Needed by 3 (la 1, la 2 y la 3) |

### Los enlaces

| Arista del grafo | Flecha del paseo |
|---|---|
| 7 `modifies` 1 | $1 \to 7$ |
| 7 `modifies` 2 | $2 \to 7$ |
| 7 `modifies` 3 | $3 \to 7$ |
| 6 `modifies` 2, en dos frases | $2 \to 6$, dos veces |
| 4 `depends_on` 5 | $4 \to 5$ |
| 5 `references` 6 | $5 \to 6$ |

![El grafo del ejemplo: siete cláusulas y las flechas entre ellas](../img/relevancia-ejemplo.svg)

### El prior

Las siete cláusulas tienen cuadrados, así que las siete son filas: $\lvert F\rvert = 7$ y
$\pi(c) = 1/7$ para todas. Las tablas solo sirven para eso y para el orden «by size»: los
cuadrados no entran en la fórmula.

### La cuenta

Con $d = 0.5$. Las cláusulas 1, 2, 3 y 4 no las necesita nadie, así que valen la base $b$.
Las demás valen la base más la mitad de lo que les mandan:

$$
R(5)=b+\tfrac12\,R(4)=1.5\,b
$$

$$
R(6)=b+\tfrac12\Bigl(R(5)+\tfrac23\,R(2)\Bigr)=b+\tfrac12\bigl(1.5\,b+0.667\,b\bigr)=2.08\,b
$$

$$
R(7)=b+\tfrac12\Bigl(R(1)+R(3)+\tfrac13\,R(2)\Bigr)=b+\tfrac12\bigl(b+b+0.333\,b\bigr)=2.17\,b
$$

De la cláusula 2 salen tres flechas, dos a la 6 y una a la 7. Por eso manda $\tfrac23$ de lo
suyo a una y $\tfrac13$ a la otra.

Como todo suma 1:

$$
4\,b+1.5\,b+2.08\,b+2.17\,b=9.75\,b=1\quad\Rightarrow\quad b=0.1026
$$

Sale lo mismo por la fórmula de la base. De la 6 y la 7 no sale ninguna flecha, así que
$D = R(6)+R(7) = 4.25\,b$ y $b = (0.5 + 0.5\cdot 4.25\,b)/7$, que da $b = 0.1026$.

### Las rondas

El paseo empieza en $1/7 = 0.1429$ para todas y se estabiliza en 14 rondas:

| Ronda | Cláusulas 1 a 4 | Cláusula 5 | Cláusula 6 | Cláusula 7 |
|---|---|---|---|---|
| 0 | 0.1429 | 0.1429 | 0.1429 | 0.1429 |
| 1 | 0.0918 | 0.1633 | 0.2109 | 0.2585 |
| 2 | 0.1050 | 0.1509 | 0.2172 | 0.2121 |
| 14 | 0.1026 | 0.1538 | 0.2137 | 0.2222 |

### El resultado

| Puesto | By relevance | Vale | La necesitan |
|---|---|---|---|
| 1 | Cláusula 7 | 2.17 $b$ | la 1, la 2 y la 3 |
| 2 | Cláusula 6 | 2.08 $b$ | la 2 (dos veces) y la 5 |
| 3 | Cláusula 5 | 1.50 $b$ | la 4 |
| – | Cláusulas 1, 2, 3 y 4 | $b$ | ninguna |

El orden por relevancia es el mismo en las tres pestañas, porque no mira los cuadrados. El
orden «by size» cambia de una a otra (el tamaño es Party A más Party B):

| Pestaña | By size |
|---|---|
| Obligations | 4, 5, 6, 2, 3, 1, 7 |
| Rights | 7, 3, 1, 2, 5, 4, 6 |
| Prohibitions | 5, 2, 3, 4, 6, 7, 1 |

En Obligations la cláusula 7 es la última por tamaño y la primera por relevancia: tiene
pocos cuadrados, pero tres cláusulas no se leen bien sin ella.

La cláusula 6 queda segunda con solo dos cláusulas que la necesitan porque una de ellas, la
5, ya es relevante: ser necesaria para una cláusula relevante cuenta más.

---

## 4. Por qué $d = 0.5$ y no 0.85

$d$ decide cuánto dura el paseo antes de volver a empezar. Con 0.5 sigue de media una sola
flecha más, que es lo que hace quien lee un contrato y salta a la cláusula citada. Con el
valor de siempre, 0.85, sigue casi seis.

Cambiarlo mueve el orden entre las filas que suben. En el ejemplo, con 0.85 la cláusula 6
pasa por delante de la 7 (3.14 $b$ frente a 2.98 $b$), porque pesa más la cadena
$4 \to 5 \to 6$.

El motivo para elegir 0.5 se ve en los contratos reales. Con 0.85, dos cláusulas que se
necesitan la una a la otra se quedan con el paseo, que va y vuelve entre ellas, y acaban por
encima de cláusulas que muchas otras necesitan. En OrvaneTalvera, §2.2 y §8.4 se apuntan
entre sí:

| $d$ | 1.ª | 2.ª | 3.ª |
|---|---|---|---|
| 0.85 | §8.4 (6.7 veces la base; la necesita 1) | §2.2 (6.7; 1) | §9.3 (6.7; 1) |
| 0.5 | §11.2 (2.1; la necesitan 2) | §8.4 (2.0; 1) | §2.2 (2.0; 1) |

Es una elección, no un resultado medido: no hay todavía un criterio externo que diga cuál de
los dos órdenes es mejor. Lo que no cambia con $d$ es qué filas suben.

---

## 5. Lo que ve el lector

La cabecera de la tabla ofrece tres órdenes, porque responden a preguntas distintas:

| orden | pregunta | de dónde sale |
|---|---|---|
| **by size** (por defecto) | ¿dónde hay más en juego? | el número de cuadrados del tipo abierto, en las dos columnas |
| **by relevance** | ¿qué cláusula hace falta para leer las demás? | este documento: $R(c)$ |
| **by order** | ¿cómo está escrito? | el orden del contrato |

Con **by relevance**:

- **Primero van las filas que alguna cláusula necesita**, con su puesto en el círculo. El
  puesto se cuenta dentro de la pestaña abierta: 1, 2, 3… sin saltos.
- **Después van las demás, en el orden del contrato**, con «–» en el círculo. Al pasar el
  cursor dice por qué: ninguna cláusula la necesita.
- **Cada fila que sube enseña su motivo en «Linked»:** una ficha oscura al final de la celda,
  a la derecha de una línea fina, cuenta cuántas cláusulas la necesitan («Needed by 10»). A la
  izquierda de la línea siguen las fichas de color, que dicen lo que la fila necesita.
- **La lista que se abre sobre «Linked» sigue el mismo orden** y termina con «Needed by»: las
  cláusulas agrupadas por relación («Modifies», «Depended on by», «Referred to by»), cada una
  un botón que lleva a esa cláusula.
- **Al pasar el cursor por el círculo** sale el motivo en una frase: «Needed to read 10
  clauses: it modifies §3.1, §5.1…; §1.1, §6.7, §8.4 refer to it».

La ficha «Needed by» está en «Linked» con cualquiera de los tres órdenes: dice un hecho del
contrato, no del orden. Con **by order**, el círculo sigue diciendo el puesto por relevancia,
o «–». Con **by size**, el círculo es el puesto por tamaño.

El documento no cambia: al elegir una cláusula sigue dibujando solo lo que ella necesita.
Quien la necesita se ve en la tabla, y pulsando una de esas cláusulas el documento dibuja el
enlace desde su lado. Hay una excepción: cuando el enlace nombra una sección entera («el
Artículo 11»), hoy solo se ve desde «Needed by». La fila de la subcláusula y el documento
todavía leen la arista tal como está escrita y no lo muestran.

En un contrato sin enlaces entre cláusulas, como lease_contract_166, todas las filas llevan
«–» y «by relevance» coincide con «by order».

---

## 6. En los contratos

ρ es la correlación de Spearman entre el orden de las filas y su número de enunciados: cerca
de 1, el orden solo cuenta enunciados; cerca de 0, no tienen relación. Las cifras son del
contrato entero, con todas sus partes.

| contrato | filas | enlaces | filas que suben | ρ con el tamaño |
|---|---|---|---|---|
| Bellicum | 91 | 273 | 59 | −0.03 |
| Santander | 83 | 83 | 25 | 0.07 |
| OrvaneTalvera | 48 | 29 | 20 | −0.13 |
| HalversonCorvin | 19 | 7 | 4 | −0.24 |
| lease_contract_10 | 20 | 8 | 4 | 0.19 |
| Arequipa | 14 | 3 | 3 | 0.07 |
| lease_contract_201 | 8 | 7 | 3 | 0.26 |
| SteelVault | 22 | 6 | 1 | 0.22 |
| lease_contract_166 | 9 | 0 | 0 | — |

Un ρ bajo solo dice que el orden no es «contar enunciados». No prueba que el orden sea el
correcto: un orden al azar también daría ρ ≈ 0.

Las primeras filas de tres contratos:

| contrato | 1.ª por relevancia | puesto por tamaño | la necesitan |
|---|---|---|---|
| Bellicum | §4.10 Disclaimer | 70 | §4.1 a §4.9 y §8.1 |
| SteelVault | §11 Liability | 6 | §8.4 y §9 Indemnification |
| lease_contract_10 | §13.1 (fuerza mayor) | 15 | §11.1, §11.2, §12.1 y §13.2 |

---

## 7. Qué mide y qué no

- **Depende de que el contrato tenga enlaces entre cláusulas**, y fuera de Bellicum hay
  pocos. En SteelVault sube una fila de 22; en lease_contract_166, ninguna. Donde no hay
  enlaces el orden no inventa nada: deja las filas como están en el contrato.
- **Hereda los errores de la extracción.** Una arista mal puesta sube una fila que no toca,
  y una cita que la extracción no recogió la deja en la base. Por eso cada fila enseña quién
  la necesita: se puede comprobar contra el texto.
- **No mide importancia jurídica.** Dice qué cláusulas condicionan la lectura de otras, no
  cuánto importa cada una para un abogado.
- **No está validado.** No hay todavía un criterio externo con el que comparar el orden: es
  una ayuda para revisar, no un resultado medido.
- **Es del contrato, no de una parte.** Responde «qué cláusula hace falta para leer las
  demás», nunca «para quién».

---

## 8. La pestaña del grafo usa otro paseo

La pestaña del grafo dibuja también las partes y los nodos auxiliares, así que usa un paseo
distinto: uno solo sobre el grafo entero, sin dirección, con $d = 0.85$ y el prior repartido
entre los enunciados de cada cláusula. La web también lo usa para elegir las cláusulas
principales de un par de partes (`computePairScores`). La ruta devuelve los dos:

| campo | de dónde sale | quién lo usa |
|---|---|---|
| `byClause` | la relevancia $R(c)$ de este documento | el orden de las filas |
| `neededBy` | por cada fila que sube, las cláusulas que la necesitan y con qué relación | el círculo y la ficha «Needed by» de «Linked» |
| `byNode`, `priorByNode`, `byStatement` | el paseo sobre el grafo entero y su reinicio | la pestaña del grafo |
| `graphByClause` | lo que ese paseo deja en los enunciados de cada fila | las cláusulas principales de un par de partes |

Por eso la relevancia de una cláusula en la tabla y su tamaño en la pestaña del grafo no
coinciden.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Las flechas y la regla de las secciones | `needs`, en `server/services/graph/knowledge/personalized_pagerank.py` |
| El prior, el paseo y quién necesita a quién | `_relevance`, en el mismo módulo |
| La iteración, compartida por los dos paseos | `walk`, en el mismo módulo |
| La ruta | `ClauseImportanceView`, en `server/api/views.py` |
| El orden de las filas, el puesto y quién necesita a cada fila | `web/src/features/docx/hooks/useClauseRows.ts` |
| El círculo y la ficha «Needed by» | `RankBadge` (en `parts/table-bits.tsx`) y `NeededByTile` y `LinkedCell` (en `grid/ClauseRow.tsx`), dentro de `web/src/features/docx/components/clause-analyzer/` |

---

## Cómo regenerar las cifras

Desde `server/`. Primero sale el ejemplo inventado del apartado 3 y después los nueve
contratos:

```bash
uv run python - <<'EOF'
import glob, json
from services.graph.knowledge import personalized_pagerank as ppr


def spearman(xs, ys):
    def places(values):
        order = sorted(range(len(values)), key=values.__getitem__)
        out, i = [0.0] * len(values), 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
                j += 1
            for k in range(i, j + 1):
                out[order[k]] = (i + j) / 2
            i = j + 1
        return out
    a, b = places(xs), places(ys)
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    spread = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** 0.5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / spread if spread else float('nan')


def first_rows(kg, result, size, n):
    ref = {c['id']: c.get('ref') for c in kg['clauses']}
    at = {c: i for i, c in enumerate(ref)}
    by_size = sorted(size, key=lambda c: (-size[c], at[c]))
    base = min(result.by_clause.values())
    for place, clause in enumerate(sorted(result.needed_by, key=lambda c: -result.by_clause[c])[:n], 1):
        readers = sorted({need.reader for need in result.needed_by[clause]}, key=at.__getitem__)
        print(f'    {place}. §{ref[clause]}  x{result.by_clause[clause] / base:.2f} la base  por tamaño {by_size.index(clause) + 1}  '
              f'la necesitan {len(readers)}: ' + ', '.join('§' + ref[r] for r in readers))


# ---- 1. El ejemplo inventado: siete cláusulas, tres tablas (Party A, Both, Party B) y siete enlaces
TABLES = {
    'obligations':  [(4, 0, 1), (7, 2, 2), (3, 1, 5), (2, 0, 9), (10, 0, 1), (9, 0, 2), (2, 3, 3)],
    'rights':       [(3, 0, 8), (7, 2, 4), (10, 1, 2), (4, 3, 6), (2, 0, 9), (6, 2, 3), (9, 1, 5)],
    'prohibitions': [(8, 2, 1), (4, 0, 7), (6, 3, 5), (9, 1, 2), (3, 2, 10), (7, 0, 4), (5, 1, 6)],
}
LINKS = [(7, 'modifies', 1), (7, 'modifies', 2), (7, 'modifies', 3), (6, 'modifies', 2), (6, 'modifies', 2),
         (4, 'depends_on', 5), (5, 'references', 6)]
toy = {'clauses': [{'id': f'c{i}', 'ref': str(i)} for i in range(1, 8)], 'obligations': [], 'rights': [], 'prohibitions': [], 'edges': []}
written = {}
for kind, rows in TABLES.items():
    for i, (a, both, b) in enumerate(rows, 1):
        for k in range(a + both + b):
            toy[kind].append({'id': f'{kind}-{i}-{k}', 'clauseId': f'c{i}'})
            written.setdefault(i, []).append(f'{kind}-{i}-{k}')
used = {}
for source, edge, target in LINKS:
    used[source] = used.get(source, 0) + 1
    toy['edges'].append({'type': edge, 'source': written[source][used[source] - 1], 'target': f'c{target}'})

print('EJEMPLO INVENTADO')
print('  flechas:', ', '.join(f'{n.reader[1:]}->{n.needed[1:]}' for n in ppr.needs(toy)))
for damping in (0.5, 0.85):
    ppr.RELEVANCE_DAMPING = damping
    result = ppr.compute(toy)
    base = min(result.by_clause.values())
    print(f'  d = {damping}: b = {base:.4f} | ' + ' | '.join(
        f'cl. {c[1:]}: {result.by_clause[c]:.4f} = {result.by_clause[c] / base:.2f} b' for c in sorted(result.by_clause, key=lambda c: (-result.by_clause[c], c))))
ppr.RELEVANCE_DAMPING = 0.5
ids = [f'c{i}' for i in range(1, 8)]
out = {c: [n.needed for n in ppr.needs(toy) if n.reader == c] for c in ids}
R = dict.fromkeys(ids, 1 / 7)
print('  ronda 0 :', ' '.join(f'{R[c]:.4f}' for c in ids))
for t in range(1, 200):
    D = sum(R[c] for c in ids if not out[c])
    new = dict.fromkeys(ids, (1 - 0.5 + 0.5 * D) / 7)
    for c in ids:
        for needed in out[c]:
            new[needed] += 0.5 * R[c] / len(out[c])
    change = sum(abs(new[c] - R[c]) for c in ids)
    R = new
    if t <= 2 or change < 1e-9:
        print(f'  ronda {t:<2d}:', ' '.join(f'{R[c]:.4f}' for c in ids))
    if change < 1e-9:
        break
for kind, rows in TABLES.items():
    size = [a + b for a, _, b in rows]
    print(f'  por tamaño en {kind}:', sorted(range(1, 8), key=lambda i: (-size[i - 1], i)), 'tamaños', size)

# ---- 2. Los nueve contratos
print('CONTRATOS')
for path in sorted(glob.glob('../infra/json/kg/root_*.json')):
    kg = json.load(open(path, encoding='utf-8'))
    result = ppr.compute(kg)
    rows = list(result.by_clause)
    size = {c: 0 for c in rows}
    for kind in ppr.DEONTIC_COLLECTIONS:
        for statement in kg.get(kind) or []:
            if statement.get('clauseId') in size:
                size[statement['clauseId']] += 1
    sizes = [size[c] for c in rows]
    print(f"{path[22:48]:27s} filas {len(rows):3d} | enlaces {len(ppr.needs(kg)):3d} | suben {len(result.needed_by):3d} | "
          f"parecido con el tamaño: relevancia {spearman([result.by_clause[c] for c in rows], sizes):5.2f}, "
          f"paseo del grafo entero {spearman([result.graph_by_clause[c] for c in rows], sizes):5.2f}")
    if any(name in path for name in ('lease_contract_10', 'SteelVault', 'BELLICUM')):
        first_rows(kg, result, size, 3)
    if 'Orvane' in path:
        for damping in (0.85, 0.5):
            ppr.RELEVANCE_DAMPING = damping
            print(f'  con d = {damping}:')
            first_rows(kg, ppr.compute(kg), size, 3)
EOF
```

«Por tamaño» es el lugar de la fila al ordenar por número de enunciados, con los empates en
el orden del contrato.
