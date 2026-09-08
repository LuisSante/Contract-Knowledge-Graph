# Cómo se mantiene la documentación

`docs/` es la memoria del proyecto: lo que se decidió, lo que se midió y por qué. Si
una decisión no llega aquí, dentro de dos semanas nadie sabrá por qué el código es como
es. Estas reglas existen para eso, no por formalidad.

## La carpeta decide dónde aparece

`docs/<carpeta>/` es el grupo de la barra lateral en `/docs`. Archivar el fichero **es**
organizarlo: no hay ninguna lista que tocar en el código.

| Carpeta | Qué va ahí |
|---|---|
| `docs/ontologia/` | el esquema del KG: tipos de nodo y arista, campos, qué no sabe expresar |
| `docs/metricas/` | qué se calcula y cómo — fórmulas, y por qué se descartó lo anterior |
| `docs/medidas/` | qué salió al medir sobre el corpus |
| `docs/` (raíz) | investigación: marco conceptual, plan de tareas |

El título del `#` es la etiqueta de la barra: la parte anterior al guion largo es el
nombre corto, y el resto la frase completa. `# PageRank personalizado — impacto deóntico
por parte` sale como *«PageRank personalizado»*.

Los enlaces relativos entre documentos se reescriben al renderizar, pero deben resolver
también en disco para que funcionen en GitHub.

## Cuándo actualizar, sin esperar a que lo pidan

- **Cambia una fórmula o se sustituye una métrica** → `docs/metricas/`. Un método
  descartado **no se borra**: se le pone una nota de estado arriba que diga qué lo
  reemplazó y qué se midió para decidirlo. El resultado negativo es material del paper.
- **Cambia el esquema del KG, el prompt de extracción o la ontología** →
  `docs/ontologia/esquema.md`.
- **Se completa una tarea de `docs/tasks.md`** → marcarla `[x]` y escribir su sección en
  `docs/marco-conceptual.md`, siguiendo la forma de las anteriores: definición
  operacional, tabla de origen en la ontología, cómo identificarlo, ejemplos
  hipotéticos, límites de la interpretación.
- **Se regeneran los grafos de `infra/json/kg/`** → `make docs`.
- **Se elimina una vista o una capa** → los documentos que la describían se borran o se
  anotan. Un documento que describe algo que ya no existe es peor que no tenerlo.

## Las tablas se generan, la prosa no

Las tablas de `docs/medidas/corpus.md` viven entre marcadores `<!-- tabla:N -->` y las
escribe `scripts/measure_kg_corpus.py`. **Nunca se editan a mano**: `make docs` las
regenera y deja intacto el texto que las interpreta.

Si una medición nueva merece su propia tabla, va al script y al documento con su propio
marcador — no como números pegados.

## Qué no documentar

Nada que el código ya diga: firmas, estructura de ficheros, qué importa cada módulo. La
documentación es para lo que **no** se deduce leyendo el código — por qué se eligió algo,
qué se probó y falló, qué números respaldan una decisión.

## Números medidos, no recordados

Toda cifra en `docs/` debe poder rastrearse a un script o a un procedimiento descrito. Si
una afirmación se apoya en un solo documento, hay que decirlo ahí mismo: los tres grafos
actuales fueron generados por **versiones distintas del extractor**, y comparar entre
ellos mezcla efectos del contrato con efectos del pipeline.
