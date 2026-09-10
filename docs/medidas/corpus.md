# Medidas del documento de estudio — sobre qué se apoyan los resultados

Todo lo que sigue está medido sobre **un** documento: el resumen del contrato
Bellicum–Miltenyi, 74 enunciados. Las tablas las genera `scripts/measure_kg_corpus.py`
leyendo el JSON almacenado —sin llamadas al modelo y sin tocar el código de la
aplicación—, así que puede correr mientras se cambia la app.

```bash
make docs
```

> **Un documento no es un corpus.** Ninguna cifra de aquí distingue todavía lo que es
> propio de los grafos de contratos de lo que es propio de este fichero, y además es un
> **resumen**: más corto y sin las referencias cruzadas que un contrato repite. Léase
> como el punto de partida, no como resultado. Ver [qué falta](#qué-falta).

---

## Tabla 1 — Presupuesto de aristas

Cuántas aristas dicen algo que la **posición** en la retícula no diga ya. La retícula
coloca cada enunciado en una fila (su cláusula) y un carril (su parte), de modo que dos
familias son redundantes por construcción:

| familia | tipos | lo que la posición ya dice |
|---|---|---|
| contención | `is_part_of` | a qué cláusula pertenece → **la fila** |
| parte | `assigns_obligation_to`, `grants_right_to` | a qué parte concierne → **el carril** |

El resto — `uses`, `defines`, `references`, `depends_on` — es **informativo**: nada de
la posición lo codifica, así que habría que dibujarlo.

<!-- tabla:1 -->
| medida | Bellicum–Miltenyi (resumen) |
|---|---|
| aristas | 158 |
| `is_part_of` | 92 |
| parte | 63 |
| informativas | **3** |
| % redundante | 98.1% |
<!-- /tabla:1 -->

**155 de 158 aristas repiten la posición.** Ese es el argumento de la retícula: quedan
tres que un enlace tendría que dibujar, y tres enlaces no son un grafo.

El número es tan alto en parte **porque es un resumen**: un resumen no repite las
referencias cruzadas del original, así que `uses` y `references` casi no aparecen. El
98.1% es el techo, no la cifra que puede ir a un abstract; para eso hay que medir
documentos completos.

---

## Tabla 2 — Forma del contrato

Cuán grande es lo que se dibuja: bandas de cláusula, cuántas vacías y cuántas marcas
caen en la más llena.

<!-- tabla:2 -->
| medida | Bellicum–Miltenyi (resumen) |
|---|---|
| cláusulas | 14 |
| vacías | 3 |
| enunciados | 74 |
| máx/cláusula | 11 |
<!-- /tabla:2 -->

**Envolver el carril está justificado por poco.** La cláusula más llena tiene 11
enunciados, uno más que las diez columnas de un carril: o las marcas se envuelven en
matriz o los carriles se desalinean. Con un margen de uno, cualquier documento algo más
denso lo confirma.

**Paginar no está justificado por este documento.** Con 14 cláusulas la lista entra
entera; abrir con diez filas y avanzar de diez en diez es una decisión tomada pensando
en documentos que aquí no se han medido.

*Vacía* significa sin ningún enunciado. La razón varía —*Governing Law* no impone
deberes por naturaleza, pero una cláusula operativa vacía es un fallo de extracción—,
así que el número se reporta, no se interpreta.

---

## Tabla 3 — Correlatividad y huecos

Dos cosas distintas que viven en los mismos campos de parte.

**Correlatividad**: cuántos enunciados nombran a la vez la parte que carga y otra
distinta que se beneficia. Es el par hohfeldiano —una prohibición sobre uno protege al
otro—, y la retícula lee una de las dos y descarta la otra.

**Huecos**: enunciados que la extracción no supo colocar — sin cláusula, sin parte, o
colgados del nodo «each Party» que queda en su propio componente desconectado.

<!-- tabla:3 -->
| medida | Bellicum–Miltenyi (resumen) |
|---|---|
| ambas partes | 40 |
| % | 54% |
| sin cláusula | 12 |
| sin parte | 6 |
| isla | 1 |
| enunc. en isla | 6 |
<!-- /tabla:3 -->

- **El 54% ya trae las dos partes.** Aproximadamente la mitad de los enunciados llevan
  la correlatividad escrita en los campos, sin necesidad de inferirla.
- **La isla «each Party» existe aquí**: una parte ficticia con 6 enunciados en un
  componente desconectado. Es un modo de fallo de la extracción, y es la razón de que
  el prior por cláusula tuviera que sustituir a una semilla en el nodo de parte
  ([`descartados.md`](../metricas/descartados.md)).
- **Los huecos no son despreciables**: 12 enunciados sin cláusula y 6 sin parte, sobre
  74. Eso es calidad de extracción y va en el paper como limitación con número.

---

## Qué falta

**Más documentos.** Con uno no se separa una propiedad de los contratos de una
propiedad de un fichero. Y hacen falta **contratos completos**, no solo resúmenes: el
presupuesto de aristas es justamente lo que un resumen distorsiona.

**Regenerar antes de comparar.** Los otros grafos de `infra/json/kg/` se extrajeron con
versiones distintas del extractor, así que compararlos con este mezclaría efectos del
contrato con efectos del pipeline. Hay que regenerarlos con el extractor actual antes de
que sus números signifiquen algo. Mientras tanto el script mide solo el documento de
estudio; `--all` lo abre a todos.

**Varianza de extracción.** La batería de sondas se ha corrido tres veces: 7/12, 7/12
**sobre subconjuntos distintos**, y 11/12 tras cambiar el tamaño de chunk. Tres lecturas
sueltas no son una medición; hacen falta K corridas sobre M documentos, con media y
desviación.

**Coste.** Cada grafo nuevo son llamadas al modelo.

---

*Relacionado:* [esquema del grafo](../ontologia/esquema.md) — de qué está hecho lo que
estas tablas miden.
