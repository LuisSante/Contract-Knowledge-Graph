# Cómo se mantiene la documentación

`docs/` es la memoria del proyecto: lo que se decidió, lo que se midió y por qué. Si una
decisión no llega aquí, dentro de dos semanas nadie sabrá por qué el código es como es.

La pregunta que ordena todo:

> ¿Cómo puede un sistema de análisis visual ayudar a identificar y explicar qué cláusulas
> favorecen a cada parte de un contrato y qué exposición al riesgo generan?

Un documento que no ayuda a responderla no pertenece a `docs/`.

## La carpeta decide dónde aparece

`docs/<carpeta>/` es el grupo de la barra lateral en `/docs`. Archivar el fichero **es**
organizarlo: no hay ninguna lista que tocar en el código.

| Carpeta | Qué va ahí |
|---|---|
| `docs/ontologia/` | el esquema del KG: tipos de nodo y arista, campos, qué no sabe expresar |
| `docs/metricas/` | qué se calcula y cómo — fórmulas, y por qué se descartó lo anterior |

El título del `#` es la etiqueta de la barra: la parte anterior al guion largo es el
nombre corto, y el resto la frase completa. `# PageRank personalizado — impacto deóntico
por parte` sale como *«PageRank personalizado»*.

Los enlaces relativos entre documentos se reescriben al renderizar, pero deben resolver
también en disco para que funcionen en GitHub.

## Cuándo actualizar, sin esperar a que lo pidan

- **Cambia una fórmula o se sustituye una métrica** → `docs/metricas/`. Lo descartado **no
  se borra**: se resume en una frase dentro del documento que lo reemplazó, con el número
  que decidió el cambio. El resultado negativo es material del paper, pero no necesita
  fichero propio.
- **Cambia el esquema del KG, el prompt de extracción o la ontología** →
  `docs/ontologia/esquema.md`.
- **Se elimina una vista o una capa** → los documentos que la describían se borran. Un
  documento que describe algo que ya no existe es peor que no tenerlo.

## Qué no documentar

Nada que el código ya diga: firmas, estructura de ficheros, qué importa cada módulo. La
documentación es para lo que **no** se deduce leyendo el código — por qué se eligió algo,
qué se probó y falló, qué números respaldan una decisión.

Tampoco va aquí el detalle de ingeniería del pipeline. Si hace falta explicarlo, va en el
propio código o en un cuaderno de `notebooks/`, no en `docs/`.

## Números medidos, no recordados

Toda cifra en `docs/` debe poder rastrearse a un script o a un cuaderno que la regenere.
Una cifra copiada de una sesión no cuenta.

Los indicadores del grafo los calcula `notebooks/KG/measure_kg.ipynb`, que los mide contra
el texto del que salieron y los acumula por documento en `infra/json/indicator_history.json`,
con la huella del grafo y la del prompt que lo produjo. **Se reportan por separado; no se
agregan en una puntuación única** — la que hubo se retiró porque sus pesos no los validaba
nada y su recorrido sobre el corpus entero era de nueve puntos.

Al comparar entre contratos, recordar que cada uno se extrajo una sola vez: sin corridas
repetidas del mismo documento con el mismo prompt no se sabe cuánto de una diferencia es
ruido de muestreo.
