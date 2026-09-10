# Reparto del beneficio — el porcentaje de cada cláusula

Es lo que dibuja la barra: **de todo lo que una cláusula reparte, qué porción va a cada
parte**. El lector puede decir *«esta cláusula es mía en un 11%»* y tratar el número bajo
como el aviso.

En el memo `clauseBenefit` de
`web/src/features/docx/components/knowledge-graph/KnowledgeGraphPanel.tsx`, sobre el
modelo de `utils/knowledge/statement-grid.ts`.

El **orden** de las filas no sale de aquí: viene de
[`importancia-clausula.md`](./importancia-clausula.md). Esta métrica dice **a quién le
sirve**; aquella, **cuánto manda**.

---

## La regla

Solo sumas. Cada enunciado acredita a la parte a la que sirve:

| Tipo | A quién acredita | Peso |
|---|---|---|
| Derecho | a su titular — su propio carril | 0.3 |
| Obligación | a la parte que la recibe — el otro extremo | 0.7 |
| Prohibición | a la parte que protege — el otro extremo | 1.0 |
| Recíproca | a las dos | — |

Los pesos son los sliders de la barra lateral; sus límites están en la tarea 1.9 de
[marco-conceptual.md](../marco-conceptual.md).

Que una obligación acredite al otro carril no es una excepción: el beneficiario de un
deber es quien lo recibe, no quien lo cumple. **El carril dice a quién le toca cumplir;
el porcentaje, a quién le sirve** — por eso una fila puede tener siete marcas de un lado
y dar el 94% al otro.

---

## Dos cálculos completos

### `clause-8`, «Financial Terms» → **6% / 94%**

| enunciado | tipo | peso | en el carril de | acredita a |
|---|---|---|---|---|
| `obligation-24…28` | obligación ×5 | 0.7 | Bellicum | **Miltenyi +3.5** |
| `prohibition-11` | prohibición | 1.0 | Bellicum | **Miltenyi +1.0** |
| `right-25` | derecho | 0.3 | Miltenyi | Miltenyi +0.3 |
| `right-26` | derecho | 0.3 | Bellicum | Bellicum +0.3 |

```
Bellicum  0.3 / 5.1 =  6%
Miltenyi  4.8 / 5.1 = 94%
```

Ocho marcas, siete del lado de Bellicum, y aun así el 94% es de Miltenyi: seis de esas
siete son cosas que Bellicum debe hacer o no puede hacer.

### `clause-10`, «Limitation of Liability» → **50% / 50%**

Sus tres enunciados son recíprocos (`burdenPartyId = "each Party"`), así que suman a las
dos: `0.7 + 0.7 + 1.0 = 2.4` cada una.

Toda cláusula enteramente recíproca da 50/50 **por construcción**. Es la razón de que la
columna «Ambas partes» venga apagada.

---

## Con los pesos por defecto

Columna bilateral cerrada, que es como arranca:

| # | cláusula | importancia | reparto |
|---|---|---|---|
| 1 | Rights Granted and Restrictions on Bellicum | 100% | **11% / 89%** |
| 2 | Financial Terms | 89% | **6% / 94%** |
| 3 | Delivery, Continuity of Supply | 86% | **75% / 25%** |
| 4 | Forecasts, Orders, Minimum Purchase | 85% | 41% / 59% |
| 5 | Visual inspection on Delivery | 82% | 52% / 48% |
| 6 | Term and Termination | 63% | 46% / 54% |
| 7 | Audit, IP, Confidentiality | 42% | 50% / 50% |

Sobre el documento entero, **38% / 62%**.

Abrir la columna bilateral mete tres filas más, **todas 50/50 exacto**, y acerca las
demás al centro. Cerrada, la retícula responde qué separa a las dos partes; abierta, qué
cargan juntas.

---

## Lo que el porcentaje no dice

**No dice cuánto pesa la cláusula.** *Rights Granted* mueve 8.2 puntos y *Dispute
Resolution* 0.6, y las dos dibujan la barra igual de larga. Un 50/50 puede ser una
cláusula enorme y equilibrada o una diminuta. La magnitud la lleva el orden de las filas.

**Y no dice cuánto cuesta.** Es el reparto del beneficio, no un balance: nadie resta.
Sustituyó al neto con signo, descartado en [`descartados.md`](./descartados.md).

---

## Una alternativa medida y no aplicada

Contar disposiciones en vez de pesarlas —`7 en contra · 3 a favor`— da un número
igualmente verificable y haría innecesarios los sliders. **ρ = 0.964** entre las dos
clasificaciones, así que el orden apenas cambiaría. El coste es perder la idea de que una
prohibición aprieta más que un permiso. Sin decidir.
