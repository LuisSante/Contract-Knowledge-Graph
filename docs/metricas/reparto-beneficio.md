# Reparto del beneficio — el porcentaje de cada cláusula

Es lo que dibuja la barra: **de todo lo que una cláusula reparte, qué porción va a cada
parte**. El lector puede decir *«esta cláusula es mía en un 13%»* y tratar el número bajo
como el aviso.

En `web/src/features/docx/utils/knowledge/benefit-share.ts`, sobre el modelo de
`statement-grid.ts`; la dibuja `components/clause-analyzer/grid/ShareBar.tsx`.

El **orden** de las filas no sale de aquí: viene de
[`importancia-clausula.md`](./importancia-clausula.md). Esta métrica dice **a quién le
sirve**; aquella, **cuánto manda**.

Las cifras son del documento de estudio, el resumen del acuerdo de suministro
Bellicum–Miltenyi, cuyo grafo ya no está en `infra/json/kg/`.

---

## La regla

Solo sumas, y **cada enunciado cuenta 1**. Acredita a la parte a la que sirve:

| Tipo | A quién acredita |
|---|---|
| Derecho | a su titular — su propio carril |
| Obligación | a la parte que la recibe — el otro extremo |
| Prohibición | a la parte que protege — el otro extremo |
| Recíproca | a las dos |

Que una obligación acredite al otro carril no es una excepción: el beneficiario de un
deber es quien lo recibe, no quien lo cumple. **El carril dice a quién le toca cumplir;
el porcentaje, a quién le sirve** — por eso una fila puede tener siete marcas de un lado
y dar el 87% al otro.

Hasta octubre de 2026 cada tipo tenía un peso propio, movible desde la barra lateral. Se
quitó; la última sección cuenta por qué y qué cambió.

---

## Dos cálculos completos

### `clause-8`, «Financial Terms» → **13% / 87%**

| enunciado | tipo | en el carril de | acredita a |
|---|---|---|---|
| `obligation-24…28` | obligación ×5 | Bellicum | **Miltenyi +5** |
| `prohibition-11` | prohibición | Bellicum | **Miltenyi +1** |
| `right-25` | derecho | Miltenyi | Miltenyi +1 |
| `right-26` | derecho | Bellicum | Bellicum +1 |

```
Bellicum  1 / 8 = 12.5%
Miltenyi  7 / 8 = 87.5%
```

La barra redondea la primera parte y da a la segunda el resto: 13% / 87%.

Ocho marcas, siete del lado de Bellicum, y aun así el 87% es de Miltenyi: seis de esas
siete son cosas que Bellicum debe hacer o no puede hacer.

### `clause-10`, «Limitation of Liability» → **50% / 50%**

Sus tres enunciados son recíprocos (`burdenPartyId = "each Party"`), así que suman a las
dos: `1 + 1 + 1 = 3` cada una.

Toda cláusula enteramente recíproca da 50/50 **por construcción**. Es la razón de que la
columna «Ambas partes» venga apagada.

---

## En el documento de estudio

Columna bilateral cerrada, que es como arranca. La última columna es lo que daban los
pesos retirados, para comparar:

| # | cláusula | importancia | reparto | con los pesos retirados |
|---|---|---|---|---|
| 1 | Rights Granted and Restrictions on Bellicum | 100% | **27% / 73%** | 11% / 89% |
| 2 | Financial Terms | 89% | **13% / 87%** | 6% / 94% |
| 3 | Delivery, Continuity of Supply | 86% | **75% / 25%** | 75% / 25% |
| 4 | Forecasts, Orders, Minimum Purchase | 85% | 43% / 57% | 41% / 59% |
| 5 | Visual inspection on Delivery | 82% | 63% / 37% | 52% / 48% |
| 6 | Term and Termination | 63% | **67% / 33%** | 46% / 54% |
| 7 | Audit, IP, Confidentiality | 42% | 50% / 50% | 50% / 50% |

Sobre el documento entero, **45% / 55%** (antes 33% / 67%). El 38% / 62% que figuraba
aquí era la cifra con la columna bilateral abierta; hoy esa cifra es 47% / 53%.

Abrir la columna bilateral mete tres filas más, **todas 50/50 exacto**, y acerca al
centro las que ya tenían algún enunciado recíproco: *Term and Termination* pasa a
56% / 44% y *Visual inspection* a 60% / 40%. Cerrada, la retícula responde qué separa a las dos partes; abierta, qué
cargan juntas.

---

## Lo que el porcentaje no dice

**No dice cuánto pesa la cláusula.** *Rights Granted* reparte once enunciados y *Dispute
Resolution* uno, y las dos dibujan la barra igual de larga. Un 50/50 puede ser una
cláusula enorme y equilibrada o una diminuta. La magnitud la lleva el orden de las filas.

**Y no dice cuánto cuesta.** Es el reparto del beneficio, no un balance: nadie resta.
Sustituyó al neto con signo, que se descartó porque dejaba fuera 30 de 74 enunciados —los
que solo nombran a una parte— y escondía la magnitud en un tercero que nunca se mostraba.

---

## Por qué se quitaron los pesos

Antes cada tipo pesaba distinto —derecho 0.3, obligación 0.7, prohibición 1.0— y la barra
lateral dejaba moverlos. Nada validaba qué significa que una obligación valga más del
doble que un derecho, y un 89% hecho con pesos que nadie eligió con datos no se puede
comprobar. Contando, el porcentaje se lee directamente: *de los ocho enunciados que
reparte esta cláusula, siete sirven a Miltenyi*.

El cambio mueve los números, no solo los redondea:

- ***Term and Termination* cambia de lado**: de 46% / 54% a 67% / 33%. Con pesos, la
  obligación de pagar de Bellicum, que acredita a Miltenyi, valía 0.7, más que sus dos
  derechos juntos —renovar y terminar por conveniencia—, 0.3 + 0.3. Contando, son dos
  contra uno.
- **Las cláusulas hechas de prohibiciones se suavizan**: *Rights Granted* pasa de 11% a
  27% y *Financial Terms* de 6% a 13%, porque una prohibición ya no vale más del triple
  que un derecho.
- **El documento entero se acerca al centro**: de 33% / 67% a 45% / 55%.

Se pierde la idea de que una prohibición aprieta más que un permiso. El tipo sigue a la
vista en cada marca, pero ya no cambia el porcentaje.
