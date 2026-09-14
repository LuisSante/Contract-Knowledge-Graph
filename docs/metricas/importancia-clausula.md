# Importancia de la cláusula — el orden de las filas

Cuánto manda una cláusula **dentro de su contrato**. Decide el orden de la retícula y
nada más: no dice a quién favorece, eso lo dice
[`reparto-beneficio.md`](./reparto-beneficio.md).

En `server/services/graph/knowledge/personalized_pagerank.py`, servida por
`POST /api/v1/knowledge_graph/<doc>/clause_importance`.

---

## De dónde sale

De la identificación de entidades clave de **GraphQAG** (Li et al., IEEE TVCG, 2026,
§IV-A). Allí el prior de reinicio se reparte entre los **párrafos** y, dentro de cada
uno, entre sus entidades:

$$\pi(v_i) = \sum_{\substack{p\in\mathcal{P}\\ v_i\in V_p}} \frac{1}{|\mathcal{P}|\cdot|V_p|}$$

$$PR_i^{(t+1)} = \bigl(1 - d + dD^{(t)}\bigr)\pi_i + d\sum_{j\in\mathcal{N}_i}\frac{PR_j^{(t)}}{\deg(v_j)}$$

Aquí la unidad es la **cláusula** y `V_c` son sus **enunciados**. Como un enunciado
pertenece a una sola cláusula, el sumatorio se reduce a un término:

$$\pi(v) = \frac{1}{|C|\cdot|V_c|}$$

`d = 0.85`, grafo no dirigido, masa colgante reinyectada **por el prior**, y para hasta
que dos rondas difieren menos de `1e-9`. La importancia de una cláusula es la masa que
retienen sus enunciados.

---

## Qué arregla

Sustituye a un PPR sembrado en el nodo de la parte, cuyos defectos medidos están en
[`descartados.md`](./descartados.md). Dos cosas cambian:

**Ya no ordena por tamaño.** El `1/|V_c|` es el desesgo que faltaba: **una cláusula de
once enunciados no empieza pesando once veces una de uno.** La correlación con
simplemente contar enunciados baja de ρ = 0.882 a **0.400**.

**Ninguna cláusula puede valer cero.** Todas reciben masa del prior, las alcance el
grafo o no. *Limitation of Liability*, que antes se hundía por estar en la isla «each
Party», encabeza la lista cuando la columna bilateral está abierta.

---

## Qué cuenta

El prior se construye **solo con los enunciados que están en pantalla**: sin los que el
contrato no atribuye a nadie, sin los tipos filtrados y sin la columna bilateral cuando
está cerrada. Un orden apoyado en marcas que el lector no puede contar es un orden que
no puede comprobar.

El **paseo sí recorre el grafo entero**: lo que una cláusula tiene conectado no deja de
existir porque se cierre una columna.

La severidad **no interviene**, así que mover un slider cambia los porcentajes de la
barra y no toca el orden.

| # | cláusula | importancia |
|---|---|---|
| 1 | Rights Granted and Restrictions on Bellicum | 100% |
| 2 | Financial Terms | 89% |
| 3 | Delivery, Continuity of Supply | 86% |
| 4 | Forecasts, Orders, Minimum Purchase | 85% |
| 5 | Visual inspection on Delivery | 82% |
| 6 | Term and Termination | 63% |
| 7 | Audit, IP, Confidentiality | 42% |

---

## El alcance del prior cambia el orden

El prior admite dos alcances y la diferencia entre ellos es grande. Hoy solo se usa uno:
la retícula restringe el prior a las marcas que está mostrando, y el grafo que vive
debajo lee la misma respuesta del servidor, así que no hay dos órdenes que conciliar.

La otra lectura posible —`countedStatementIds: null`, los 62 enunciados con cláusula,
incluidos los recíprocos de «each Party»— ya no aparece en la interfaz, pero conviene
tenerla escrita porque es la que separa la métrica de su recorte:

| # | cláusula | importancia |
|---|---|---|
| 1 | Limitation of Liability and Indemnification | 100% |
| 2 | Rights Granted and Restrictions on Bellicum | 85% |
| 3 | Section 3.2 | 80% |
| 4 | Term and Termination | 78% |
| 5 | Financial Terms | 76% |
| 6 | Visual inspection on Delivery | 75% |
| 7 | Delivery, Continuity of Supply, Second Sourcing | 73% |
| 8 | Forecasts, Orders, Minimum Purchase | 73% |
| 9 | Assignment | 72% |
| 10 | Audit, IP, Confidentiality | 63% |
| 11 | Dispute Resolution and Escalation | 47% |

*Limitation of Liability* encabeza porque sus tres disposiciones son recíprocas y aquí sí
cuentan. Con el prior completo el paseo converge en **132 iteraciones** y el pico vale
`0.061227`. Reproducible llamando `personalized_pagerank.compute(kg, None)` sobre
`infra/json/kg/root_BELLICUM_MILTENYI_Supply_Agreement_Summary.json` —el módulo que se
ejecuta, no una réplica—.

La diferencia entre las dos tablas es la que anticipaba *Qué arregla*: contando todo,
*Limitation of Liability* encabeza por sus tres disposiciones recíprocas; al restringir
el prior a lo que la retícula muestra se hunde y sube *Rights Granted*. Es el mismo
efecto medido, no dos métricas — pero significa que **un orden solo es interpretable
junto al recorte que lo produjo**.

**`byStatement` no lo lee nadie, y no hace falta.** Llegó a alimentar una vista de
cláusula que se retiró; el valor por enunciado está de todos modos dentro de `byNode`,
que es el que dibuja el grafo. Se sigue devolviendo porque es la unidad en la que se
define la métrica, y quien la verifique querrá verlo sin recalcularlo.

---

## El paseo visto por encima

El grafo bajo la retícula dibuja el vector entero.
Para eso el endpoint devuelve ahora dos campos más —`byNode`, los 147 nodos, y
`priorByNode`, los 62 que reciben prior—; `compute` ya los calculaba y los tiraba. El
grafo ofrece tres lecturas del mismo nodo: **PPR** (dónde acaba la masa), **prior** (de
dónde sale) y **gain** = PPR − prior.

Poner las tres juntas deja ver lo que una tabla de cláusulas no puede:

| tipo | PPR | prior | gain | nodo |
|---|---|---|---|---|
| party | 7.67 | 0.00 | **+7.67** | Bellicum Pharmaceuticals, Inc. |
| party | 5.07 | 0.00 | +5.07 | each Party |
| obligation | 4.91 | 9.09 | **−4.18** | Advance notification of Material Changes |
| clause | 4.18 | 0.00 | +4.18 | Section 3.2 |
| right | 2.90 | 9.09 | **−6.19** | Seek injunctive relief at any time |

*(puntos sobre 100; el vector suma 1. Reproducible con
`personalized_pagerank.compute(kg, None)`.)*

**Las partes son los nodos más pesados del grafo y no reciben nada del prior.** Los tres
nodos de parte se llevan el **16.4%** de la masa total, toda por propagación. No
contamina el orden de cláusulas —`by_clause` solo suma sobre los enunciados de cada
cláusula—, pero conviene tenerlo escrito: el nodo más pesado de este grafo no es una
cláusula.

**El prior alto es señal de cláusula pequeña, y esa masa se va.** Un enunciado único en
su cláusula arranca con `1/(11·1)` = 9.09 y termina en 2.90: el `1/|V_c|` le da mucho de
salida y la propagación se lo reparte a los vecinos. Es el desesgo funcionando, visible
nodo a nodo en vez de deducido de un ρ.

Reparto final de la masa por tipo de nodo: cláusula 24.1%, obligation 22.2%, right
21.1%, party 16.4%, prohibition 8.8%, value 2.8%, condition 2.8%, reference 1.5%,
definedTerm 0.4%. El último es tan bajo porque **20 de los 22 defined terms no tienen
ninguna arista** y solo conservan lo que les da el prior, que es cero.

---

## Verificación

Contrastada contra `networkx.pagerank` con el mismo grafo, el mismo vector de
personalización y los mismos parámetros. El script de `scripts/` llama a
`personalized_pagerank.compute` —el módulo que se ejecuta, no una réplica.

| documento de estudio | |
|---|---|
| nodos · iteraciones hasta `1e-9` | 147 · 132 |
| masa total · valores negativos | 1.000000000000 · 0 |
| residuo del punto fijo | 8.2e-10 |
| **diferencia con `networkx.pagerank`** | **4.3e-11** |
| diferencia con el TypeScript que sustituyó | 6.9e-18 |

Converge al mismo vector partiendo del prior o de un vector uniforme, de modo que el
punto fijo es único. Al pasarlo al backend se comprobó que el orden y el ρ = 0.400 se
mantenían cláusula por cláusula.

**Empates.** El grafo puede no tener con qué separar dos cláusulas: mismo número de
disposiciones y vecindad equivalente, y la propagación no rompe el empate. Cuantas menos
relaciones informativas tenga el documento, más empates. En el documento de estudio no
hay ninguno, pero conviene tenerlo presente: **la interfaz muestra un orden estricto que
en la cola puede no existir**.

---

## Límites

**Aquí dice poco, y es culpa del documento.** El rango entre la primera y la última
cláusula es apenas un factor 2, y una cláusula de un solo enunciado puede quedar tercera
—recibe el prior máximo, `1/(|C|·1)`, y no hay estructura que lo corrija—. La medida
solo separa cuando hay relaciones que redistribuyan la masa, y el documento de estudio
tiene **3 aristas informativas**. Es un resumen: no repite referencias cruzadas.

**Es del documento, no de la parte.** El prior es uniforme: responde *«qué cláusula
importa en este contrato»*, nunca *«para quién»*.

**Un candidato sin probar.** Sembrar en los enunciados de una parte y propagar **solo
por las aristas informativas** —`uses`, `defines`, `references`, `depends_on`— mediría
el enredo: cuánto más hay que leer para entender la cláusula. Con tres aristas
informativas ese subgrafo aquí no existe, así que no puede probarse sobre este
documento.
