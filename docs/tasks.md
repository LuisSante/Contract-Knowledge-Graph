# Tareas de investigación y desarrollo — Clause Impact Explorer

Las tareas conectan la representación contractual, el análisis computacional y la visualización con una pregunta central:

> ¿Cómo puede un sistema de análisis visual ayudar a identificar y explicar qué cláusulas favorecen a cada parte de un contrato y qué exposición al riesgo generan, considerando sus condiciones, excepciones y dependencias?

El recorrido del usuario será **localizar asimetrías → explicar sus efectos → verificar la interpretación**. Queremos que la exploración permita formular una hipótesis, contrastarla y guardar una conclusión con evidencia.

## Cómo usar esta lista

- Marcar `[x]` cuando exista el resultado descrito y se haya comprobado el criterio correspondiente. Una implementación o un resultado de un modelo, por sí solos, no cierran una tarea de validación.
- Al completar una tarea, añadir debajo la fecha y un enlace a su evidencia: documento, experimento, resultado, figura o cambio implementado.
- Mantener visibles los resultados negativos, las decisiones pendientes y los desacuerdos. También forman parte del avance de la investigación.
- Seguir el orden de las etapas. Los bocetos visuales pueden comenzar con los ejemplos revisados de las primeras etapas; su desarrollo no necesita esperar a todas las extracciones.
- Las casillas reflejan el estado actual de los entregables. Las definiciones de trabajo completadas no sustituyen las validaciones empíricas o expertas de las etapas posteriores.

## Acuerdo sobre Personalized PageRank

Personalized PageRank (PPR) mide la **relevancia estructural de una entidad respecto del vector de reinicio que se le dé**. Ese vector es la decisión del método, y la que está desplegada reparte el reinicio **entre las cláusulas** y, dentro de cada una, entre sus disposiciones: ordena el documento, no lo lee desde una parte. Está en [`metricas/importancia-clausula.md`](./metricas/importancia-clausula.md).

Sembrar el reinicio en el nodo de una parte —la hipótesis inicial de este acuerdo— se probó y se descartó con medidas: ordenaba por tamaño (ρ = 0.882 contra contar disposiciones) y dejaba cuatro cláusulas en cero exacto. Ver [`metricas/descartados.md`](./metricas/descartados.md).

Queda pendiente una variante que sí sería relativa a una parte: sembrar en sus disposiciones y propagar solo por las relaciones que no repiten la posición. El sentido contractual de una disposición —a quién restringe o beneficia— se atribuye por evidencia, no por centralidad; que la relevancia estructural se relacione con favorabilidad o riesgo sigue siendo una hipótesis por comprobar.

## 1. Definir favorabilidad, carga y riesgo

**Propósito:** acordar qué queremos observar y qué conclusiones podrá justificar el sistema.

- [x] **1.1 Precisar el usuario y el contexto de uso.** Definir quién analizará el contrato, desde qué perspectiva y para qué decisión. Registrar qué conocimiento contractual se presupone y qué apoyo necesita ese usuario.

  Completada como definición de trabajo el 2026-09-08: [usuario y contexto de uso](./marco-conceptual.md#11-usuario-y-contexto-de-uso). El diseño contempla a personas naturales sin formación jurídica, además de usuarios con experiencia, y explica puntos de atención a partir de disposiciones y sus dependencias.

- [x] **1.2 Definir carga contractual.** Describir qué cuenta como una obligación de actuar o una restricción de conducta según la ontología, con ejemplos hipotéticos variados y casos que requieran interpretación. Reservar los fragmentos de contratos reales para validar la definición sin ajustarla a un documento particular.

  Completada como definición de trabajo el 2026-09-08: [carga contractual](./marco-conceptual.md#12-carga-contractual). Incluye atribución al responsable, condiciones de aplicación y la distinción entre una carga y un requisito para ejercer un derecho.

- [x] **1.3 Definir beneficio o protección.** Describir prestaciones recibidas, derechos y restricciones que protegen los intereses de una parte. Separar el efecto reconocido en el texto de su valoración según las prioridades de esa parte.

  Completada como definición de trabajo el 2026-09-08: [beneficio o protección](./marco-conceptual.md#13-beneficio-o-protección). Incluye atribución sustentada del beneficiario, doble efecto de una prohibición, límites derivados de otras disposiciones e información pendiente de revisión.

- [ ] **1.4 Definir capacidad de decisión.** Explicar cómo reconocer quién puede autorizar, modificar, suspender o terminar algo. Distinguir una facultad unilateral de una autorización ordinaria cuando esa diferencia sea relevante para el análisis.
- [ ] **1.5 Definir exposición al riesgo.** Identificar las consecuencias adversas posibles, sus desencadenantes y las protecciones que las limitan. Indicar qué dimensiones pueden observarse en el contrato y cuáles necesitan información externa o juicio experto.
- [x] **1.6 Definir relevancia estructural.** Especificar qué significa que una entidad sea relevante respecto de una parte y qué tarea podría ayudar a resolver su ranking mediante PPR. Resuelta en [marco conceptual §1.6](./marco-conceptual.md) y [`metricas/importancia-clausula.md`](./metricas/importancia-clausula.md); la respuesta encontrada es que la medida **no** resulta relativa a una parte.
- [ ] **1.7 Redactar cinco preguntas analíticas concretas.** Cubrir localizar, explicar y verificar. Una pregunta inicial es: «¿Qué restricciones de Bellicum conceden capacidad de autorización a Miltenyi?». Para cada pregunta, indicar qué evidencia permitiría responderla y cómo evaluaríamos la respuesta.
- [ ] **1.8 Establecer qué contará como asimetría.** Definir diferencias observables entre partes en cargas, protecciones o facultades. Aclarar que una diferencia no demuestra por sí sola injusticia, favorabilidad global o mayor riesgo.
- [x] **1.9 Acordar los límites de los pesos actuales.** Documentar qué representa ponderar obligaciones, derechos y prohibiciones. Tratar esos pesos como parámetros de exploración hasta contar con una validación de su interpretación. Resuelta en [marco conceptual §1.9](./marco-conceptual.md) y [`metricas/reparto-beneficio.md`](./metricas/reparto-beneficio.md).

**Entregable:** una especificación conceptual breve con definiciones, usuario objetivo, ejemplos y cinco preguntas evaluables.

- [ ] **Criterio de cierre:** cada concepto tiene ejemplos, límites y una forma de observación; cada pregunta tiene una respuesta esperada verificable o una incertidumbre explícita.

## 2. Construir una referencia revisada del resumen

**Propósito:** disponer de casos confiables para comprobar la representación, los modelos y las métricas.

Documento de desarrollo: **BELLICUM_MILTENYI_Supply_Agreement_Summary**.

- [ ] **Fijar la versión del documento de referencia.** Conservar el documento, sus párrafos e identificadores y una huella del contenido. Toda comparación inicial debe partir del mismo texto.
- [ ] **Preparar una guía de anotación.** Para cada disposición, registrar cláusula, tipo, partes afectadas, beneficiarios, condiciones, excepciones, relaciones y fragmentos de evidencia. Aplicar las definiciones de la etapa 1.
- [ ] **Revisar las disposiciones contra el texto.** Comprobar lo que el KG actual extrajo y buscar también lo que omitió. La referencia debe construirse leyendo el documento, además de inspeccionar los elementos ya extraídos.
- [ ] **Revisar los efectos sobre ambas partes.** Verificar quién debe cumplir, quién está restringido, quién recibe una protección y quién controla una decisión. Conservar efectos recíprocos y efectos sobre terceros cuando estén sustentados.
- [ ] **Distinguir los estados de información.** Separar «el texto no lo especifica», «la interpretación es ambigua», «no aplica» y «la extracción lo omitió». No representar todos estos casos como una misma ausencia de datos.
- [ ] **Identificar casos difíciles.** Incluir reciprocidad, beneficiarios implícitos, facultades unilaterales, límites, excepciones y referencias a otras disposiciones. Registrar por qué cada caso es difícil y qué interpretación proponemos.
- [ ] **Revisar la referencia con conocimiento experto.** Solicitar revisión de una persona con experiencia en contratos y registrar desacuerdos y su resolución. Las anotaciones preparadas antes de esa revisión deben conservar su carácter provisional.
- [ ] **Relacionar el resumen con el contrato completo.** Registrar qué afirmaciones del resumen pueden comprobarse en el documento completo y qué contexto se perdió. Mantener separadas ambas fuentes para que una extracción del resumen no reciba crédito por información ausente en él.

**Entregable:** referencia anotada, guía de anotación y catálogo de casos difíciles, con estado de revisión y evidencia.

- [ ] **Criterio de cierre:** los casos seleccionados para desarrollar el método tienen interpretaciones justificadas; los desacuerdos y la información faltante permanecen visibles.

## 3. Formalizar y visualizar los efectos de una disposición sobre cada parte

**Propósito:** mostrar cómo una misma disposición puede restringir a una parte y beneficiar o proteger a otra.

Una prohibición puede tener ambos efectos, pero el beneficiario debe justificarse. No se presupone que toda restricción de A beneficie a B, ni que la magnitud de ambos efectos sea igual.

La propuesta inicial es conservar una sola disposición `s` y representar sus efectos sobre cada parte `p`:

\[
E(s,p) = \bigl(\text{cargas},\ \text{beneficios},\ \text{facultades}\bigr)
\]

Estos componentes son, inicialmente, colecciones de efectos identificados y sustentados. No constituyen todavía una puntuación numérica ni una fórmula de riesgo.

- [ ] **Definir la representación de efectos.** Cada efecto debe identificar la disposición, la parte afectada, el tipo de efecto, la evidencia y su estado de revisión. Permitir varias partes y varios efectos cuando el texto lo requiera.
- [ ] **Separar identificación y valoración.** Primero registrar qué efecto se atribuye y por qué. Añadir magnitudes únicamente con una escala y un criterio explícitos; no imponer valores opuestos o iguales entre las partes.
- [ ] **Representar reciprocidad y atribuciones incompletas.** Especificar cómo tratar «cada parte», roles que cambian según un evento, terceros y beneficiarios desconocidos. Evitar que una disposición recíproca se confunda con una extracción incompleta.
- [ ] **Construir el ejemplo de reventa sujeta a autorización.** El KG actual atribuye a Bellicum la restricción de revender sin autorización escrita de Miltenyi y señala a Miltenyi como beneficiaria. Revisar esa atribución y la posible facultad de autorización antes de usarla como caso validado.
- [ ] **Diseñar marcas vinculadas entre partes.** Conservar filas por cláusula y columnas por parte. Una misma disposición podrá tener representaciones vinculadas en ambas columnas; seleccionar una resaltará la otra y su evidencia común.
- [ ] **Distinguir disposición y efecto en los conteos.** Mostrar que dos efectos de una misma disposición no son dos disposiciones independientes. Definir también cómo evitar duplicar una misma disposición expresada de varias formas en el KG.
- [ ] **Mostrar cargas y beneficios por separado.** Diseñar un resumen por cláusula y parte que conserve ambas dimensiones. Si se propone un saldo, comprobar qué información oculta y mantener accesibles sus componentes.
- [ ] **Probar el prototipo con casos revisados.** Incluir una restricción con beneficiario identificado, una disposición recíproca, un beneficiario desconocido y una excepción. Comprobar que se entiende quién está afectado y qué evidencia sustenta cada efecto.

**Ejemplo inicial que deberá revisarse:**

| Disposición | Perspectiva de Bellicum | Perspectiva de Miltenyi |
|---|---|---|
| Reventa sujeta a autorización escrita | Restricción de actuación | Beneficio atribuido y posible control de autorización por revisar |

**Entregable:** especificación de efectos y prototipo visual pequeño conectado con evidencia.

- [ ] **Criterio de cierre:** se puede explicar una disposición desde ambas partes sin duplicarla como hecho contractual, y la interfaz distingue efectos sustentados, interpretaciones pendientes y datos desconocidos.

## 4. Auditar PPR y trasladar el cálculo validado al backend

**Propósito:** comprobar tanto el cálculo matemático como la utilidad de la relevancia estructural respecto de una parte.

La revisión preliminar de `attention.ts` encontró una actualización compatible con la forma habitual de PPR y conservación de masa al reproducirla sobre el resumen. También observó que la magnitud por cláusula agrega enunciados sin efecto atribuido a la parte seleccionada. Estas observaciones motivan la auditoría; no constituyen su cierre.

- [ ] **Documentar todos los usos actuales de PPR.** Identificar dónde interviene en rankings, selección de evidencia, pesos por cláusula y comparaciones. Diferenciar las funciones activas de las vistas o métodos que quedaron desactivados.
- [x] **Especificar el recorrido.** Documentar nodos fuente, vector de personalización, probabilidad de reinicio, dirección de las relaciones, pesos, tratamiento de relaciones repetidas y nodos sin salida. Explicar qué significa cada decisión para una lectura centrada en una parte. Documentado en [`metricas/importancia-clausula.md`](./metricas/importancia-clausula.md) para el método vigente.
- [x] **Verificar la implementación numérica.** Comparar con una implementación de referencia usando exactamente el mismo grafo y parámetros. Comprobar valores no negativos, masa total, residuo y convergencia; incluir casos pequeños con resultado conocido y entradas inválidas. Contrastada contra `networkx.pagerank`: coincide dentro de 4.3e-11, masa 1, sin negativos, punto fijo único. Detalle en [`metricas/importancia-clausula.md`](./metricas/importancia-clausula.md).
- [x] **Analizar componentes desconectados y reciprocidad.** Determinar cuándo un cero refleja falta de conexión con la fuente y cuándo revela una representación incompleta, como un nodo separado de «cada parte». Corregir la representación cuando corresponda y conservar el significado de los ceros restantes. El nodo «each Party» dejaba cuatro cláusulas en cero exacto; el prior por cláusula lo corrige y ninguna puede valer cero.
- [x] **Separar relevancia estructural y efecto atribuido.** Mantener distinguibles la relevancia de una entidad respecto de una parte y las cargas o beneficios sustentados para esa parte. Revisar las agregaciones por cláusula para que su etiqueta describa lo que realmente suman. El orden usa la relevancia estructural y la barra el efecto atribuido; cada etiqueta describe lo que suma.
- [x] **Revisar la comparabilidad entre partes.** Examinar valores originales, normalizaciones y denominadores. Una normalización consistente facilita comparar, pero no demuestra que la relevancia estructural sea una medida comparable de utilidad o riesgo. La normalización por ego daba a cada parte un denominador distinto; anotado en [`metricas/descartados.md`](./metricas/descartados.md).
- [ ] **Comparar tres alternativas.** Evaluar una base de efectos directos, el PPR actual y una variante que considere tipos de relación, dirección y atribución de efectos. Justificar las transiciones de la variante antes de evaluar sus resultados.
- [ ] **Evaluar sensibilidad y utilidad.** Variar parámetros y revisar cambios en los rankings y en la evidencia recuperada. Usar los casos de referencia para comprobar si PPR ayuda a localizar o explicar algo relevante y qué errores introduce.
- [ ] **Decidir el papel de PPR.** Registrar en qué tareas aporta valor frente a la base. Puede conservarse para priorizar lectura o recuperar evidencia si los resultados apoyan ese uso. Documentar también los usos que no queden respaldados.
- [x] **Implementar el cálculo validado en el backend.** Centralizar el método y devolver resultados con versión del KG, parámetros, versión del método y contribuciones por disposición. Verificar equivalencia con los resultados de referencia. En `services/graph/knowledge/personalized_pagerank.py`, servido por `POST /knowledge_graph/<doc>/clause_importance` con contribuciones por disposición. Equivalencia con el frontend que sustituye verificada a 6.9e-18.
- [ ] **Incorporar las correcciones del usuario al estado analizado.** Las fusiones de partes y las correcciones de atribución deben reflejarse en el cálculo. Definir cuándo recomputar resultados y cómo identificar la versión corregida que los produjo.

**Entregable:** auditoría reproducible, comparación de alternativas, decisión sobre el uso de PPR y servicio de análisis validado.

- [ ] **Criterio de cierre:** el cálculo coincide con la referencia dentro de una tolerancia documentada y cada resultado tiene una interpretación explícita. El papel elegido para PPR está respaldado por la comparación con la base.

## 5. Generar y evaluar KG con varios modelos

**Propósito:** medir si distintas configuraciones mejoran la extracción y si los hallazgos se mantienen entre ejecuciones.

El experimento inicial usa el mismo resumen. Varias ejecuciones sobre él miden variabilidad del extractor; no aumentan el número de contratos independientes.

- [ ] **Identificar la configuración base.** Recuperar, cuando sea posible, modelo, instrucciones y parámetros asociados con el KG existente. Registrar como desconocida cualquier procedencia que no pueda verificarse y preparar una nueva ejecución base documentada.
- [ ] **Seleccionar las configuraciones del piloto.** Comparar la configuración base, GPT-5 y un candidato de mayor capacidad disponible en la API. GPT-6 Astra es un candidato a comprobar; la selección final dependerá del acceso y del presupuesto del experimento.
- [ ] **Preparar la compatibilidad de cada configuración.** Comprobar parámetros admitidos, salida estructurada y límites de respuesta. Registrar las diferencias necesarias entre modelos, incluidos sus ajustes de razonamiento.
- [ ] **Versionar las salidas antes de generar.** Dar a cada ejecución un identificador propio y conservar documento, huella del texto, instrucciones, esquema, partición, modelo, configuración y fecha. Guardar la respuesta original y el KG procesado sin sobrescribir resultados anteriores.
- [ ] **Fijar las condiciones comparables.** Mantener documento, instrucciones, esquema y partición del texto constantes en la comparación inicial. Si después se experimenta con el tamaño de fragmentos o con instrucciones específicas, tratarlo como un experimento separado.
- [ ] **Estimar el costo del piloto.** Definir límites de tokens y registrar la estimación antes de las ejecuciones. Conservar consumo real, costo y tiempo para comparar calidad con recursos utilizados.
- [ ] **Ejecutar tres repeticiones por configuración.** Usarlas como piloto de variabilidad, no como garantía de estabilidad. Conservar también fallos de extracción y respuestas incompletas; decidir después si la variación observada exige más repeticiones.
- [ ] **Evaluar contra la referencia revisada.** Medir recuperación de disposiciones, atribución de efectos a ambas partes, condiciones, relaciones y fidelidad de citas. Definir cómo emparejar elementos entre KG con identificadores y granularidades diferentes.
- [ ] **Comparar el impacto sobre los hallazgos.** Registrar si una misma asimetría aparece, desaparece o cambia de interpretación entre ejecuciones. Separar cambios en el ranking de cambios en los hechos y efectos extraídos.
- [ ] **Interpretar el desacuerdo entre modelos.** Revisar casos discrepantes contra el documento. El acuerdo entre modelos informa sobre estabilidad, pero no reemplaza la comprobación de exactitud.
- [ ] **Seleccionar y documentar la configuración de trabajo.** Justificarla con calidad, estabilidad, costo y errores relevantes para las tareas del usuario. Conservar las demás variantes como resultados experimentales.

**Entregable:** conjunto de KG versionados y tabla comparativa de calidad, estabilidad, costo y tiempo.

- [ ] **Criterio de cierre:** se puede rastrear y volver a ejecutar cada configuración; la elección del extractor se apoya en la referencia y en la estabilidad de los hallazgos, no solamente en la cantidad de nodos generados.

## 6. Completar el recorrido analítico: localizar, explicar y verificar

**Propósito:** integrar representación, cálculo y evidencia para producir una conclusión justificable.

| Tarea del usuario | Interacción propuesta | Resultado esperado |
|---|---|---|
| Localizar asimetrías | Comparar efectos por parte y filtrar restricciones, protecciones y facultades unilaterales | Selección de cláusulas que requieren revisión |
| Explicar sus efectos | Desplegar condiciones, excepciones y relaciones que limitan o amplían una disposición | Explicación de cómo se produce la asimetría |
| Verificar la interpretación | Consultar evidencia, revisar atribuciones y registrar desacuerdos | Hallazgo aceptado, rechazado o pendiente |

- [ ] **Implementar la comparación de efectos por parte.** Integrar las marcas vinculadas y los resúmenes definidos en la etapa 3. Permitir identificar qué dimensión origina una diferencia entre las partes.
- [ ] **Añadir filtros vinculados a preguntas analíticas.** Cubrir restricciones, protecciones, facultades unilaterales y efectos recíprocos. Hacer visible qué información queda fuera de cada selección.
- [ ] **Desplegar relaciones relevantes para una explicación.** Al seleccionar una disposición, mostrar las condiciones, excepciones y relaciones que la amplían o limitan. Cada relación utilizada debe poder comprobarse en el texto.
- [ ] **Integrar el ranking validado.** Utilizar el método seleccionado en la etapa 4 para la tarea que haya demostrado apoyar. Permitir entender por qué un elemento aparece primero y distinguir su relevancia de sus efectos contractuales.
- [ ] **Conectar comparación y evidencia.** Seleccionar un efecto o una relación debe localizar sus fragmentos de soporte. Conservar el contexto necesario para leer condiciones y excepciones, incluso cuando estén en páginas distintas.
- [ ] **Mostrar incertidumbre y cobertura.** Diferenciar evidencia localizada, interpretación revisada, atribución pendiente y elementos sin información suficiente. Evitar que una omisión de extracción se lea como ausencia de efecto contractual.
- [ ] **Permitir revisar las atribuciones.** Registrar correcciones, desacuerdos y su justificación. Mostrar cómo una corrección modifica el análisis y conservar su procedencia.
- [ ] **Crear una ficha de hallazgo.** Incluir afirmación, partes afectadas, disposiciones, efectos, evidencia, condiciones, incertidumbres y estado: aceptado, rechazado o pendiente. Un ejemplo de afirmación es «Esta protección depende de una autorización controlada por la contraparte».
- [ ] **Construir un perfil de exposición al riesgo.** Mostrar consecuencia posible, desencadenante, control de la contraparte, límites y remedios. Mantener como desconocida la probabilidad cuando no exista información que permita estimarla.
- [ ] **Definir y validar una rúbrica si se incorporan niveles de riesgo.** Antes de mostrar bajo, medio o alto, acordar dimensiones, escalas y ejemplos con expertos. Registrar supuestos y desacuerdos. Si esta funcionalidad queda fuera del alcance, documentar la decisión y conservar el perfil explicativo.
- [ ] **Guardar y exportar los hallazgos.** Conservar la evidencia y la versión del análisis que sustenta cada conclusión para poder revisarla y utilizarla en el estudio.
- [ ] **Recorrer un caso completo.** Partir de una pregunta, localizar la diferencia, investigar una condición o excepción, revisar la evidencia y terminar con una ficha de hallazgo justificada.

**Entregable:** un recorrido funcional que termine en una conclusión revisable y exportable, con sus incertidumbres.

- [ ] **Criterio de cierre:** un usuario puede explicar por qué identificó una asimetría, qué disposiciones modifican su lectura y qué evidencia permite aceptar, rechazar o dejar pendiente su interpretación.

## 7. Evaluar la contribución visual y ampliar los casos

**Propósito:** obtener evidencia de cuándo la visualización ayuda a identificar, explicar y verificar asimetrías contractuales.

- [ ] **Convertir las preguntas iniciales en tareas de evaluación.** Preparar tareas de localización, explicación y verificación con respuestas o criterios de evaluación derivados de la referencia. Definir qué cuenta como acierto, omisión y conclusión no sustentada.
- [ ] **Precisar la contribución frente al trabajo relacionado.** Revisar sistemas y métodos pertinentes de análisis visual de contratos, evidencia textual y análisis centrado en entidades. Explicar qué capacidad aporta esta propuesta y qué parte debe demostrar el estudio.
- [ ] **Diseñar una comparación que aísle la visualización.** Comparar la vista actual con la vista de efectos y evidencia utilizando el mismo KG, tareas y contenido. Considerar lectura convencional o tabla si esa base ayuda a responder la pregunta del estudio.
- [ ] **Preparar participantes y procedimiento.** Definir experiencia contractual requerida, instrucciones, entrenamiento y orden de las condiciones. Pilotar las tareas para detectar ambigüedades y ajustar el diseño antes del estudio principal.
- [ ] **Medir identificación y explicación.** Evaluar asimetrías correctamente encontradas, excepciones detectadas y calidad de las justificaciones. Registrar tiempo y esfuerzo junto con la exactitud.
- [ ] **Evaluar reconocimiento de incertidumbre.** Comprobar si los usuarios detectan atribuciones ambiguas, evidencia insuficiente y errores de extracción. Observar cuándo aceptan una conclusión sin respaldo suficiente.
- [ ] **Separar las evaluaciones del extractor, del método y de la interfaz.** Mantener fijos los demás componentes cuando se compare uno de ellos. Documentar después cómo se comporta el sistema completo con los errores reales del extractor.
- [ ] **Evaluar la contribución de las funciones principales.** Comparar, cuando el diseño del estudio lo permita, el efecto de las marcas vinculadas, las relaciones explicativas, la evidencia y el ranking. Evitar atribuir a una función mejoras causadas por otra.
- [ ] **Ampliar a contratos independientes.** Incluir el contrato completo y otros contratos con estructuras distintas. Reservar casos para evaluación que no se hayan utilizado para ajustar el método; mantener la distinción entre un contrato y su resumen.
- [ ] **Analizar resultados y fallos.** Informar qué tareas mejoran, cuáles no, qué errores persisten y qué desacuerdos aparecen entre usuarios o expertos. Relacionar esos resultados con las decisiones de diseño.
- [ ] **Preparar los materiales del paper.** Reunir formulación del problema, tareas, representación, decisiones visuales, método, experimentos, casos de uso y limitaciones. Respaldar cada afirmación con el resultado correspondiente.

**Entregable:** estudio de la contribución visual, evaluación en casos adicionales y materiales trazables para el paper.

- [ ] **Criterio de cierre:** las afirmaciones del paper se corresponden con lo evaluado; se distingue la evidencia sobre calidad de extracción, utilidad del cálculo y apoyo visual al razonamiento del usuario.

## Primer hito integrador

> Explicar una cláusula desde ambas partes, con sus condiciones o excepciones y su evidencia, y mostrar cómo cambia su interpretación al incorporar esas relaciones.

- [ ] Seleccionar el caso a partir de la referencia revisada.
- [ ] Representar sus efectos sobre ambas partes y distinguir lo conocido de lo pendiente.
- [ ] Vincular la disposición con una condición, excepción o relación relevante, si el texto la contiene.
- [ ] Mostrar la interpretación inicial y la interpretación después de incorporar ese contexto.
- [ ] Guardar una ficha de hallazgo con evidencia y revisión.
- [ ] Usar el caso para comprobar qué aporta PPR, qué errores de extracción importan y qué interacción visual facilita la explicación.

## Referencias de trabajo

- [Descripción del proyecto](../README.md).
- [Mediciones del corpus](./medidas/corpus.md).
- [Importancia de la cláusula — el orden de las filas](./metricas/importancia-clausula.md).
- [Reparto del beneficio — el porcentaje de cada cláusula](./metricas/reparto-beneficio.md).
- [Esquema del grafo de conocimiento](./ontologia/esquema.md).
- [Métodos descartados](./metricas/descartados.md) — qué se probó, qué se midió y qué lo reemplazó.
- [Cálculo actual de atención](../web/src/features/docx/utils/knowledge/attention.ts).
- [Construcción de la cuadrícula](../web/src/features/docx/utils/knowledge/statement-grid.ts).
- [Cálculo de la importancia de cláusula](../server/services/graph/knowledge/personalized_pagerank.py).
- [Notebook de extracción de KG](../notebooks/KG/build_kg.ipynb).
- [Referencia de PageRank en NetworkX](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.link_analysis.pagerank_alg.pagerank.html).
- Documentación oficial de los candidatos mencionados: [GPT-5](https://developers.openai.com/api/docs/models/gpt-5) y [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra). Comprobar disponibilidad y parámetros al preparar el experimento.
