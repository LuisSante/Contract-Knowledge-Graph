# Marco conceptual — usuario, carga y beneficio contractual

**Versión de trabajo:** 2, 2026-09-09. **Tareas resueltas:** 1.1, 1.2, 1.3, 1.6 y 1.9 de [tasks.md](./tasks.md).

Define quién usa la plataforma y qué significan carga, beneficio, relevancia y pesos, en términos de la Legal Graph Ontology. Los ejemplos son **hipotéticos**, sirven para comprobar el sentido de las definiciones y no proceden de Bellicum–Miltenyi. Las reglas se expresan con tipos y relaciones, sin depender de nombres de un contrato concreto. Su validación con contratos reales y revisión experta corresponde a etapas posteriores.

## 1.1 Usuario y contexto de uso

### Usuario objetivo

La plataforma debe poder usarla **una persona sin formación jurídica** que quiera entender un contrato desde la perspectiva de una de sus partes; también alguien con experiencia contractual. Las explicaciones y las interacciones tienen que funcionar sin conocer la ontología, PageRank ni la terminología del análisis.

El usuario y un nodo `Party` son cosas distintas: la persona **selecciona** la parte cuya perspectiva quiere analizar —ella misma, una organización que representa u otra parte que quiera comprender—. Como la ontología admite partes más allá de los firmantes, el análisis debe conservar los efectos sobre terceros identificados en el texto.

### Propósito y contexto

Ayudar al usuario a entender qué le toca hacer, qué puede hacer o recibir, qué tiene restringido y con qué debe tener cuidado. Los dos contextos de diseño son **revisar antes de aceptar** y **consultar durante la ejecución** para entender una situación concreta.

La unidad inicial de atención es la cláusula, pero interpretarla exige mirar sus disposiciones y las condiciones, definiciones o cláusulas que cambian su alcance. Seleccionar una parte debe dar acceso tanto a sus disposiciones directas como a las que afectan a sus cargas o protecciones **aunque no la nombren**.

### Qué necesita comprender el usuario

| Pregunta en lenguaje cotidiano | Información que debe sustentar la respuesta |
|---|---|
| ¿Qué tengo que hacer y cuándo? | Obligación, parte responsable, acción, plazo y condiciones |
| ¿Qué no puedo hacer? | Prohibición, parte restringida, conducta, alcance y excepciones |
| ¿Qué puedo hacer o recibir? | Derecho o permiso propio, prestación a su favor y requisitos para ejercerlo |
| ¿Qué limita lo que me prometen o permiten? | Condiciones, definiciones, modificaciones, excepciones y reglas de prevalencia |
| ¿Con qué debo tener cuidado y por qué? | Plazos, restricciones, requisitos y consecuencias expresadas, conectados con su evidencia |

Estas preguntas orientan el lenguaje de la plataforma. Las cinco tareas concretas con respuestas esperadas para un estudio se preparan en la tarea 1.7.

### Apoyo que debe ofrecer la plataforma

Toda explicación identifica la parte afectada y describe la acción en palabras comprensibles. Los términos definidos se consultan junto al fragmento donde se usan, y cada conclusión conduce a los textos que la sustentan, incluidos los de otras cláusulas.

Un punto de atención debe decir **qué revisar, por qué afecta a la parte seleccionada, bajo qué condiciones y dónde se establece**. Si el contrato no expresa una consecuencia, esa ausencia aparece en la explicación; una consecuencia potencial nunca se presenta como un hecho ocurrido.

Como muestra del lenguaje de salida: «Para utilizar este derecho, la solicitud debe realizarse dentro del plazo de la cláusula B; revisa esa condición junto con la cláusula A».

### Criterio cubierto por la tarea 1.1

Quedan definidos el usuario sin formación jurídica como referencia del diseño, la selección de perspectiva, los contextos iniciales y el apoyo necesario para comprender los puntos de atención. El reclutamiento y la evaluación de comprensión siguen pendientes en la etapa 7.

## 1.2 Carga contractual

### Definición operacional

Una **carga contractual para una parte** es una exigencia de actuar o una restricción de conducta que el texto le atribuye, con su alcance, plazos, condiciones y excepciones.

Las cargas directas se identifican en los nodos `Obligation` y `Prohibition`. Una carga describe **qué** se exige o restringe; su importancia, su costo de cumplimiento y la exposición al riesgo requieren un análisis aparte.

| Entidad | Atribución de carga | Qué debe explicarse |
|---|---|---|
| `Obligation` | A la parte identificada como actor responsable | Qué debe hacer, para quién, cuándo y bajo qué condiciones |
| `Prohibition` | A la parte identificada como sujeto restringido | Qué conducta se restringe, su alcance y las excepciones |
| `Condition` | Delimita la aplicación de una disposición; por sí sola no identifica una obligación | Qué debe ocurrir para activar, suspender o limitar la disposición |
| `Value` | Caracteriza una disposición cuando está vinculado a ella | Importe, duración, porcentaje o cantidad, y qué aspecto cuantifica |

### Cómo identificar una carga

Localizar una obligación o prohibición, justificar su atribución a la parte seleccionada y reconstruir su alcance con las condiciones, términos definidos y relaciones pertinentes. La salida conserva tanto la evidencia de la exigencia como la que permite identificar a la parte afectada.

Una frase puede describir una carga **condicional** aunque no sepamos si el evento que la activa ocurrió; en ese caso se presenta como condicional. Si la disposición es recíproca, se conserva el efecto sobre cada parte según lo que el texto establezca.

### Ejemplos y límites

Fragmentos inventados para ilustrar la definición.

| Fragmento hipotético | Lectura operacional |
|---|---|
| «El arrendatario deberá pagar al arrendador la renta el día 5 de cada mes». | Carga del arrendatario: efectuar el pago, con frecuencia y fecha. El importe requiere su propia evidencia. |
| «El consultor no divulgará a terceros la información confidencial del cliente». | Carga del consultor: abstenerse de divulgar. El contenido de «información confidencial» se lee en su definición. |
| «Si el cliente aprueba el presupuesto, el técnico deberá entregar el equipo dentro de diez días». | Carga condicional del técnico. Sin información sobre la aprobación, no se afirma que el plazo haya comenzado. |
| «El cliente podrá solicitar un reembolso dentro de siete días». | Derecho con requisito temporal. Poder solicitarlo no equivale a tener que hacerlo; el plazo sí puede ser un punto de atención. |

Una disposición que concede un derecho a otra parte puede afectar a la parte seleccionada, pero clasificar ese efecto como carga directa exige evidencia de la obligación o restricción correspondiente. Las facultades ajenas y la exposición que generan se analizan en las tareas 1.4 y 1.5, sin forzarlas dentro de `Obligation`.

**Tener más cargas no demuestra que el contrato sea peor.** Una carga puede ser recíproca, estar compensada o resultar irrelevante para una prioridad concreta: la cantidad de nodos y el tipo de disposición no determinan por sí solos su gravedad.

### Criterio cubierto por la tarea 1.2

La carga queda definida mediante tipos y atribuciones de la ontología, con ejemplos, condiciones de aplicación y límites de interpretación. Puede usarse para anotar contratos sin depender del caso Bellicum–Miltenyi.

## 1.3 Beneficio o protección

### Definición operacional

Un **beneficio contractual para una parte** es un efecto sustentado en el texto que le permite actuar, le atribuye una prestación a recibir o protege un interés identificable suyo, descrito junto con los requisitos, límites y excepciones que lo condicionan.

Una **protección** es un beneficio en el que una disposición restringe conductas que afectarían a esa parte, exige actuaciones a su favor o establece una respuesta ante una situación descrita. La clasificación expresa el efecto que el texto atribuye; su conveniencia práctica depende de las circunstancias de la parte.

| Origen en la ontología | Efecto que puede atribuirse | Evidencia necesaria |
|---|---|---|
| `Right / Permission` | Posibilidad de actuar o ejercer lo que el contrato permite | Contenido del derecho, titular y requisitos o límites |
| `Obligation` de una parte | Prestación a favor de otra parte | Acción debida y destinatario identificable en el texto |
| `Prohibition` sobre una parte | Protección de otra frente a la conducta restringida | Conducta prohibida e interés o parte protegida justificable |

Un permiso para actuar no implica que otra parte deba realizar una prestación, y detectar una obligación o prohibición no basta para identificar automáticamente a su beneficiario.

### Cómo atribuir el beneficio

El titular de un derecho se identifica en la disposición y sus referencias. Para obligaciones y prohibiciones hay que establecer quién recibe la prestación o qué interés se protege, y eso puede estar en la misma frase o exigir leer otras disposiciones, definiciones o roles.

Cuando la atribución requiere interpretación, se conserva la evidencia y se marca que necesita revisión; si no puede justificarse, el beneficiario queda **sin determinar**. Que haya dos partes principales no autoriza a completar automáticamente la contraparte: la ontología admite terceros y disposiciones recíprocas.

### Una disposición con efectos sobre dos partes

> El consultor no divulgará a terceros la información confidencial del cliente.

Para el consultor es una carga de abstención; para el cliente, una protección de su información. Se conserva **una sola prohibición con dos perspectivas de efecto**, sin crear un segundo derecho solo para mostrar al beneficiario.

Si otra cláusula excluye la información públicamente disponible de «información confidencial», esa definición delimita a la vez la restricción del consultor y la protección del cliente. Por eso importa recorrer `USES` y `DEFINES`, además de las relaciones de dependencia o modificación.

### Ejemplo de un beneficio condicionado por otra cláusula

> Cláusula A: El cliente podrá cancelar el servicio y recibir un reembolso conforme a la cláusula B.
>
> Cláusula B: El reembolso previsto en A solo estará disponible si el cliente solicita la cancelación dentro de siete días desde la confirmación.

A sola identifica un derecho; A y B juntas muestran que está condicionado a un plazo. La plataforma debe hacer visible esa condición y permitir consultar ambos fragmentos: «El reembolso requiere solicitar la cancelación dentro de siete días desde la confirmación. Revisa el plazo de B junto con el derecho de A». Sin datos sobre las fechas, no se afirma que el usuario ya perdió el beneficio.

### Límites de la interpretación

Un beneficio puede ser condicionado, limitado o venir acompañado de cargas; su existencia no equivale a una valoración favorable del contrato. Varias partes pueden beneficiarse de una disposición, y la carga de una no tiene por qué igualar el beneficio de otra.

Para no confundir ausencia de datos con ausencia de beneficio, deben distinguirse **una atribución sustentada, una interpretación pendiente y un beneficiario no determinado**. Encontrar la cita literal acredita su presencia en el documento, no la interpretación del efecto.

### Criterio cubierto por la tarea 1.3

Beneficio y protección quedan definidos a partir de derechos, prestaciones y restricciones sustentadas, con la atribución al beneficiario, el tratamiento de condiciones y los límites frente a la valoración global. La representación de múltiples efectos y su visualización corresponden a la etapa 3.

## 1.6 Relevancia estructural

### Definición operacional

La **relevancia estructural de una cláusula** es cuánto manda dentro de su contrato, medida sobre la estructura del grafo. Es independiente de quién lea: ordena las cláusulas, no las atribuye.

Se distingue de la carga y del beneficio, que sí son atribuidos. Una cláusula puede ser muy relevante y afectar por igual a las dos partes, o poco relevante y estar completamente desequilibrada.

| Origen en la ontología | Papel en la medida |
|---|---|
| `Clause` | La unidad que recibe la masa inicial; todas reciben la misma |
| `Obligation`, `Right`, `Prohibition` | Reparten esa masa dentro de su cláusula, a partes iguales |
| Todas las relaciones del grafo | Redistribuyen la masa durante el recorrido |

### Cómo se obtiene

Un PageRank cuyo vector de personalización reparte el reinicio entre las cláusulas y, dentro de cada una, entre sus disposiciones. La fórmula y su procedencia están en [`metricas/importancia-clausula.md`](./metricas/importancia-clausula.md).

El reparto uniforme por cláusula es la decisión que define la medida: **una cláusula con quince disposiciones no empieza pesando cinco veces una con tres**. Sin ese ajuste la medida reproduce el número de disposiciones y no aporta nada frente a contarlas — la versión anterior coincidía con el recuento en ρ = 0.882.

### Qué tarea resuelve

Ordenar las filas de la retícula. Es la única función que se le atribuye hoy, y el criterio para conservarla es que el orden ayude a decidir qué leer primero.

### Límites de la interpretación

**No es relativa a una parte.** La tarea 1.6 pedía definirla «respecto de una parte» y la respuesta encontrada es que esta medida no lo es: su vector de personalización es uniforme sobre el documento. Responde *qué cláusula importa en este contrato*, nunca *para quién*.

Existe una variante que sí lo sería —sembrar en las disposiciones de la parte y propagar solo por las relaciones que no repiten la posición—, descrita pero no probada: sobre el documento de estudio ese subgrafo no existe, porque solo hay tres relaciones informativas.

**Depende de que el documento tenga estructura.** La medida solo distingue cuando hay relaciones que redistribuyan la masa, y el documento de estudio tiene tres: el rango entre la primera y la última cláusula es un factor 2, y una cláusula con una sola disposición puede quedar tercera. Comprobar si el orden resulta interpretable exige un documento con referencias cruzadas.

### Criterio cubierto por la tarea 1.6

Queda definida, separada de la atribución de efectos, asociada a una tarea concreta y acotada por dos límites verificados: no distingue partes y necesita un contrato con referencias cruzadas. La comparación sistemática con alternativas corresponde a la etapa 4.

## 1.9 Límites de los pesos actuales

### Qué representan

Los pesos por tipo —prohibición 1.0, obligación 0.7, derecho 0.3— expresan un supuesto: **prohibir ata más que obligar, y obligar más que permitir**. Es una decisión de modelado, no un hecho del contrato, y por eso son ajustables.

Se aplican únicamente al [reparto del beneficio](./metricas/reparto-beneficio.md) por cláusula. No intervienen en la relevancia estructural.

### Qué mueve realmente cada peso

Una disposición acredita a la parte a la que sirve, y su peso viaja completo a ese extremo: una prohibición resta oportunidades a quien la soporta y acredita por el mismo peso a quien protege.

De ahí una consecuencia que conviene enunciar: **el peso de las prohibiciones no solo penaliza, también reparte beneficio**. Subirlo no endurece el análisis de forma neutra, traslada más cuota de una parte a la otra. En el documento de estudio, de la cuota positiva total el peso de obligación explica el 39%, el de derecho el 34% y el de prohibición el 26%.

### Límites de la interpretación

**No están validados.** Nada sostiene que 1.0, 0.7 y 0.3 sean las proporciones correctas. Son parámetros de exploración: sirven para ver si una conclusión resiste al moverlos, no para afirmar magnitudes.

**Su influencia es menor de lo que parece.** Sustituir el peso por un recuento de disposiciones produce casi la misma clasificación: ρ = 0.964. El recuento sería verificable contando las marcas de la fila, a costa de perder la distinción entre prohibir y permitir. La decisión sigue abierta.

**Una conclusión que cambia al mover un peso no es una conclusión.** El uso previsto de los deslizadores es comprobar esa estabilidad, y hay que explicárselo al usuario.

### Criterio cubierto por la tarea 1.9

Los pesos quedan documentados como supuesto explícito, con su efecto real sobre el reparto, una medida de cuánto aportan frente a una alternativa sin pesos y la instrucción de tratarlos como exploración hasta que exista validación.

## Papel de la ontología en estas definiciones

Carga, beneficio y protección son lecturas de las entidades y relaciones existentes desde la perspectiva de una parte. **Ninguna definición requiere añadir tipos de nodo nuevos.**

| Elementos de la ontología | Papel en la interpretación |
|---|---|
| `Clause`, `IS PART OF / CONTAINS` | Ubicar la disposición y conservar su contexto estructural |
| `Party`, `ASSIGNS OBLIGATION TO`, `GRANTS RIGHT TO` | Identificar responsables o titulares; complementar con evidencia de beneficiarios |
| `Obligation`, `Right / Permission`, `Prohibition` | Describir la exigencia, la posibilidad de actuación o la restricción |
| `Defined Term`, `DEFINES`, `USES` | Precisar el significado contractual de los términos y el alcance de las disposiciones |
| `Condition`, `DEPENDS ON` | Identificar requisitos de aplicación y dependencias |
| `Value` | Caracterizar importes, plazos, frecuencias u otras cantidades cuando el vínculo esté sustentado |
| `REFERENCES`, `Reference` | Localizar contexto referido; una referencia no demuestra por sí sola un efecto adverso |
| `MODIFIES / AMENDS`, `SUPERSEDES` | Examinar cambios de alcance y reglas de prevalencia cuando estén expresados |
| `CONTRADICTS` | Representar un posible conflicto identificado durante el análisis, que debe justificarse |

Las relaciones de atribución no especifican por sí solas todos los beneficiarios: el [esquema actual](../server/schemas/knowledge.py) conserva `burdenPartyId` y `benefitPartyId` en las disposiciones, pero su presencia no demuestra que la atribución sea correcta. Los casos con múltiples partes y sus vínculos visuales son trabajo de la etapa 3.

La [guía de extracción](../server/services/graph/knowledge/ontology.py) agrupa bajo `right` tanto las facultades discrecionales como las libertades expresadas como ausencia de obligación; la tarea 1.4 precisará cómo interpretar esa diferencia. `CONTRADICTS` figura en el esquema como relación de análisis, lo que no supone que la extracción ya detecte conflictos.

## Decisiones y alcance pendiente

| Decisión de trabajo | Consecuencia para el proyecto |
|---|---|
| Diseñar para una persona sin formación jurídica | Explicar acciones, condiciones y puntos de atención en lenguaje cotidiano, con evidencia consultable |
| Definir carga y beneficio por atribución a una parte | Mostrar ambas perspectivas de una disposición cuando estén sustentadas |
| Conservar condiciones, excepciones y definiciones | Analizar también las disposiciones que modifican el alcance de la cláusula seleccionada |
| Utilizar ejemplos hipotéticos variados | Mantener definiciones generales y reservar los contratos reales para su evaluación |
| Separar efecto identificado y valoración | Mantener pendientes la medición de favorabilidad, la exposición al riesgo y el papel de los pesos |

El siguiente paso es **1.4, definir capacidad de decisión**, para la que ya existe un método medido pero no redactado. Siguen pendientes la formalización del riesgo, las preguntas analíticas, la definición de asimetría, la validación experta, la generación de nuevos KG y la implementación visual.
