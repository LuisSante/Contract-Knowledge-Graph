# Detección de riesgos — qué cuadrados marca el sistema

Dice qué obligaciones, derechos y prohibiciones de un contrato son riesgosos, y por qué. Lo
decide un modelo de lenguaje que lee el contrato cláusula por cláusula, tal como el grafo la
guarda. No toca el grafo ni la extracción: solo los lee.

En una frase:

> **El sistema marca los cuadrados que pertenecen a una cláusula de riesgo; las red flags del
> dataset no entran en esa decisión, solo sirven para comprobarla.**

Lo calcula `server/services/risks/detector.py` y lo sirve `/api/v1/risks/<documento>`.

---

## 1. Cómo se pide

En la fila de «You are» del Clause Analyzer, a la derecha y justo encima del selector All /
Mark conditional / Only firm, está «Detect risks», con dos opciones. Mientras el lector no
elige ninguna, la tabla no marca nada.

El conteo y los avisos aparecen a la izquierda de «Detect risks», así que al pulsar una
opción no se mueve nada más. Con el panel estrecho (menos de 864 px) «Detect risks» y «Red
flags» tienen siempre su propia línea, también encima de las pestañas.

| Opción | Qué hace | Cuesta |
|---|---|---|
| **Free** | Muestra la respuesta guardada: la última que dio el modelo para ese contrato | Nada |
| **AI** | Le pregunta al modelo ahora, una llamada por cláusula | Sí |

- **Se guarda la última respuesta de cada contrato**, en un archivo por contrato dentro de
  `infra/json/risks/`, con el mismo nombre que su grafo (`root_lease_contract_201.json`). Si
  se vuelve a preguntar con «AI», la respuesta nueva reemplaza a la guardada, y «Free» pasa a
  enseñar esa. La anterior se pierde.
- **Si el modelo falla en todas las cláusulas** no se guarda nada y queda la respuesta que
  había. Si falla solo en algunas, la respuesta se guarda igual, con el aviso de cuántas
  quedaron sin revisar.
- **«Free» está apagado** en un contrato que el modelo nunca revisó: no hay nada que mostrar.
  La primera vez hay que usar «AI», y esa respuesta queda guardada.
- **Volver a pulsar «Free»** quita las marcas.

El modelo es `gpt-6-luna`, el más barato de los que usa el proyecto. No razona, así que una
llamada cuesta solo sus tokens.

---

## 2. Qué lee el modelo

Una llamada por cláusula que tenga enunciados. Recibe lo mismo que muestra su fila en la
tabla:

- las partes, con su nombre y su rol;
- la cláusula, con número y título;
- los enunciados de cada parte y los que comparten las dos («Both»), cada uno con su tipo, su
  texto, sus condiciones, valores y plazos;
- los enunciados que el contrato no atribuye a ninguna parte, que no tienen cuadrado en la
  tabla pero forman parte de la cláusula;
- las cláusulas enlazadas a un solo paso: las que esta modifica, de las que depende o a las
  que remite, y las que hacen eso mismo con ella.

Devuelve la lista de enunciados riesgosos de esa cláusula. Para cada uno dice de qué tipo es,
qué papel tiene y da un motivo en una oración. El papel es «core» cuando el enunciado fija la
regla sobre el tema (quién puede o debe qué, en qué términos, con qué consecuencia) y
«related» cuando solo lo toca: un detalle de trámite, una consecuencia, una mención. **Solo
se marcan los «core»**; los otros se descartan y no se guardan.

---

## 3. Qué cuenta como riesgo

Las instrucciones llevan los 17 tipos que el paper de Leivaditi, Rossi y Kanoulas (2020),
*A Benchmark for Lease Contract Review*, seleccionó con abogados (sección 3.2):

| Grupo | Tipos |
|---|---|
| Sobre el contrato | opción de salida, período de extensión, estipulaciones especiales |
| Obligaciones del arrendador | reconstrucción obligatoria, daños, expansión, reparaciones del arrendador, cargos por servicios, garantías del propietario, garantía transferible |
| Obligaciones y permisos del arrendatario | cesión permitida, subarriendo permitido, sin obligación de operar, reposición del inmueble, preferencia de compra, preferencia de arrendamiento |
| Varios | cambio de control |

Quedan fuera los cinco tipos que el paper define pero no pudo anotar por falta de ejemplos:
terminación antes de un año, revisión de renta, indexación, garantía bancaria y arrendamiento
con sociedad en comandita.

**Un enunciado es riesgo cuando trata de uno de esos temas**, obligue o favorezca a quien
sea, y tanto si permite como si limita o prohíbe: prohibir subarrendar se marca igual que
permitirlo. Desde el 18 de noviembre de 2026 los tipos se describen así, por tema, y no con
la definición del paper, que describe el caso de manual («una cláusula que permite la
terminación repentina del arrendamiento»). Los anotadores del dataset marcan por tema: toda
frase sobre terminar antes de plazo, cada causal, su aviso y su penalidad. La sección 6
cuenta lo que cambió.

- **Descritos por tema**, los que el dataset anota a menudo: opción de salida, daños,
  reparaciones, cargos por servicios, garantía (depósito), subarriendo, reposición del
  inmueble, las dos preferencias y cambio de control. Y la cesión, que va con el subarriendo.
- **Con la definición del paper**, los seis que casi no anota: período de extensión,
  estipulaciones especiales, reconstrucción obligatoria, expansión, garantías del propietario
  y sin obligación de operar. Descritos por tema solo añadían marcas sin red flag.
- **Lo que no es tema**, dicho expresamente: la renta y sus fechas, los períodos de gracia,
  la descripción, entrega y uso del inmueble, las obras del arrendatario, el plazo, impuestos
  y primas de seguro, notificaciones, disputas, ley aplicable y firma.

**La lista es de arrendamientos.** En otro tipo de contrato el detector corre igual, pero
busca estos mismos tipos. Para que sirva ahí hace falta otra lista.

---

## 4. Cómo se ve

- **Contorno negro: riesgo, la marca del sistema.** Es la que verá cualquier contrato.
- **Punto bajo el cuadrado: red flag del dataset.** Solo existe en los arrendamientos
  anotados y solo valida. Se oculta con la casilla «Red flags».
- **Las dos a la vez** en un cuadrado quieren decir que el sistema y el dataset coinciden.
- **El conteo** junto a «Detect risks» dice «A/B risks + C» (desde el 18 de noviembre de
  2026; antes contaba los cuadrados de riesgo de la pestaña abierta):
  - **A** son los cuadrados de riesgo que además llevan el punto de un red flag: contorno y
    punto en el mismo cuadrado, donde el sistema y el dataset coinciden.
  - **B** son los red flags que el dataset anota en el contrato.
  - **C** son los cuadrados de riesgo sin punto: lo que el sistema marcó y el dataset no.

  A y C se cuentan en cuadrados y suman todos los que el sistema juzgó riesgo. Un riesgo en
  la misma cláusula que un red flag, pero en otro cuadrado, va en C: no es acierto. Cuenta el
  contrato entero, las tres pestañas juntas, y no cambia al ocultar los puntos. Un par
  recíproco es un cuadrado. B se cuenta en red flags, así que A puede pasar de B si un mismo
  red flag cae en varios cuadrados y el sistema marca más de uno. El desglose por pestaña
  sale al pasar el cursor. En un contrato fuera del dataset no hay B y dice solo «N risks».
- **La leyenda** al lado del conteo repite las dos marcas: «R. System» con el contorno y
  «R. Dataset» con el punto, este último solo mientras la casilla «Red flags» está marcada.
- **El aviso «Analysis successful»** es una tarjeta en la esquina superior derecha de la
  ventana: el conteo «A/B risks + C» en una línea y, en la siguiente, cuántos cuadrados de
  riesgo hay en cada pestaña. Sale cuando «AI» termina y
  también al pulsar «Free», y se va sola a los 5 segundos o antes con la ✕. El reloj se
  detiene mientras el cursor o el foco están sobre ella. Si alguna cláusula quedó sin revisar
  dice «Analysis finished» y cuántas fueron.
- **La tarjeta del cuadrado** añade «Risk · tipo» y el motivo.
- **Details** pone una etiqueta «risk · tipo» junto a la frase y el motivo debajo («Why: …»).

Si el modelo falla en alguna cláusula, el control dice cuántas quedaron sin revisar: sus
enunciados no se juzgaron, que no es lo mismo que juzgarlos y hallarlos sin riesgo.

---

## 5. Límites

- **El modelo no responde siempre igual.** Dos preguntas sobre el mismo contrato pueden dar
  listas distintas. Por eso se guarda una sola respuesta y «Free» no cambia.
- **Los motivos son del modelo.** Conviene leerlos junto al texto del contrato: en las
  pruebas el modelo dio algún motivo que el propio texto desmentía.
- **Lo que una parte recibe a cambio** suele estar en otra cláusula. El modelo solo lo ve si
  el grafo enlaza las dos.
- **Las red flags de un contrato no se usan para detectarlo.** Si se usaran, el sistema no
  podría marcar nada en un contrato sin anotar. Lo que sí viene del dataset es cómo se
  describen los tipos: se redactaron mirando qué marca en sus otros contratos.
- **Muchas marcas sin punto no son errores.** Son frases del mismo tema que el dataset no
  anotó en ese contrato: «Party B shall recover the premise to its original state» es
  reposición del inmueble y no lleva red flag. El dataset tampoco es parejo: la exención por
  fuerza mayor lleva red flag en un contrato y en otro no.

---

## 6. Alineación con el dataset (18 de noviembre de 2026)

Siete iteraciones sobre las instrucciones y lo que lee el modelo, medidas en los tres
arrendamientos anotados que tienen grafo (10, 166 y 201). La medida es la del conteo: **A**
cuadrados de riesgo con punto, **C** cuadrados de riesgo sin punto. Entre los tres contratos
hay 38 cuadrados con punto, el techo de A, y 32 red flags.

| # | Qué se cambió | A (de 38) | C | Se queda |
|---|---|---|---|---|
| 0 | Nada: el detector anterior, repetido | 14–15 | 5–7 | — |
| 1 | Tipos descritos por tema, como marcan los anotadores | 35–36 | 39–40 | Sí |
| 2 | El modelo dice si cada marca es «core» o «related»; solo «core» | 32–33 | 28–31 | Sí |
| 3 | Tipos poco anotados con la definición del paper; lista de lo que no es tema | 31–34 | 19–26 | Sí |
| 4 | Cláusulas enlazadas resumidas y una regla para usarlas | 31–32 | 17–23 | No |
| 5 | Una llamada por tipo de enunciado (obligaciones, derechos, prohibiciones) | 32–33 | 19–23 | No |
| 6 | Tres corridas más de las versiones 3 y 4, para separar mejora de ruido | — | — | — |
| 7 | El mismo modelo razonando (esfuerzo bajo) | 35–36 | 23–26 | No |

Los rangos son de dos corridas, cinco en las versiones 3 y 4.

**Qué sirvió**

- **Describir los tipos por tema** (1) es casi toda la mejora: A pasa de 14 a 36. El modelo
  ya leía «Party A has right to terminate the contract» y no lo marcaba, porque la definición
  hablaba de terminación «repentina».
- **Pedir el papel de cada marca** (2) quita un cuarto de las marcas sin punto y un décimo de
  las que lo tienen. Pedirle al modelo que sea estricto no hace lo mismo: listar y clasificar
  le da dónde poner las dudosas.
- **Volver a la definición del paper en los tipos raros** (3) quita marcas sin punto sin
  perder ninguna con punto.

**Qué no sirvió**

- **Las cláusulas enlazadas** (4). Con cinco corridas por versión, la diferencia cabe en el
  ruido (A 31,4 y C 20,0 frente a A 32,6 y C 22,2). Solo 10 de las 37 filas tienen enlaces y
  casi ninguno toca un enunciado con red flag. Se deja como estaba.
- **Separar por tipo de enunciado** (5). Mismo resultado con un 50 % más de llamadas.
- **Hacer razonar al modelo** (7). Tarda el doble y casi deja de usar «related»: A sube 3 y
  C sube 2, lo mismo que quitar el filtro.

**Resultado**, con «AI» en la aplicación:

| Contrato | Antes | Ahora |
|---|---|---|
| lease_contract_10 | 7/13 + 4 | 15/13 + 11 |
| lease_contract_166 | 1/5 + 2 | 6/5 + 8 |
| lease_contract_201 | 6/14 + 1 | 14/14 + 2 |

**Lo que estos números no dicen**

- **No es una evaluación independiente.** Las instrucciones se ajustaron mirando estos mismos
  tres contratos. Las descripciones se redactaron mirando qué marca el dataset en sus otros
  112 contratos, pero ninguno de ellos tiene grafo para comprobarlo.
- **C subió de 7 a 21.** La mayoría son frases de un tema de riesgo que el dataset no anotó
  ahí (límites, sección 5). En las pruebas hubo también errores claros: marcó como opción de
  salida el derecho a recuperar el inmueble al vencer el plazo, y como cargo por servicios
  una prima de seguro.
- **Sin el filtro de papel** el detector da A 36 y C 25–33. Es una línea: `KEPT_ROLE` en
  `detector.py`.
- **El modelo sigue variando** de una corrida a otra: unos 3 cuadrados en A y 7 en C.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Filas, tipos, instrucciones y llamadas | `server/services/risks/detector.py` |
| Lectura y escritura de los archivos | `server/services/risks/store.py` |
| Ruta `GET` (guardada) y `POST` (modelo) | `server/api/views_risks.py` |
| Respuestas guardadas, un archivo por contrato | `infra/json/risks/` |
| Las dos opciones y el conteo | `web/src/features/docx/components/clause-analyzer/parts/risk-control.tsx` |
| Qué se muestra y de dónde viene | `web/src/features/docx/hooks/useRisks.ts` |
| El contorno y el punto | `web/src/features/docx/components/clause-analyzer/grid/Mark.tsx` |
