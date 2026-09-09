# Importancia de la cláusula — el orden de las filas

Cuánto manda una cláusula **dentro de su contrato**. Es lo único que decide el orden de la
retícula; no dice a quién favorece, eso lo dice
[`reparto-beneficio.md`](./reparto-beneficio.md).

Implementada en `web/src/features/docx/utils/knowledge/clause-importance.ts`.

---

## De dónde sale

Es la adaptación de la identificación de entidades clave de **GraphQAG** (Li et al., IEEE
TVCG, 2026), §IV-A. Allí el prior de reinicio se reparte entre los **párrafos** del
documento y, dentro de cada uno, entre sus entidades:

$$\pi(v_i) = \sum_{\substack{p\in\mathcal{P}\\ v_i\in V_p}} \frac{1}{|\mathcal{P}|\cdot|V_p|}$$

$$PR_i^{(t+1)} = \bigl(1 - d + dD^{(t)}\bigr)\pi_i + d\sum_{j\in\mathcal{N}_i}\frac{PR_j^{(t)}}{\deg(v_j)}$$

Aquí la unidad es la **cláusula** y `V_c` sus **enunciados**:

| GraphQAG | Aquí |
|---|---|
| 𝒫 — párrafos del documento | cláusulas con enunciados visibles |
| `V_p` — entidades del párrafo | enunciados de la cláusula |

Como un enunciado pertenece a una sola cláusula, el sumatorio de π se reduce a un término:
`π(v) = 1/(|C|·|V_c|)`.

`d = 0.85`, grafo no dirigido, y la masa colgante `D` se reinyecta **por el prior**, no
sobre una semilla. Itera hasta que dos rondas difieren menos de `1e-9`.

La importancia de una cláusula es la masa que retienen sus enunciados.

---

## Qué arregla

Sustituye a un PageRank personalizado sembrado en el nodo de la parte, documentado en
[`pagerank.md`](./pagerank.md). Aquel tenía dos defectos medidos sobre el contrato de
referencia:

**Ordenaba por tamaño.** ρ = 0.882 contra simplemente contar los enunciados de cada
cláusula. No medía centralidad; medía cuántos `is_part_of` colgaban de ella. El
`1/|V_c|` es exactamente el desesgo que faltaba: **una cláusula de quince enunciados no
empieza pesando cinco veces una de tres.** Con el prior nuevo, ρ baja a **0.400** en el
resumen y **0.743** en el contrato completo.

**Dejaba cuatro cláusulas en cero exacto.** El nodo «each Party» está en un componente
desconectado, así que un paseo sembrado en una parte real nunca lo alcanzaba y
*Limitation of Liability* se hundía al fondo. Ahora **ninguna cláusula puede valer cero**:
todas reciben masa del prior, las alcance el grafo o no. Esa cláusula pasa a encabezar la
lista cuando la columna bilateral está abierta.

---

## Qué cuenta

El prior se construye **solo con los enunciados que están en pantalla** — sin los que el
contrato no atribuye a nadie, sin los tipos filtrados, y sin la columna bilateral cuando
está cerrada. Un orden apoyado en marcas que el lector no puede contar es un orden que no
puede comprobar.

El **paseo sí recorre el grafo entero**: lo que una cláusula tiene conectado no deja de
existir porque se cierre una columna.

---

## Lo que da

Con los pesos por defecto y la columna bilateral cerrada:

| # | cláusula | importancia |
|---|---|---|
| 1 | Rights Granted and Restrictions on Bellicum | 100% |
| 2 | Financial Terms | 89% |
| 3 | Delivery, Continuity of Supply | 86% |
| 4 | Forecasts, Orders, Minimum Purchase | 85% |
| 5 | Visual inspection on Delivery | 82% |
| 6 | Term and Termination | 63% |
| 7 | Audit, IP, Confidentiality | 42% |

La severidad **no interviene**: la importancia es estructural, así que mover un slider
cambia los porcentajes de la barra y no toca el orden.

---

## Límites

**En un resumen dice poco.** El rango del contrato de referencia es apenas un factor 2, y
una cláusula de un solo enunciado puede quedar tercera — su enunciado recibe el prior
máximo, `1/(|C|·1)`, y no hay estructura que lo corrija. En el contrato completo el rango
es **×5.1** y el orden es sensato: *Change Control*, *Compliance*, *Forecasts and Orders*.
El resumen tiene 3 aristas informativas; el completo, 243.

**Es del documento, no de la parte.** El π del paper es un prior uniforme, sin semilla de
parte: responde *«qué cláusula importa en este contrato»*, nunca *«para quién»*. Hacerlo
relativo a una parte sería restringir π a sus enunciados, y eso ya sería una variante
nuestra.

**Un candidato no probado.** Sembrar en los enunciados de una parte y propagar **solo por
las aristas informativas** — `uses`, `defines`, `references`, `depends_on` — mediría el
enredo: cuánto más hay que leer para entender la cláusula. En el contrato completo alcanza
298 nodos y 58 de las 142 cláusulas; en el resumen no existe. El nodo de parte tiene grado
0 en ese subgrafo, así que la semilla tiene que ser sus enunciados, no ella.
