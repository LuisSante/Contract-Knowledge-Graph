# Configuración de extracción — qué modelo, qué lee cada llamada y por qué

Cómo se construye hoy el grafo de un contrato, y los experimentos que llevaron ahí. Las
cifras salen de [`evaluate_kg.ipynb`](../../notebooks/KG/evaluate_kg.ipynb), que compara
cada extracción con una lectura anotada a mano de SteelVault
([`gold_steelvault.ipynb`](../../notebooks/KG/gold_steelvault.ipynb)).

---

## La configuración

**Modelo:** gpt-6.1-sol, con el razonamiento al mínimo que admite (`low`).

**Qué lee cada llamada:**

```
llamada inicial:   [instrucciones]  [contrato entero]                  ──► esqueleto
llamada bloque 1:  [instrucciones]  [esqueleto]  [vecinos]  [bloque 1]  ──► enunciados
llamada bloque 2:  [instrucciones]  [esqueleto]  [vecinos]  [bloque 2]  ──► enunciados
…
unión: por ids que ya existían, sin comparar texto
```

1. **La llamada inicial** lee el contrato entero, una sola vez, y devuelve el esqueleto.
2. **Cada llamada por bloque** recibe un bloque de cláusulas seguidas, de unas 5000 letras,
   cortado siempre en el límite de una cláusula. Lee el esqueleto, sus vecinos y el bloque.
   **No lee el resto del contrato.**

**El esqueleto** es lo que la llamada inicial sabe del contrato entero, convertido en texto:
las partes con sus alias, los roles que juegan por turnos (*Receiving Party*), los términos
definidos y el índice de cláusulas con su título. De ahí salen los únicos ids que un bloque
puede usar: no inventa partes ni cláusulas, las elige. El de SteelVault empieza así:

```
PARTIES:
- party-1: Equidata, Inc. (also called: Equidata)
- party-2: National Credit Report.com, LLC (also called: Marketing Affiliate)
DEFINED TERMS:
- term-2 "Services": certain personal credit, fraud detection, credit scoring services …
CLAUSES:
- clause-1: 1 Compensation
- clause-2: 2 Disputes
…
```

**Los vecinos** son párrafos que el bloque lee para entenderse, sin extraer nada de ellos:
el párrafo anterior y el siguiente al bloque y, si el bloque empieza a mitad de una
cláusula, la frase de entrada de esa cláusula. Sin ella, *«8.2 The information … is
accurate»* no tendría sujeto: el sujeto está en *«Marketing Affiliate represents and
warrants that:»*. Lo que el modelo saque solo de un vecino se descarta, porque ya lo extrae
el bloque al que pertenece.

Cada llamada es independiente: el modelo no recuerda las anteriores. El contrato entero
llega a cada bloque solo a través del esqueleto. Las instrucciones y el esqueleto son iguales
en todas las llamadas de un contrato, así que OpenAI los cobra como entrada en caché, 20
veces más barata. La caché abarata, pero no le da memoria al modelo.

**Instrucciones del prompt** (`prompts.py` y `ontology.py`), además de la guía de
obligaciones, derechos y prohibiciones:

- Las partes, cláusulas y términos vienen dados: no se inventan, se eligen.
- Una garantía (*«represents and warrants»*) es una obligación de quien garantiza.
- Una exclusión de responsabilidad es un derecho de quien se protege, y carga a la otra parte.
- No se extrae nada de los considerandos, ni del texto que solo dice cómo funciona el
  contrato: ley aplicable, divisibilidad, *«deemed»*, acuerdo completo.
- Cada disposición va en una sola lista.

**Coste medido:** \$0.19 por extracción de SteelVault.

De dónde salen las partes, cláusulas y términos, y lo que eso no puede expresar, está en
[`esquema.md`](../ontologia/esquema.md#de-dónde-salen-los-ids).

---

## Diagnóstico: por qué fallaba el grafo

El problema no era el modelo, sino **cómo se armaba el grafo** y **qué pedía el prompt**.

**El ensamblado unía por texto.** Cada trozo de 5000 letras inventaba sus propias partes y
cláusulas, y después se juntaban comparando nombres y números. En SteelVault los
considerandos van numerados *«1. 2. 3.»*, igual que las secciones. Resultado: la sección 1,
*Compensation*, se tragó el considerando 1, y toda referencia a *«Section 2»* acababa en el
considerando 2.

**El prompt pedía lo que no debía y callaba lo que sí.**
- Sacaba como derechos la ley aplicable o *«notice is deemed effective»*.
- No sabía qué hacer con *«represents and warrants»*: las cuatro garantías de la sección 8
  se perdían.

| SteelVault | antes | ahora |
|---|---|---|
| enunciados del contrato que el grafo encuentra (recall) | 81% | 100% |
| enunciados del grafo que son reales (precisión) | 87% | 94% |
| enunciados en la cláusula correcta | 91% | 100% |
| condiciones de incumplimiento enlazadas a su consecuencia | 8 de 17 | 16 de 17 |

**Confirmado en un segundo contrato.** Con la misma configuración y sin ajustar nada, Ediets
sale mejor en todas las medidas: 98% de enunciados con su parte (antes 87%), todas las
cláusulas de «cada parte» separadas (antes la mitad), ninguna parte falsa y ningún
enunciado sin cláusula. El detalle está en
[Verificación en Ediets](#verificación-en-ediets).

---

## Los experimentos

Todo sobre SteelVault. El mismo prompt sobre el mismo texto no da dos veces el mismo grafo,
así que cada configuración se corrió **3 veces**. Entre paréntesis van la peor y la mejor de
las tres. Una configuración gana cuando su peor corrida supera a la mejor de la otra en una
medida y no queda por detrás en la otra.

| Paso | Qué cambió | Recall | Precisión | Condiciones | Coste |
|---|---|---|---|---|---|
| 0 | Punto de partida: gpt-4.1, trozos unidos por texto | 81% | 87% | 8 de 17 | — |
| 1 | Partes y cláusulas fijadas antes de extraer (gpt-6-luna, una corrida) | 78% | 72% | 11 de 17 | \$0.01 |
| 2 | Reglas nuevas: sin considerandos, una lista por disposición, garantías como obligación | tabla siguiente | | | |
| 3 | Regla del texto estándar (gpt-6.1-sol, bloque + vecinos) | **100%** (99–100) | **94%** (94–95) | 16 de 17 | \$0.19 |

En el paso 2 se compararon dos modelos y dos formas de dar contexto a cada bloque:

| Modelo | Qué lee cada bloque | Recall | Precisión | Condiciones | Coste |
|---|---|---|---|---|---|
| gpt-6.1-sol | bloque + vecinos | 100% (100–100) | 88% (83–91) | 16 de 17 | \$0.21 |
| gpt-6.1-sol | bloque + contrato entero | 100% (100–100) | 85% (81–89) | 16 de 17 | \$0.25 |
| gpt-6-luna | bloque + vecinos | 91% (88–93) | 83% (80–85) | 10–11 de 17 | \$0.009 |
| gpt-6-luna | bloque + contrato entero | 83% (78–87) | 76% (74–78) | 11–14 de 17 | \$0.010 |

Gasto de los experimentos en SteelVault: unos \$2.04.

### Por qué gpt-6.1-sol y no gpt-6-luna

- **Encuentra todo:** 100% frente a 88–93%.
- **Enlaza las condiciones de incumplimiento:** 16 de 17 frente a 10–11. Son las cadenas
  incumplimiento → consecuencia de las que sale la exposición al riesgo.
- **Es más fuerte y cuesta lo mismo de entrada que el gpt-4.1 de antes:** \$2.00 por millón
  de tokens. La entrada repetida que se lee de caché es 5 veces más barata (\$0.10 frente a
  \$0.50); la salida cuesta algo más (\$10 frente a \$8).

Luna se descarta aunque cuesta 20 veces menos: no separa las cláusulas que obligan a las dos
partes, mete la misma disposición en dos listas y deja partes sin asignar.

### Por qué cada bloque lee solo sus vecinos

Darle a cada bloque el contrato entero nunca mejoró nada. Con gpt-6.1-sol empata y cuesta
más; con luna empeora. Además, su coste crece con el cuadrado del largo del contrato, porque
cada bloque arrastra el texto completo. Usar las dos formas a la vez pagaría dos veces por los
mismos enunciados, duplicados.

---

## Verificación en Ediets

Se probó la configuración final en un contrato distinto, sin ajustar nada, para ver si lo
aprendido en SteelVault se sostiene. Ediets no tiene referencia anotada, así que se midió
con [`measure_kg.ipynb`](../../notebooks/KG/measure_kg.ipynb). Esa medida detecta lo que
falta cuando el texto lo delata, pero **no dice si lo extraído es correcto**: la precisión
en Ediets no está medida.

| Ediets | grafo anterior | configuración final |
|---|---|---|
| enunciados extraídos | 166 | 300 |
| enunciados con la parte que carga | 87% | 98% |
| derechos con la parte que los sufre | 75% | 97% |
| cláusulas de «cada parte» separadas en un enunciado por parte | 50% | 100% |
| párrafos de incumplimiento con su condición | 75% | 83% |
| párrafos con cifras que tienen su valor | 59% | 97% |
| enunciados con su texto literal | 96% | 100% |
| partes falsas (*«party»*, *«Advertiser»*) | 2 | 0 |
| enunciados sin cláusula | 38 | 0 |
| párrafos con *shall* o *may* sin ningún enunciado | 22 | 14 |

Todo mejora en la misma dirección que en SteelVault. El límite de los anexos pesa más aquí:
75 de los 300 enunciados salen de ellos y quedan bajo §15.8 *Entire Agreement*.

Cada corrida de Ediets costó \$0.86. Hubo que hacer dos, porque la primera se perdió por un
fallo al guardarla.

---

## Siempre en *short context*

OpenAI cobra una petición como *long context* cuando su entrada pasa de **272k tokens**: en
GPT-6 la entrada vale el doble y la salida 1.5 veces más. **Ningún contrato analizado se
acerca.**

- Una llamada por bloque solo lleva el prompt, el esqueleto y su bloque. En SteelVault son
  unos 6.5k tokens por llamada, medidos en `runs.json`.
- La única llamada que lee el contrato entero es la inicial, una vez por contrato. El
  contrato más largo de CUAD
  ([`cost_estimate.ipynb`](../../notebooks/KG/cost_estimate.ipynb)) tiene unos 85k tokens,
  y ninguno de los 510 pasa de 100k.

| | tokens | percentil en CUAD |
|---|---|---|
| SteelVault | 4.3k | 27 |
| Ediets | 14.8k | 71 |
| Bellicum | 45.9k | 96 |
| el más largo de CUAD | 84.6k | 100 |

---

## Precios

USD por millón de tokens, de la página de precios de OpenAI (5 de octubre de 2026). Son los
mismos que usa `server/services/llm/cost_estimator.py` para estimar el gasto.

| Modelo | Entrada | Caché | Escritura caché | Salida | Entrada >272k | Caché >272k | Escritura >272k | Salida >272k |
|---|---|---|---|---|---|---|---|---|
| gpt-6-astra | 10.00 | 1.00 | 12.50 | 50.00 | 20.00 | 2.00 | 25.00 | 75.00 |
| **gpt-6.1-sol** | **2.00** | **0.10** | **2.50** | **10.00** | 4.00 | 0.20 | 5.00 | 15.00 |
| gpt-6-luna | 0.10 | 0.01 | 0.125 | 0.50 | 0.20 | 0.02 | 0.25 | 0.75 |
| gpt-6-sol | 2.00 | 0.20 | 2.50 | 10.00 | 4.00 | 0.40 | 5.00 | 15.00 |
| gpt-5.6-sol | 4.00 | 0.40 | 5.00 | 20.00 | 8.00 | 0.80 | 10.00 | 30.00 |
| gpt-5.6-terra | 2.00 | 0.20 | 2.50 | 12.00 | 4.00 | 0.40 | 5.00 | 18.00 |
| gpt-5.6-luna | 0.20 | 0.02 | 0.25 | 1.20 | 0.40 | 0.04 | 0.50 | 1.80 |
| gpt-5.5 | 5.00 | 0.50 | — | 30.00 | 10.00 | 1.00 | — | 45.00 |
| gpt-5.5-pro | 30.00 | — | — | 180.00 | 60.00 | — | — | 270.00 |
| gpt-5.4 | 2.50 | 0.25 | — | 15.00 | 5.00 | 0.50 | — | 22.50 |
| gpt-5.4-pro | 30.00 | — | — | 180.00 | 60.00 | — | — | 270.00 |

Sin tramo *long context* publicado:

| Modelo | Entrada | Caché | Salida |
|---|---|---|---|
| gpt-5.4-mini | 0.75 | 0.075 | 4.50 |
| gpt-5.4-nano | 0.20 | 0.02 | 1.25 |
| gpt-5.2 | 1.75 | 0.175 | 14.00 |
| gpt-5.2-pro | 21.00 | — | 168.00 |
| gpt-5.1 | 1.25 | 0.125 | 10.00 |
| gpt-5 | 1.25 | 0.125 | 10.00 |
| gpt-5-mini | 0.25 | 0.025 | 2.00 |
| gpt-5-nano | 0.05 | 0.005 | 0.40 |
| gpt-5-pro | 15.00 | — | 120.00 |
| gpt-4.1 | 2.00 | 0.50 | 8.00 |
| gpt-4.1-mini | 0.40 | 0.10 | 1.60 |
| gpt-4.1-nano | 0.10 | 0.025 | 0.40 |
| gpt-4o | 2.50 | 1.25 | 10.00 |
| gpt-4o-mini | 0.15 | 0.075 | 0.60 |

### Coste estimado de una extracción

Cada celda es *bloque + contrato entero* / *bloque + vecinos*, por tamaño de contrato, de
[`cost_estimate.ipynb`](../../notebooks/KG/cost_estimate.ipynb). **No incluye** ni los tokens
de razonamiento ni la llamada inicial que lee el contrato entero: en SteelVault gpt-6.1-sol
costó \$0.19 medido, frente a los \$0.13 estimados.

| Tokens | gpt-4.1 | gpt-4.1-mini | gpt-6.1-sol | gpt-6-sol | gpt-6-luna | gpt-5.4-mini |
|---|---|---|---|---|---|---|
| 4.3k (SteelVault) | 0.11 / 0.11 | 0.02 / 0.02 | 0.12 / 0.13 | 0.12 / 0.13 | 0.01 / 0.01 | 0.05 / 0.06 |
| 16k (Ediets) | 0.45 / 0.39 | 0.09 / 0.08 | 0.43 / 0.44 | 0.45 / 0.44 | 0.02 / 0.02 | 0.19 / 0.19 |
| 47k (Bellicum) | 1.89 / 1.17 | 0.38 / 0.23 | 1.36 / 1.27 | 1.55 / 1.30 | 0.08 / 0.06 | 0.65 / 0.56 |
| 85k (máximo CUAD) | 4.66 / 2.15 | 0.93 / 0.43 | 2.70 / 2.28 | 3.29 / 2.35 | 0.16 / 0.12 | 1.36 / 1.02 |
| 300k (fuera de CUAD) | 42.30 / 8.90 | 8.46 / 1.78 | 26.14 / 8.33 | 40.66 / 8.80 | 2.03 / 0.44 | no cabe / 3.79 |

En la fila de 300k, dar el contrato entero a cada bloque cruza el umbral de 272k en cada
llamada y el coste se dispara. Con bloque + vecinos solo lo cruzaría la lectura inicial.
Ningún contrato de CUAD llega a ese tamaño.

---

## Límites

- **Un solo contrato con referencia anotada.** La referencia de SteelVault está pendiente
  de revisión por el autor; Ediets se verificó sin referencia, así que su precisión no está
  medida.
- **Los anexos caen en la última cláusula numerada.** En Ediets son 205 párrafos, y 75
  enunciados, que quedan bajo §15.8 *Entire Agreement*
  ([`clause_tree_check.ipynb`](../../notebooks/KG/clause_tree_check.ipynb)).
- **Se re-extrajeron SteelVault, Ediets y Bellicum** (este último por \$2.82). Healthcentral,
  Ritter y TomOnline siguen como los dejó el pipeline viejo: re-extraerlos costaría unos \$4.

---

## Para quien abra los cuadernos

Allí las cosas tienen nombres cortos:
- **D2** es *bloque + vecinos*, la configuración elegida, y **D1** es *bloque + contrato
  entero*.
- Cada corrida de `infra/json/kg_runs/<contrato>/runs.json` guarda un código de 12
  caracteres que identifica la versión exacta del prompt con que se hizo. Sirve para no
  mezclar corridas de prompts distintos.

