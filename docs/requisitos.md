# Requisitos — cuatro capacidades del sistema y las tareas que las realizan

**Origen.** Entrevista semiestructurada con un experto en derecho contractual.

**Usuario objetivo.** Una persona sin formación jurídica que analiza el contrato
desde la perspectiva de una parte, definida en
[marco conceptual §1.1](./marco-conceptual.md#11-usuario-y-contexto-de-uso).

## Pregunta de investigación

> ¿Cómo puede un sistema de análisis visual ayudar a **identificar** y **explicar** qué
> cláusulas **favorecen a cada parte** de un contrato y qué **exposición al riesgo**
> generan?

Definimos 4 System Requeriments, como por ejemplo: _identificar_ sobre _favorabilidad por parte_
da R1; _explicar_ sobre _exposición al riesgo_ da R2; el «cómo sabemos que es cierto»
que exigen las dos anteriores da R3; y lo que la entrevista impuso al método —ausencias,
probabilidad no escrita, negativa al veredicto global— da R4.

---

## Los cuatro requisitos

### R1 — Identificación de asimetría contractual relativa a una parte

_Party-relative identification of contractual asymmetry_

El sistema debe permitir localizar, desde la perspectiva de una parte seleccionada, dónde
se reparten de forma desigual las cargas y las protecciones del contrato.

Relativo a una parte es la condición que lo define, no un matiz: un reparto desigual sin
decir desigual _para quién_ no responde nada. Es también el punto donde el trabajo actual
está más flojo — ver la nota de estado más abajo.

### R2 — Explicación estructural de la exposición al riesgo

_Structure-aware explanation of risk exposure_

El sistema debe permitir seguir una exposición desde lo que la desencadena hasta lo que
cuesta y lo que la limita, recorriendo las cláusulas que forman esa cadena.

Una exposición no es una etiqueta puesta sobre una cláusula: es un recorrido. El
desencadenante suele estar en una condición, la consecuencia en otra disposición y el
límite —tope, excepción, plazo de subsanación— en una cláusula distinta de ambas.
Presentar solo el extremo del recorrido produce una alarma sin contenido.

### R3 — Verificación anclada en evidencia de toda atribución

_Evidence-grounded verification of every attribution_

Toda afirmación sobre quién carga, quién se beneficia o qué ocurre al incumplir debe ser
rastreable hasta el texto literal que la sustenta.

Es la respuesta a la objeción de fondo que planteó el experto —_¿esto no lo hace ya un
LLM?_—: puede hacerlo, pero el aporte está en mostrar **dónde** está cada cosa, de modo que
el lector vea todos los puntos en lugar de recibir un párrafo. La procedencia ya está en el
esquema: `paragraphIds`, `text`, `evidenceVerified`, `evidenceSpans`
([esquema](./ontologia/esquema.md)).

### R4 — Tratamiento explícito de lo que el contrato no dice

_Explicit treatment of what the contract does not state_

El sistema debe distinguir una previsión ausente de una no detectada, y marcar aquello que
el documento no puede aportar a un juicio de riesgo.

Tres hallazgos distintos de la entrevista caen aquí. Que la mayoría de los contratos no
prevea resolución consensual de conflictos es un resultado, no un vacío en la salida. Que
la probabilidad de un siniestro no esté escrita es lo que impide leer un contrato de seguro
como un contrato desequilibrado. Y la negativa al veredicto global (NR1) es el mismo
principio aplicado a la agregación.

R4 convierte NR1 en algo que el sistema **hace** —declarar el límite— en vez de algo de lo
que se abstiene.

---

## Las siete tareas

|        | Tarea                                                                      |
| ------ | -------------------------------------------------------------------------- |
| **T1** | Triar cláusulas por carga relativa a la parte seleccionada                 |
| **T2** | Enumerar las consecuencias de incumplimiento para esa parte                |
| **T3** | Trazar una cadena de exposición: desencadenante → consecuencia → límite    |
| **T4** | Examinar la estructura temporal: plazos, duración, ventanas de subsanación |
| **T5** | Comprobar la cobertura de resolución de conflictos, incluida su ausencia   |
| **T6** | Inspeccionar la evidencia literal de cualquier atribución                  |
| **T7** | Preguntar sobre el contrato y pedir sugerencias de revisión                |

### Requisitos y tareas analíticas

| System Requirements                                            | T1  | T2  | T3  | T4  | T5  | T6  | T7  |
| -------------------------------------------------------------- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **R1**: Party-relative identification of contractual asymmetry |  ✓  |  ✓  |     |  ✓  |     |     |     |
| **R2**: Structure-aware explanation of risk exposure           |     |     |  ✓  |  ✓  |  ✓  |     |  ✓  |
| **R3**: Evidence-grounded verification of every attribution    |     |  ✓  |  ✓  |     |     |  ✓  |     |
| **R4**: Explicit treatment of what the contract does not state |     |     |     |     |  ✓  |  ✓  |  ✓  |

---

## Estado de cada tarea

| Tarea  | Estado                                 | Qué lo sostiene / qué falta                                                                                                                                                                                                                                         |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | Implementada, con una reserva de fondo | Existen la retícula de cláusulas, el PageRank personalizado y los pesos configurables. Pero PPR ya se midió como **no** relativo a una parte ([`descartados.md`](./metricas/descartados.md), [`tasks.md`](./tasks.md) 1.6): lo que define a R1 sigue sin resolverse |
| **T2** | Pendiente                              | No hay tipo de nodo para la sanción. `remedy` aparece únicamente como pista textual dentro de la guía de la relación `modifies`, no como algo que se extraiga y se pueda listar                                                                                     |
| **T3** | Parcial                                | Ya se extraen `Condition.gatesId`, `depends_on`, `modifies` y `supersedes` — la cadena existe en los datos. Falta la vista que la recorra                                                                                                                           |
| **T4** | Parcial                                | `deadline` y `frequency` están en el esquema del servidor y espejados en los tipos del frontend, pero **ningún componente los consume**: el campo existe y no se muestra                                                                                            |
| **T5** | Pendiente                              | Sin menciones de _dispute_, _arbitration_ ni _mediation_ en ninguna parte del repositorio                                                                                                                                                                           |
| **T6** | Implementada                           | Pasada de verificación de evidencia, `evidenceVerified`/`evidenceSpans`, puente de evidencia en la interfaz y citas en el chat                                                                                                                                      |
| **T7** | Parcial                                | El chat con citas funciona. Las sugerencias de perfeccionamiento no existen                                                                                                                                                                                         |

**Leído por requisito:** R3 es el único enteramente sostenido hoy. R2 y R4 están casi
vacíos —T5 no existe y T3, T4 y T7 están a medias—.
R1 tiene interfaz pero le falta justamente aquello que lo define.

Eso ordena el trabajo. **T5 es lo más barato y lo que más rinde**: completa media fila de
R2 y media de R4, y produce la medida de corpus que el experto señaló como publicable por
sí sola. **T2 obliga a tocar la ontología**, que es el cambio más caro porque se propaga a
las métricas y a la vista.

---

## NR1 — Sin veredicto global de equilibrio

**El sistema no debe emitir una métrica única del equilibrio del contrato** — nada del tipo
«este contrato favorece un 70% a la parte A».

La razón la dio el experto poniéndose en el lugar del juez del caso: si el sistema afirma
que el contrato favoreció más a una parte, esa cifra puede convertirse en base de una
decisión judicial, cuando puede proceder de una interpretación errada del modelo agregada
muchas veces. Cláusula por cláusula lo dio por bueno; el total, no.

Es resultado publicable —una restricción que el dominio impone al método, no una
funcionalidad que faltó tiempo de construir— y convive con lo descartado en
[`metricas/descartados.md`](./metricas/descartados.md). R4 es su forma operativa.

## Restricción de audiencia

La vista nodo-enlace del grafo es instrumento de inspección para quien investiga, no
interfaz del usuario final. El diseño se calibra sobre la persona sin formación jurídica de
[marco conceptual §1.1](./marco-conceptual.md#11-usuario-y-contexto-de-uso).

---

# Anexo — Observaciones de la entrevista sin ubicación asignada

Lo que sigue **no está conectado** a los requisitos ni a las tareas de arriba. Son
observaciones del experto que valen por sí mismas y cuya ubicación en el diseño está sin
decidir. Se conservan aquí para no perderlas.

## A1 — Condiciones en sentido técnico-jurídico

Una condición es un **evento futuro e incierto que puede ocurrir o no**. El experto avisó
de que la palabra se usa de forma laxa y de que, si el sistema la emplea, debe emplearla
técnicamente, distinguiéndola de un requisito ya determinado.

Su ejemplo del acoplamiento entre condición y consecuencia: se pactan 100 sacas de café, se
entregan 90, se paga el 90%.

## A2 — Anclaje de toda respuesta en su lugar del texto

Cada afirmación conduce al fragmento literal y a la cláusula que lo establece. Lo formuló
como la diferencia entre recibir un párrafo y ver todos los puntos del contrato.

## A3 — Obligación legal frente a obligación negocial

Cumplir un deber impuesto por la ley no es un beneficio de la contraparte; sí lo es cumplir
un deber pactado. Su ejemplo: pagar un tributo no beneficia al Estado, se paga porque hay
que pagarlo.

El caso que más se nota en un contrato es el plazo: la ley fija el día 5, las partes pactan
el día 10. Sin esta distinción ambos se leen igual.

**Alcance acordado en la entrevista:** en contratos entre privados la mayoría de las
obligaciones son negociadas, así que tratarlas todas como negociales es una simplificación
admisible. Queda escrita como límite declarado, no como omisión.

## A4 — Dependencias y compensación entre cláusulas

Las disposiciones dependen unas de otras, y es normal y deseable que una cláusula favorezca
a una parte y otra compense en sentido contrario: el contrato equilibrado es el que lo
hace. Un contrato desequilibrado tampoco es defectuoso — es un contrato de riesgo, como el
seguro.

## A5 — Ponderación bajo control del usuario

Los pesos de obligación, derecho y prohibición son parámetros de exploración fijados por el
usuario según lo que quiera priorizar. Sus límites están en
[`metricas/reparto-beneficio.md`](./metricas/reparto-beneficio.md) y en
[marco conceptual §1.9](./marco-conceptual.md).

## A6 — Capa propositiva: sugerencias de perfeccionamiento

Propuesta del experto: tras entregar el análisis, ofrecer bajo demanda sugerencias de cómo
mejorar el contrato — primero la lectura, después el botón. Opera sobre respuestas ya
producidas, no sobre el documento en bruto.
