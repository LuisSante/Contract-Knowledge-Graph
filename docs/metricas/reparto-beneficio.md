# Reparto del beneficio — el porcentaje de cada cláusula

Es lo que dibuja la barra: **de todo lo que una cláusula reparte, qué porción va a cada
parte**. Un lector puede decir *«esta cláusula es mía en un 11%»* y tratar el número bajo
como el aviso.

Implementada en el memo `clauseBenefit` de
`web/src/features/docx/components/knowledge-graph/KnowledgeGraphPanel.tsx`, sobre el
modelo de `utils/knowledge/statement-grid.ts`.

El **orden** de las filas no sale de aquí: viene de
[`importancia-clausula.md`](./importancia-clausula.md), que es estructural e
independiente de las partes. Esta métrica dice **a quién le sirve**; aquella, **cuánto
manda**.

---

## La regla

Solo sumas. Cada enunciado acredita a la parte a la que sirve:

| Tipo | A quién acredita |
|---|---|
| Derecho | a su titular — su propio carril |
| Obligación | a la parte que la recibe — el otro extremo |
| Prohibición | a la parte que protege — el otro extremo |
| Recíproca | a las dos |

El peso es la severidad del tipo: **prohibición 1.0 · obligación 0.7 · derecho 0.3**, los
sliders de la barra lateral.

Que una obligación acredite al otro carril no es una excepción: el beneficiario de un
deber es quien lo recibe, no quien lo cumple. Las dos reglas apuntan al mismo sitio —
**quién se beneficia**— y por eso una fila puede tener siete marcas de un lado y dar el
94% al otro.

Una recíproca acredita a las dos porque en una indemnización mutua **cada parte es a la
que protege el deber de la otra**.

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

Siete marcas del lado de Bellicum y una del de Miltenyi, y aun así el 94% es de Miltenyi:
seis de esas siete son cosas que Bellicum debe hacer o no puede hacer. **El carril dice a
quién le toca cumplir; el porcentaje, a quién le sirve.**

### `clause-10`, «Limitation of Liability» → **50% / 50%**

Sus tres enunciados son recíprocos (`burdenPartyId = "each Party"`), así que suman a las
dos: `0.7 + 0.7 + 1.0 = 2.4` cada una.

Toda cláusula enteramente recíproca da 50/50 **por construcción**, no por casualidad. Es
la razón de que la columna «Ambas partes» venga apagada.

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

Sobre el contrato entero el reparto es **38% / 62%**.

Abriendo la columna bilateral entran tres filas más, **todas 50/50 exacto**, y las demás
se acercan al centro: *Term and Termination* pasa de 46/54 a 48/52. Cerrada, la retícula
responde qué separa a las dos partes; abierta, qué cargan juntas.

---

## Lo que el porcentaje no dice

**No dice cuánto pesa la cláusula.** *Rights Granted* mueve 8.2 puntos y *Dispute
Resolution* 0.6, y las dos dibujan la barra igual de larga. Un 50/50 puede ser una
cláusula enorme y equilibrada o una diminuta. La magnitud la lleva el orden de las filas,
no la barra.

**Y no dice cuánto cuesta.** Es el reparto del beneficio, no un balance: nadie resta.

---

## Lo que reemplazó

### Neto con signo — descartado

Antes de esto cada parte llevaba un número con signo: la misma transferencia, pero
restando a quien la soporta. `Rights Granted` daba **−6.1 / +7.3**.

Se descartó por una razón de lectura, no de cálculo: **`−6.1` no tiene unidad**. A la
pregunta *«¿6.1 qué?»* no había respuesta que el lector pudiera verificar. Con dos números
no negativos el par se vuelve un reparto, y el porcentaje sí se comprueba contando las
marcas de la fila.

Dos cosas se ganaron de paso. **Nada queda fuera**: con el signo, 30 de 74 enunciados
nombraban un solo extremo y quedaban a medias; sumando, un derecho sin sujeto sigue
acreditando a su titular. Y **las recíprocas dejan de ser un caso aparte**: no hacen falta
ni el bucket gris ni el `↔`.

Lo que se perdió: la magnitud, y con ella poder decir que una cláusula pesa el triple que
otra.

### Una alternativa medida y no aplicada

Contar provisiones en vez de pesarlas — `7 en contra · 3 a favor` — da un número
igualmente verificable y haría innecesarios los sliders. **ρ = 0.964** entre las dos
clasificaciones, así que el orden apenas cambiaría. El coste es perder la idea de que una
prohibición aprieta más que un permiso. Sin decidir.
