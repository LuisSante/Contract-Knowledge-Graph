# Marco conceptual — usuario, carga y beneficio contractual

**Versión de trabajo:** 2, 2026-09-09. **Tareas resueltas:** 1.1, 1.2, 1.3, 1.6 y 1.9 de [tasks.md](./tasks.md).

Este documento recoge el usuario y el propósito indicados para la plataforma y establece definiciones operacionales a partir de la Legal Graph Ontology proporcionada. Las definiciones orientan la representación, el análisis y la explicación al usuario. Su validación con contratos reales y revisión experta corresponde a las etapas posteriores de la lista de tareas.

Los ejemplos son hipotéticos y se usan para comprobar el sentido de las definiciones. No proceden de Bellicum–Miltenyi ni constituyen un corpus de evaluación. Las reglas se expresan mediante tipos y relaciones de la ontología, sin depender de nombres de partes o cláusulas de un contrato particular.

## 1.1 Usuario y contexto de uso

### Usuario objetivo

La plataforma debe poder utilizarla una persona natural sin formación jurídica que quiera comprender un contrato desde la perspectiva de una de sus partes. También podrá utilizarla alguien con experiencia contractual. El diseño de las explicaciones y las interacciones debe permitir que el usuario principal avance sin conocer la ontología, PageRank o la terminología técnica del análisis.

El usuario de la plataforma y un nodo `Party` son conceptos diferentes. La persona selecciona la parte cuya perspectiva quiere analizar; puede ser ella misma, una organización que representa u otra parte que quiera comprender. Como la ontología admite partes adicionales a los firmantes, el análisis debe conservar los efectos sobre terceros identificados en el texto.

### Propósito y contexto

El objetivo es ayudar al usuario a comprender qué le corresponde hacer, qué puede hacer o recibir, qué tiene restringido y con qué aspectos debe tener cuidado. Como contextos de diseño, se consideran la revisión antes de aceptar un contrato y la consulta durante su ejecución para entender una situación concreta.

La unidad inicial de atención puede ser una cláusula, pero su interpretación requiere revisar las disposiciones que la integran y las condiciones, definiciones o cláusulas que modifican su alcance. Por ello, seleccionar una parte debe dar acceso tanto a sus disposiciones directas como a otras que afecten a sus cargas o protecciones, aunque no la mencionen por nombre.

### Qué necesita comprender el usuario

| Pregunta en lenguaje cotidiano | Información que debe sustentar la respuesta |
|---|---|
| ¿Qué tengo que hacer y cuándo? | Obligación, parte responsable, acción, plazo y condiciones |
| ¿Qué no puedo hacer? | Prohibición, parte restringida, conducta, alcance y excepciones |
| ¿Qué puedo hacer o recibir? | Derecho o permiso propio, prestación a su favor y requisitos para ejercerlo o recibirla |
| ¿Qué limita lo que me prometen o permiten? | Condiciones, definiciones, modificaciones, excepciones y reglas de prevalencia relevantes |
| ¿Con qué debo tener cuidado y por qué? | Plazos, restricciones, requisitos y consecuencias expresadas en el contrato, conectados con la evidencia que los explica |

Estas preguntas orientan el lenguaje de la plataforma. Las cinco tareas concretas con respuestas esperadas para un estudio se prepararán en la tarea 1.7.

### Apoyo que debe ofrecer la plataforma

Las explicaciones deben identificar la parte afectada y describir la acción con palabras comprensibles. Los términos definidos deben poder consultarse junto al fragmento donde se usan. Cada conclusión debe conducir a los textos que la sustentan, incluidos aquellos situados en otras cláusulas.

Un punto de atención debe explicar **qué revisar, por qué afecta a la parte seleccionada, bajo qué condiciones y dónde se establece**. Si el contrato no expresa una consecuencia o falta información sobre un evento, esa ausencia debe aparecer en la explicación. Una consecuencia potencial no debe presentarse como un evento que ya ocurrió.

Como ejemplo de lenguaje de salida: «Para utilizar este derecho, la solicitud debe realizarse dentro del plazo de la cláusula B; revisa esa condición junto con la cláusula A». La interpretación debe distinguir lo sustentado por el texto de lo que necesita revisión.

### Criterio cubierto por la tarea 1.1

Quedan definidos el usuario sin formación jurídica como referencia del diseño, la selección de una perspectiva contractual, los contextos iniciales y el apoyo necesario para comprender los puntos de atención. El reclutamiento de participantes y la evaluación de comprensión siguen pendientes en la etapa 7.

## 1.2 Carga contractual

### Definición operacional

Una **carga contractual para una parte** es una exigencia de actuar o una restricción de conducta que el texto del contrato le atribuye, con el alcance, los plazos, las condiciones y las excepciones que correspondan.

En esta definición de trabajo, las cargas directas se identifican en los nodos `Obligation` y `Prohibition`. Una carga describe qué se exige o restringe; su importancia, costo de cumplimiento y exposición al riesgo requieren un análisis adicional.

| Entidad de la ontología | Atribución de carga | Qué debe explicarse |
|---|---|---|
| `Obligation` | A la parte identificada como actor responsable | Qué debe hacer, para quién cuando esté identificado, cuándo y bajo qué condiciones |
| `Prohibition` | A la parte identificada como sujeto restringido | Qué conducta se restringe, su alcance y las excepciones aplicables |
| `Condition` | Delimita la aplicación de una disposición; por sí sola no identifica una obligación de actuar | Qué debe ocurrir para activar, suspender o limitar la disposición |
| `Value` | Caracteriza una disposición cuando está vinculado a ella | Importe, duración, porcentaje o cantidad y qué aspecto cuantifica |

### Cómo identificar una carga

Se debe localizar una disposición de tipo obligación o prohibición y justificar su atribución a la parte seleccionada. Después se reconstruye su alcance mediante las condiciones, términos definidos y relaciones pertinentes. La salida debe conservar la evidencia de la exigencia o restricción y la evidencia que permite identificar a la parte afectada.

Una frase puede describir una carga condicional aunque no sepamos si el evento que la activa ocurrió. En ese caso se presenta como condicional. Cuando varias partes están vinculadas por una disposición recíproca, se conserva el efecto sobre cada una, según lo que el texto establezca.

### Ejemplos y límites

Todos los fragmentos de esta tabla son inventados para ilustrar la definición.

| Fragmento hipotético | Lectura operacional |
|---|---|
| «El arrendatario deberá pagar al arrendador la renta el día 5 de cada mes». | Carga del arrendatario: efectuar el pago, con una frecuencia y una fecha. El importe requiere su propia evidencia. |
| «El consultor no divulgará a terceros la información confidencial del cliente». | Carga del consultor: abstenerse de divulgar. El contenido de “información confidencial” debe leerse en su definición. |
| «Si el cliente aprueba el presupuesto, el técnico deberá entregar el equipo reparado dentro de diez días». | Carga condicional del técnico. Sin información sobre la aprobación, no se afirma que el plazo haya comenzado. |
| «El cliente podrá solicitar un reembolso dentro de siete días». | Derecho con un requisito temporal. La posibilidad de solicitarlo no se transforma automáticamente en una obligación de hacerlo. El plazo sí puede ser un punto de atención. |

Una disposición que concede un derecho a otra parte puede afectar a la parte seleccionada. Para clasificar ese efecto como carga directa se necesita evidencia de la obligación o restricción correspondiente. Las facultades ajenas y la exposición que generan se analizarán también en las tareas 1.4 y 1.5, sin forzar todos sus efectos dentro de `Obligation`.

Tener más cargas no demuestra por sí solo que el contrato sea menos favorable o más riesgoso. Una carga puede ser recíproca, estar compensada por una prestación o resultar poco relevante para una prioridad concreta. La cantidad de nodos y el tipo de disposición no determinan por sí solos su gravedad.

### Criterio cubierto por la tarea 1.2

La carga queda definida mediante tipos y atribuciones de la ontología, con ejemplos de distintas situaciones, condiciones de aplicación y límites de interpretación. La definición puede utilizarse para anotar contratos sin depender de los fragmentos del caso Bellicum–Miltenyi.

## 1.3 Beneficio o protección

### Definición operacional

Un **beneficio contractual para una parte** es un efecto sustentado en el texto que le permite actuar, le atribuye una prestación a recibir o protege un interés identificable de esa parte. Debe describirse junto con los requisitos, límites y excepciones que condicionan su alcance.

Una **protección contractual** es un beneficio por el que una disposición restringe conductas que afectarían a esa parte, exige actuaciones a su favor o establece una respuesta frente a una situación descrita en el contrato. Esta clasificación expresa el efecto que el texto atribuye; su conveniencia práctica depende de las prioridades y circunstancias de la parte.

| Origen en la ontología | Efecto que puede atribuirse | Evidencia necesaria |
|---|---|---|
| `Right / Permission` | Posibilidad de actuar o ejercer lo que el contrato permite a su titular | Contenido del derecho o permiso, titular y requisitos o límites |
| `Obligation` de una parte | Prestación a favor de otra parte | Acción debida y destinatario o beneficiario identificable en el texto |
| `Prohibition` sobre una parte | Protección de otra parte frente a la conducta restringida | Conducta prohibida e interés o parte protegida que pueda justificarse |

Un permiso para actuar no implica, por sí solo, que otra parte tenga que realizar una prestación. Del mismo modo, detectar una obligación o una prohibición no basta para identificar automáticamente a su beneficiario.

### Cómo atribuir el beneficio

El titular de un derecho o permiso se identifica a partir de la disposición y sus referencias. Para obligaciones y prohibiciones, debe establecerse quién recibe la prestación o qué interés se protege. El beneficiario puede estar expresado en la misma frase o requerir leer otras disposiciones, definiciones o roles.

Cuando esa atribución requiere interpretación, se conserva la evidencia y se señala que necesita revisión. Si no puede justificarse, el beneficiario queda sin determinar. La existencia de dos partes principales no autoriza a completar automáticamente la contraparte como beneficiaria; la ontología también admite terceros y disposiciones recíprocas.

### Una disposición con efectos sobre dos partes

Considérese este fragmento hipotético:

> El consultor no divulgará a terceros la información confidencial del cliente.

Para el consultor, la disposición representa una carga de abstención. Para el cliente, sustenta una protección de su información. Se conserva una sola prohibición con dos perspectivas de efecto; no es necesario crear un segundo derecho independiente solo para mostrar al beneficiario.

Si otra cláusula define que la información públicamente disponible queda fuera de «información confidencial», esa definición delimita tanto la restricción del consultor como la protección del cliente. El beneficio debe explicarse con ese alcance. El ejemplo ilustra por qué importa recorrer `USES` y `DEFINES`, además de las relaciones de dependencia o modificación.

### Ejemplo de un beneficio condicionado por otra cláusula

Fragmentos hipotéticos de un contrato de servicios:

> Cláusula A: El cliente podrá cancelar el servicio y recibir un reembolso conforme a la cláusula B.
>
> Cláusula B: El reembolso previsto en A solo estará disponible si el cliente solicita la cancelación dentro de siete días desde la confirmación de la contratación.

La lectura de A identifica un derecho del cliente. La lectura conjunta de A y B muestra que el beneficio está condicionado a una solicitud dentro de un plazo. La plataforma debe hacer visible esa condición y permitir consultar ambos fragmentos.

Un punto de atención comprensible sería: «El reembolso descrito requiere solicitar la cancelación dentro de siete días desde la confirmación. Revisa el plazo de B junto con el derecho de A». Sin datos sobre la fecha de confirmación o la solicitud, no se afirma que el usuario ya perdió ese beneficio.

### Límites de la interpretación

Un beneficio puede ser condicionado, limitado o acompañado de cargas. Su existencia no equivale a una valoración global favorable del contrato. Varias partes pueden beneficiarse de una disposición, y la carga de una no tiene por qué tener la misma magnitud que el beneficio de otra.

Para evitar confundir ausencia de datos con ausencia de beneficio, debe poder distinguirse una atribución sustentada, una interpretación pendiente y un beneficiario no determinado. Encontrar literalmente una cita acredita su presencia en el documento, pero no verifica por sí solo la interpretación del efecto.

### Criterio cubierto por la tarea 1.3

El beneficio y la protección quedan definidos a partir de derechos, prestaciones y restricciones sustentadas. Se establecen la atribución al beneficiario, el tratamiento de condiciones y los límites frente a la valoración global. La representación formal de múltiples efectos y su visualización se desarrollarán en la etapa 3.

## 1.6 Relevancia estructural

### Definición operacional

La **relevancia estructural de una cláusula** es cuánto manda dentro de su contrato, medida sobre la estructura del grafo y no sobre el texto de una parte. Es independiente de quién lea: ordena las cláusulas, no las atribuye.

Se distingue de la carga y del beneficio, que sí son atribuidos. Una cláusula puede ser muy relevante y afectar por igual a las dos partes, o poco relevante y estar completamente desequilibrada.

| Origen en la ontología | Papel en la medida |
|---|---|
| `Clause` | La unidad que recibe la masa inicial; todas reciben la misma |
| `Obligation`, `Right`, `Prohibition` | Reparten esa masa dentro de su cláusula, a partes iguales |
| Todas las relaciones del grafo | Redistribuyen la masa durante el recorrido |

### Cómo se obtiene

Un PageRank cuyo vector de personalización reparte el reinicio entre las cláusulas y, dentro de cada una, entre sus disposiciones. La fórmula y su procedencia están en [`metricas/importancia-clausula.md`](./metricas/importancia-clausula.md).

El reparto uniforme por cláusula es la decisión que define la medida: **una cláusula con quince disposiciones no empieza pesando cinco veces una con tres**. Sin ese ajuste, la medida reproduce el número de disposiciones y no aporta nada sobre uno más simple: en el contrato de referencia, la versión anterior coincidía con contar disposiciones en ρ = 0.882.

### Qué tarea resuelve

Ordenar las filas de la retícula. Esa es la única función que se le atribuye hoy, y el criterio para conservarla es que el orden ayude a decidir qué leer primero.

### Límites de la interpretación

**No es relativa a una parte.** La tarea 1.6 pedía definir relevancia «respecto de una parte» y la respuesta encontrada es que esta medida no lo es: su vector de personalización es uniforme sobre el documento. Responde *qué cláusula importa en este contrato*, nunca *para quién*.

Existe una variante que sí sería relativa a una parte —sembrar en sus propias disposiciones y propagar solo por las relaciones que no repiten la posición— pero está descrita y medida sin haberse probado. El nodo de parte tiene grado cero en ese subgrafo, de modo que la semilla tendrían que ser sus disposiciones.

**Depende de que el documento tenga estructura.** En el resumen de referencia el rango es apenas un factor 2 y una cláusula con una sola disposición puede quedar tercera; en el contrato completo el rango es 5.1 y el orden resulta interpretable. La medida solo distingue cuando existen relaciones que redistribuyan la masa.

### Criterio cubierto por la tarea 1.6

La relevancia estructural queda definida, separada de la atribución de efectos, asociada a una tarea concreta y acotada por dos límites verificados: no distingue partes y necesita un contrato con referencias cruzadas. La comparación sistemática con alternativas corresponde a la etapa 4.

## 1.9 Límites de los pesos actuales

### Qué representan

Los pesos por tipo —prohibición 1.0, obligación 0.7, derecho 0.3— expresan un supuesto: **prohibir ata más que obligar, y obligar más que permitir**. Es una decisión de modelado, no un hecho del contrato, y por eso son ajustables por el usuario.

Se aplican únicamente al reparto del beneficio por cláusula, descrito en [`metricas/reparto-beneficio.md`](./metricas/reparto-beneficio.md). No intervienen en la relevancia estructural, que es independiente de ellos.

### Qué mueve realmente cada peso

Una disposición acredita a la parte a la que sirve, y su peso viaja completo a ese extremo. Una prohibición sobre una parte resta oportunidades a quien la soporta y acredita por el mismo peso a quien protege.

De ahí una consecuencia que conviene enunciar: **el peso de las prohibiciones no solo penaliza, también reparte beneficio**. Aumentarlo no endurece el análisis de forma neutra; traslada más cuota de una parte a la otra. En el contrato de referencia, de la cuota positiva total el peso de obligación explica el 39%, el de derecho el 34% y el de prohibición el 26%.

### Límites de la interpretación

**No están validados.** Ninguna evidencia sostiene que 1.0, 0.7 y 0.3 sean las proporciones correctas. Deben tratarse como parámetros de exploración: sirven para ver si una conclusión resiste al moverlos, no para afirmar magnitudes.

**Su influencia es menor de lo que parece.** Sustituir el peso por un simple recuento de disposiciones produce casi la misma clasificación: ρ = 0.964 en el contrato de referencia. Un recuento tendría la ventaja de ser verificable contando las marcas de la fila, y la desventaja de perder la distinción entre prohibir y permitir. La decisión sigue abierta.

**Una conclusión que cambia al mover un peso no es una conclusión.** El uso previsto de los deslizadores es comprobar esa estabilidad, y ese uso debe explicarse al usuario.

### Criterio cubierto por la tarea 1.9

Los pesos quedan documentados como supuesto explícito, con su efecto real sobre el reparto, una medida de cuánto aportan frente a una alternativa sin pesos y la instrucción de tratarlos como exploración hasta que exista una validación.

## Papel de la ontología en estas definiciones

Las tres tareas utilizan la Legal Graph Ontology como base para describir el contrato. Carga, beneficio y protección son lecturas de sus entidades y relaciones desde la perspectiva de una parte; estas definiciones no requieren añadir nuevos tipos de nodo.

| Elementos de la ontología | Papel en la interpretación |
|---|---|
| `Clause`, `IS PART OF / CONTAINS` | Ubicar la disposición y conservar su contexto estructural |
| `Party`, `ASSIGNS OBLIGATION TO`, `GRANTS RIGHT TO` | Identificar responsables o titulares; complementar con evidencia de beneficiarios |
| `Obligation`, `Right / Permission`, `Prohibition` | Describir la exigencia, posibilidad de actuación o restricción |
| `Defined Term`, `DEFINES`, `USES` | Precisar el significado contractual de los términos y el alcance de las disposiciones |
| `Condition`, `DEPENDS ON` | Identificar requisitos de aplicación y dependencias |
| `Value` | Caracterizar importes, plazos, frecuencias u otras cantidades cuando el vínculo esté sustentado |
| `REFERENCES`, `Reference` | Localizar contexto referido dentro del contrato o en fuentes externas; una referencia no demuestra por sí sola un efecto adverso |
| `MODIFIES / AMENDS`, `SUPERSEDES` | Examinar cambios de alcance y reglas de prevalencia cuando estén expresados |
| `CONTRADICTS` | Representar un posible conflicto identificado durante el análisis, que debe justificarse y revisarse |

La lista conceptual de relaciones de atribución no especifica por sí sola todos los beneficiarios de obligaciones y prohibiciones. El [esquema actual](../server/schemas/knowledge.py) ya conserva `burdenPartyId` y `benefitPartyId` en las disposiciones. Estos campos permiten registrar la atribución, pero su presencia no demuestra que sea correcta. Los casos con múltiples partes y sus vínculos visuales siguen siendo trabajo de la etapa 3.

La [guía de extracción actual](../server/services/graph/knowledge/ontology.py) agrupa también facultades discrecionales y libertades expresadas como ausencia de obligación bajo `right`. La tarea 1.4 precisará cómo interpretar esas diferencias. `CONTRADICTS` figura en el esquema como relación de análisis; su inclusión conceptual no supone que la extracción ya detecte o resuelva conflictos.

## Decisiones y alcance pendiente

| Decisión de trabajo | Consecuencia para el proyecto |
|---|---|
| Diseñar para una persona sin formación jurídica | Explicar acciones, condiciones y puntos de atención en lenguaje cotidiano, con evidencia consultable |
| Definir carga y beneficio por atribución a una parte | Mostrar ambas perspectivas de una disposición cuando estén sustentadas |
| Conservar condiciones, excepciones y definiciones | Analizar también las disposiciones que modifican el alcance de la cláusula seleccionada |
| Utilizar ejemplos hipotéticos variados | Mantener definiciones generales y reservar los contratos reales para su evaluación |
| Separar efecto identificado y valoración | Mantener pendientes la medición de favorabilidad, la exposición al riesgo y el papel de los pesos |

El siguiente paso en la lista es **1.4, definir capacidad de decisión**, para la que ya existe un método medido pero no redactado. La formalización del riesgo, las preguntas analíticas, la definición de asimetría, la validación experta, la generación de nuevos KG y la implementación visual conservan sus tareas pendientes.
