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

Junto a las pestañas del Clause Analyzer está «Detect risks», con dos opciones. Mientras el
lector no elige ninguna, la tabla no marca nada.

| Opción | Qué hace | Cuesta |
|---|---|---|
| **Free** | Muestra la respuesta guardada: la primera que dio el modelo para ese contrato | Nada |
| **AI** | Le pregunta al modelo ahora, una llamada por cláusula | Sí |

- **El archivo guarda solo la primera respuesta de cada contrato**, en
  `infra/json/risks.json`. Si se vuelve a preguntar con «AI», la respuesta nueva se muestra
  pero no reemplaza a la guardada. Así «Free» enseña siempre lo mismo.
- **«Free» está apagado** en un contrato que el modelo nunca revisó: no hay nada que mostrar.
  La primera vez hay que usar «AI», y esa respuesta es la que queda.
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

Devuelve la lista de enunciados riesgosos de esa cláusula. Para cada uno dice de qué tipo es
y da un motivo en una oración.

---

## 3. Qué cuenta como riesgo

Las instrucciones llevan la definición general de red flag del paper de Leivaditi, Rossi y
Kanoulas (2020), *A Benchmark for Lease Contract Review*, y los 17 tipos que ese paper
seleccionó con abogados, cada uno con su definición (sección 3.2):

| Grupo | Tipos |
|---|---|
| Sobre el contrato | opción de salida, período de extensión, estipulaciones especiales |
| Obligaciones del arrendador | reconstrucción obligatoria, daños, expansión, reparaciones del arrendador, cargos por servicios, garantías del propietario, garantía transferible |
| Obligaciones y permisos del arrendatario | cesión permitida, subarriendo permitido, sin obligación de operar, reposición del inmueble, preferencia de compra, preferencia de arrendamiento |
| Varios | cambio de control |

Quedan fuera los cinco tipos que el paper define pero no pudo anotar por falta de ejemplos:
terminación antes de un año, revisión de renta, indexación, garantía bancaria y arrendamiento
con sociedad en comandita.

**La lista es de arrendamientos.** En otro tipo de contrato el detector corre igual, pero
busca estos mismos tipos. Para que sirva ahí hace falta otra lista.

---

## 4. Cómo se ve

- **Contorno negro: riesgo, la marca del sistema.** Es la que verá cualquier contrato.
- **Punto bajo el cuadrado: red flag del dataset.** Solo existe en los arrendamientos
  anotados y solo valida. Se oculta con la casilla «Red flags».
- **Las dos a la vez** en un cuadrado quieren decir que el sistema y el dataset coinciden.
- **El conteo** junto a «Detect risks» dice cuántos cuadrados de la pestaña abierta son
  riesgo. Un par recíproco cuenta como un cuadrado.
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
- **Las red flags del dataset no se usan para detectar.** Si se usaran, el sistema no podría
  marcar nada en un contrato sin anotar.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Filas, tipos, instrucciones y llamadas | `server/services/risks/detector.py` |
| Lectura y escritura del archivo | `server/services/risks/store.py` |
| Ruta `GET` (guardada) y `POST` (modelo) | `server/api/views_risks.py` |
| Respuestas guardadas | `infra/json/risks.json` |
| Las dos opciones y el conteo | `web/src/features/docx/components/clause-analyzer/parts/risk-control.tsx` |
| Qué se muestra y de dónde viene | `web/src/features/docx/hooks/useRisks.ts` |
| El contorno y el punto | `web/src/features/docx/components/clause-analyzer/grid/Mark.tsx` |
