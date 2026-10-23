# Uso de las aristas — qué se usa y qué falta

Qué aristas del grafo usa hoy la app, cómo las usa, y cómo se usarían las que faltan
**sin cargar la vista general**. Los tipos y de dónde sale cada uno están en
[`esquema.md`](./esquema.md); el orden de las filas, en
[`../metricas/importancia-clausula.md`](../metricas/importancia-clausula.md).

Nada de lo que sigue toca la ontología ni la extracción: todo **lee** aristas que ya
existen.

> **Cambios del 23 de octubre de 2026**, tras la reunión con el asesor:
>
> - Queda una sola vista, el **Clause Analyzer** (la antigua Table v1.2). Table, Table v1.1 y
>   Table v2 se borraron, y con ellas la leyenda de Table y la barra de reparto.
> - Cada frase va **del lado de la parte a la que pertenece**: una obligación o prohibición,
>   con la parte que tiene que cumplirla; un derecho, con quien lo tiene. Ya no hay «In favour
>   of». Lo pidió el asesor.
> - Los valores de duración los usa la nueva pestaña **Deadlines**.

---

## Las aristas, en cifras

Los cuatro grafos de `infra/json/kg/`. La última sección dice cómo regenerar la tabla.

| Arista | Qué dice | SteelVault | Bellicum | Halverson | Orvane |
|---|---|---|---|---|---|
| `assigns_obligation_to` / `grants_right_to` | quién carga / quién tiene el derecho | 81 | 610 | 50 | 90 |
| `is_part_of` enunciado → cláusula | dónde está cada enunciado | 87 | 631 | 51 | 91 |
| `is_part_of` cláusula → cláusula | el árbol numerado | 14 | 100 | 8 | 0 |
| `is_part_of` condición → enunciado | «solo si…», «a menos que…», «hasta…» | 32 | 318 | 18 | 37 |
| `is_part_of` condición → cláusula | una condición de la cláusula entera | 0 | 10 | 0 | 0 |
| `is_part_of` valor → enunciado | 30 días, 1.5 %, $35 | 15 | 85 | 19 | 32 |
| `is_part_of` valor → cláusula | una cifra de la cláusula entera | 1 | 15 | 2 | 8 |
| `modifies` | un enunciado cambia otra cláusula | 8 | 101 | 6 | 14 |
| ↳ entre cláusulas distintas | lo que la app muestra | 6 | 60 | 5 | 10 |
| `depends_on` | se apoya en otra cláusula | 0 | 52 | 2 | 13 |
| `references` | «sujeto a la sección X» | 0 | 60 | 0 | 7 |
| `defines` / `uses` | términos definidos y dónde se usan | 30 | 845 | 35 | 71 |
| `supersedes` / `contradicts` | prevalece sobre otra / la contradice | 0 | 0 | 0 | 0 |

**Condiciones y valores llegan por dos caminos que dicen lo mismo**: la arista
`is_part_of` y un campo del propio nodo (`Condition.gatesId`, `Value.quantifiesId`). La
app lee el campo. En los grafos actuales los dos coinciden.

---

## Lo que ya se usa, y cómo

| Arista | Dónde | Cómo |
|---|---|---|
| `assigns_obligation_to` / `grants_right_to` | Clause Analyzer, sus pestañas y «You are»; Deadlines | Deciden en qué columna va cada frase: una obligación o prohibición, con la parte que tiene que cumplirla; un derecho, con quien lo tiene (`statement-grid.ts`). Ver «Dónde va cada frase», abajo. En Deadlines, dicen quién tiene que actuar. |
| `is_part_of` enunciado → cláusula | Clause Analyzer, Deadlines y el documento | Agrupa los enunciados en filas (`statement-grid.ts`) y los plazos por cláusula (`deadlines.ts`). Decide qué se pinta al seleccionar una cláusula: sus enunciados, solo los del tipo de la pestaña abierta (`useFocusPayload.ts`, `graph-payload.ts`). |
| `is_part_of` cláusula → cláusula | Títulos de las filas | Una subcláusula sin título hereda el de su sección (`clauseTitle`). |
| `modifies` | Clause Analyzer y documento | Ver abajo. |
| `is_part_of` condición → enunciado | Clause Analyzer, su detalle y el documento | A pedido del lector: ver abajo. Con «Mark conditional», en el detalle debajo de la fila cada frase muestra su condición («Condition: IF…»). Solo «Only firm» cambia un conteo, y porque el lector lo pide. |
| `is_part_of` valor → enunciado | Deadlines | Una duración marca un plazo como «con número». **Se deja fuera del Clause Analyzer a propósito**: ver «Valores» más abajo. |
| término definido, referencia | Pestaña del grafo | Solo se dibujan ahí. Con la leyenda de Table se fue el único otro lugar donde aparecían. |
| todas | Orden «by relevance» | El PageRank personalizado recorre todas las aristas, sin dirección y sin peso por tipo. Las aristas influyen en el orden aunque no se vean. |
| todas | Pestaña del grafo | Se dibujan todas (`kg-graph.ts`). «View in graph» muestra el subgrafo de una cláusula (`clause-subgraph.ts`). |

### Dónde va cada frase, en detalle

Desde el 23 de octubre de 2026, cada frase va en la columna de la parte a la que pertenece:

- **Obligación o prohibición**: con la parte que tiene que cumplirla (`burdenPartyId`).
- **Derecho**: con quien lo tiene (`benefitPartyId`).

En §1 Compensation de SteelVault, las 11 obligaciones de National quedan en la columna de
National y las 4 de Equidata en la de Equidata. Las columnas solo llevan el nombre de la
parte, con «(you)» si es la del lector.

Antes, entre el 15 y el 23 de octubre, cada frase iba del lado de quien favorecía
(«In favour of»): un derecho, con quien lo tiene; una obligación o prohibición, con la otra
parte. El asesor pidió volver a la parte a la que pertenece. Las funciones de esa regla
(`creditOf`, `creditedGrid` en `clause-favour.ts`) siguen en el código, sin usarse.

Lo que depende de esa posición:

- **Las pestañas** cuentan las frases de cada parte en el tipo abierto: en SteelVault,
  obligaciones 29 · 15, derechos 3 · 14 y prohibiciones 9 · 8 (National · Equidata).
- **La marca del centro** apunta a la columna con más cuadrados.
- **«Against you»**, con «You are», depende del tipo. En obligaciones y prohibiciones, una
  cláusula va en tu contra si tú tienes más; en derechos, si la otra parte tiene más. Con
  «You are National», en SteelVault: 8 de 13 en obligaciones, 6 de 8 en derechos y 1 de 8
  en prohibiciones.
- **El detalle debajo de la fila** muestra, en cada columna, las frases propias de esa
  parte («National has more obligations (11 vs 4)»).

El código está en `ClauseAnalyzerPanel.tsx`, `ClauseGrid.tsx`, `ClauseRow.tsx` y
`party-statements.tsx`.

### `modifies`, en detalle

Responde a «¿qué podría deshacer esta cláusula?».

- **En la fila** de la cláusula modificada: «modified by §11». El número va en el color del
  tipo de la frase que modifica: rojo si es una obligación, verde si es un derecho,
  naranja si es una prohibición, gris si el grafo une dos cláusulas sin una frase concreta.
  Al hacer clic, la tabla pasa a la pestaña de ese tipo y selecciona la cláusula que
  modifica.
- **En el documento**, al seleccionar la cláusula: una línea en el margen la une con las
  frases que la modifican, con una etiqueta «modified by ⓘ». El ⓘ dice qué la modifica y
  qué significa la relación. La frase que modifica se pinta en el color de su tipo, aunque
  no sea el de la pestaña: se lee «esta obligación está modificada por un derecho».
  Con Shift + rueda, los párrafos unidos se acercan.

Reglas:

- **Solo entre cláusulas distintas.** Una cláusula que se modifica a sí misma no se marca.
- **Solo la dirección «modified by».** Lo que una cláusula modifica no se muestra en su
  fila: llenaba la tabla y no responde a la pregunta.
- **Un solo paso, sin cadenas.** Unir todo lo conectado formaba bloques de hasta 17
  cláusulas en Bellicum.
- **Nunca recalcula conteos.** La arista no distingue «anula» de «limita» ni de «solo
  cita», así que se señala y se deja leer; no se resta ni se suma.

El código está en `graph-payload.ts` (`clauseModifications`, `clauseModifiedBy`,
`modifiesPartners`), `ClauseRow.tsx` y `EvidenceBridgeOverlay.tsx`.

### Condiciones, en detalle

Responde a «¿cuánto de esto vale siempre?». Un enunciado es **firme** si
ninguna condición lo condiciona (ninguna lo tiene como `gatesId`), y **condicional** si al
menos una lo hace.

En el Clause Analyzer, junto a las pestañas, el lector elige entre tres modos, como elige el tipo:

| Modo | Cuadrados | Documento, al seleccionar | Tarjeta del cuadrado |
|---|---|---|---|
| **All** (por defecto) | Todos llenos, como siempre | Solo el color del tipo | Como siempre |
| **Mark conditional** | Los condicionales, solo con borde; aparece la leyenda «firm / conditional» | La condición en rosa dentro de su frase; si está escrita en otro párrafo, la línea del margen lo une con una etiqueta «only if ⓘ», «unless ⓘ» | Debajo de la cita, «Only if…», «Unless…», «Until…» |
| **Only firm** | Solo los firmes; las cifras de las pestañas se recalculan con ellos y desaparecen las filas que se quedan vacías | Solo los enunciados firmes | Como siempre |

Reglas:

- **«All» es la vista de siempre.** Las condiciones solo aparecen, en cualquier lugar, si el
  lector las pide. Así no hay «una cosa más que leer» para quien no las busca.
- **«Only firm» es un filtro a la vista, no un peso.** Funciona como las pestañas de tipo:
  lo decide quien lee y siempre puede volver a «All». Las dos cifras son correctas: una
  cuenta todo, la otra solo lo que vale siempre.
- **El orden por relevancia no cambia** en ningún modo, y el modo se mantiene al cambiar de
  pestaña.
- **La condición se lee en su frase.** Casi siempre está en el mismo párrafo que su
  enunciado; solo cuando está escrita aparte se une con la línea.
- **No se filtran condiciones «dudosas».** Una regla de palabras clave («if», «upon»,
  «unless»…) no sirve para separarlas: muchas condiciones reales son implícitas («$35.00
  per returned item» solo se cobra si hay un cheque devuelto) o usan otras palabras («in
  the case of», «without», «as long as»).

El código está en `graph-payload.ts` (`paintStatement`, `conditionsElsewhere`),
`MarkTooltip.tsx`, `Mark.tsx`, `table-bits.tsx` (`ConditionModePicker`, `FirmKey`,
`ConditionTag`) y `statement-grid.ts` (`withoutMarks`).

### Lo que se dejó de hacer

- La línea del documento **ya no une párrafos que solo coinciden** en tener enunciados
  del par. Sugería una relación que no existe. Ahora solo aparece por `modifies`.
- **Nada se pinta hasta que se selecciona una cláusula**: ni los «10 más relevantes» de
  cada parte ni los nombres de las partes. Las columnas ya dicen de qué lado está cada cosa.

---

## Lo que falta, y cómo usarlo sin cargar la vista

### Reglas para no cargar la vista

1. **Nada recalcula conteos ni introduce pesos.** Lo nuevo se señala; las cifras de las
   pestañas y los cuadrados siguen contando lo mismo.
2. **Cada cosa en su lugar.** La tabla muestra lo que se entiende de un vistazo. El
   documento muestra lo que se lee al seleccionar una cláusula. El detalle se abre debajo
   de la fila. Lo que no cabe en la fila va al documento o al detalle.
3. **En el documento, nada sin selección.**
4. **Sin destino visible, no se muestra en la tabla.** Una condición o una cifra de la
   cláusula entera no tiene cuadrado al que pegarse: va al detalle o se deja fuera.
5. **Un paso cada vez**, revisado en SteelVault y en un contrato sintético antes del
   siguiente.
6. **Lo derivado va aparte.** Lo que salga de una heurística o de un modelo no entra al
   grafo (la ontología está congelada): se guarda en otro fichero y se valida a ciegas
   contra un ground truth.
7. **Lo nuevo empieza apagado.** La vista por defecto no cambia; lo que se agrega aparece
   cuando el lector lo pide, como «Mark conditional».
8. **En la vista general entra lo que dice de quién es cada cosa.** Lo que solo precisa el
   cómo (cifras, plazos) queda para el detalle o para la pestaña Deadlines.

### Lo que queda de las condiciones

Entre un tercio y la mitad de los enunciados entre las dos partes dependen de una
condición (en SteelVault, 29 de 84; en Bellicum, 275 de 616). Lo que ya está hecho se
describe arriba; queda:

- **Quién activa la condición**: si el disparador nombra a una parte («UPON Marketing
  Affiliate's default…»), es un derecho que la otra gana si esa parte falla. Es heurística
  sobre el texto: va aparte y se valida.
- **Una marca «not a condition»** para que quien lee corrija las condiciones mal
  extraídas. Las respuestas irían formando un ground truth.

**Qué no hacer:** marcar en la fila cuántas condiciones tiene cada cláusula. Repetiría lo
que ya dicen los cuadrados con borde.

### Valores — `is_part_of` valor → enunciado: fuera del Clause Analyzer, dentro de Deadlines

**Decisión:** el Clause Analyzer no usa los valores. La pestaña Deadlines usa las duraciones.

**Por qué no en el Clause Analyzer:** un valor no dice de quién es una frase ni a quién
favorece una cláusula; dice cuánto o en qué plazo. «National paga cada factura en
**30 días**» es una obligación de National con 30 días o con 60. Es información para
después, y para eso ya está la cita del contrato en la tarjeta, en el documento y en el
detalle debajo de la fila.

Usarlos para decir *cuánto* favorece algo (un plazo de 10 días frente a uno de 60, un
recargo de 1.5 % frente a uno de 5 %) sería comparar magnitudes, es decir, volver a los
pesos. Por eso tampoco se compararán plazos entre las partes.

Si alguna vez hacen falta en el detalle, son fáciles de comprobar: cada cifra se lee en la
cita de su frase.

**Deadlines** (desde el 23 de octubre de 2026) responde a «¿qué tengo que hacer, y para
cuándo?». No usa aristas nuevas:

- Lee dos campos que la extracción ya guarda en cada enunciado: `deadline` («30 days from
  the invoice date», «promptly») y `frequency` («bi-monthly», «during the term»). En
  SteelVault, 25 de 90 enunciados tienen uno de los dos; en Bellicum, 179 de 631.
- Un plazo es **«con número»** si el enunciado tiene un valor de tipo `Duration`
  (`quantifiesId`, la misma relación que `is_part_of` valor → enunciado) o si su texto
  trae un número con unidad de tiempo («thirty (30) days»).
- Si no, una regla de palabras separa los plazos **vagos** («promptly», «immediately»,
  «in advance») de los que esperan **un hecho** («upon termination»).
- Agrupa por cláusula, y al final pone lo que se repite y lo que dura todo el contrato.
  Cada línea dice quién actúa: la parte obligada o quien tiene el derecho.
- No compara plazos entre las partes ni los suma: solo los lista.

El código está en `deadlines.ts` y `DeadlinesPanel.tsx`. El grafo no guarda fechas de
calendario, así que todo es relativo: «30 días desde la factura».
### `depends_on` y `references`

Solo pesan en contratos grandes: SteelVault no tiene ninguna.

- **Documento, al seleccionar**: la misma línea que `modifies`, con su propia etiqueta
  («depends on», «refers to»). **No en las filas**, para no volver a llenar la tabla.
- **Cláusulas eje**: una cláusula de la que dependen muchas es una palanca. En Bellicum,
  §3.2 Change Control recibe 15. Iría como una marca pequeña en la fila **solo** por encima
  de un umbral, para que se vean pocas.
- **Antes, comprobar cuánto aportan**: en Orvane, varias `depends_on` repiten las mismas
  parejas que `modifies`.

### `defines` / `uses`

- **Glosario en el documento**: al pasar el ratón por un término definido, su definición.
  Es lo que más ayuda a quien lee un contrato por primera vez.
- **Definiciones palanca**, en el detalle debajo de la fila: el término que más enunciados
  usan. En Bellicum, «Miltenyi Product» aparece en 25. No en la vista general.

### Lo que queda de `modifies`

- **El verdadero objetivo de negociación**: si una cláusula está «modified by» un derecho
  de la otra parte, lo que hay que negociar es la que modifica. Iría en el tooltip de
  «modified by», no como otra marca.
- **Quién cambia las reglas**: cuántas modificaciones hace cada parte. En SteelVault,
  Equidata 5 y National 1. Iría en una línea del resumen del contrato, no en las filas.
- **«Trae su propia excepción»**: las que se modifican a sí mismas (2 en SteelVault, 41 en
  Bellicum). Hoy se ocultan; si se muestran, solo en el detalle.

### `supersedes` y `contradicts`

No aparecen en ninguno de los cuatro grafos. No hay nada que mostrar.

### La idea grande: «si no cumples…»

Mi obligación → condición que nombra mi incumplimiento → derecho de la otra parte: «si National no paga (§1), Equidata puede rescindir sin aviso (§7.2)». Cruza
condiciones y partes, y es lo que mejor explicaría el contrato a un ciudadano.
Pero el enlace entre el incumplimiento y la obligación **no está en el grafo**: hay que
derivarlo, guardarlo aparte y validarlo contra un ground truth de esas cadenas. Ahí tendría
sentido comparar una regla simple, LegalBERT y el modelo de extracción.

### Orden propuesto

Hecho: cada frase con su dueño, `modifies` («modified by»), condiciones (All / Mark
conditional / Only firm) y Deadlines. Valores: fuera del Clause Analyzer; las duraciones,
en Deadlines.

1. Lo que queda de `modifies`: el verdadero objetivo de negociación y quién cambia las
   reglas.
2. Glosario.
3. `depends_on` y `references`, al probar contratos grandes.
4. Quién activa la condición, y la marca «not a condition».
5. «Si no cumples…», con su ground truth.

---

## Cómo regenerar las cifras

Desde la raíz del repositorio:

```python
import json, glob, collections

for path in sorted(glob.glob('infra/json/kg/*.json')):
    kg = json.load(open(path))
    kg = kg.get('knowledgeGraph', kg)
    kind = {}
    for k in ['parties', 'clauses', 'obligations', 'rights', 'prohibitions',
              'conditions', 'values', 'definedTerms', 'references']:
        for node in kg[k]:
            kind[node['id']] = k
    statement_clause = {n['id']: n.get('clauseId')
                        for k in ['obligations', 'rights', 'prohibitions'] for n in kg[k]}
    counts = collections.Counter(
        f"{e['type']}: {kind.get(e['source'], '?')} -> {kind.get(e['target'], '?')}"
        for e in kg['edges'])
    cross = sum(1 for e in kg['edges'] if e['type'] == 'modifies'
                and statement_clause.get(e['source'], e['source']) != e['target'])
    print(path)
    for key, n in sorted(counts.items()):
        print(f'  {n:5d}  {key}')
    print(f'  {cross:5d}  modifies entre cláusulas distintas')
```

Las filas de la tabla agrupan esas líneas. Por ejemplo, «`is_part_of` enunciado → cláusula»
es la suma de `obligations`, `rights` y `prohibitions` → `clauses`.

Las demás cifras del texto (cuántos enunciados llevan condición, quién modifica a quién, el
bloque mayor al unir por `modifies`, las cláusulas eje y el término más usado) salen de:

```python
import json, glob, collections

for path in sorted(glob.glob('infra/json/kg/*.json')):
    kg = json.load(open(path))
    kg = kg.get('knowledgeGraph', kg)
    pair = [p['id'] for p in kg['parties'][:2]]
    name = {p['id']: p['name'] for p in kg['parties']}
    statements = {n['id']: (k, n) for k in ['obligations', 'rights', 'prohibitions'] for n in kg[k]}
    ref = {c['id']: c.get('ref') for c in kg['clauses']}
    print(path)

    # Share of the pair's statements that carry a condition.
    gated = {c['gatesId'] for c in kg['conditions'] if c.get('gatesId')}
    for k in ['obligations', 'rights', 'prohibitions']:
        ids = [n['id'] for n in kg[k]
               if n.get('burdenPartyId') in pair or n.get('benefitPartyId') in pair]
        print(f'  {k} con condición: {sum(i in gated for i in ids)} de {len(ids)}')

    # modifies: on itself, and between clauses by the party whose statement modifies.
    by_party, on_itself = collections.Counter(), 0
    links = []
    for e in kg['edges']:
        if e['type'] != 'modifies':
            continue
        kind, node = statements.get(e['source'], (None, None))
        home = node.get('clauseId') if node else e['source']
        if home == e['target']:
            on_itself += 1
            continue
        links.append((home, e['target']))
        if node:
            who = node.get('benefitPartyId') if kind == 'rights' else node.get('burdenPartyId')
            by_party[name.get(who, 'nadie')] += 1
    print(f'  modifies sobre sí misma: {on_itself}; entre cláusulas, por parte: {dict(by_party)}')

    # Largest block if every clause linked by modifies were merged.
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a, b in links:
        parent[find(a)] = find(b)
    blocks = collections.Counter(find(x) for x in list(parent))
    print(f'  bloque mayor al unir por modifies: {max(blocks.values(), default=0)} cláusulas')

    # Clauses others lean on, and the defined term most used.
    hubs = collections.Counter(e['target'] for e in kg['edges']
                               if e['type'] in ('depends_on', 'references'))
    print(f'  ejes: {[(ref.get(t), n) for t, n in hubs.most_common(3)]}')
    terms = {t['id']: t['term'] for t in kg['definedTerms']}
    uses = collections.Counter(e['target'] for e in kg['edges']
                               if e['type'] == 'uses' and e['source'] in statements)
    print(f'  término más usado por enunciados: {[(terms.get(t), n) for t, n in uses.most_common(1)]}')
```

Las de condiciones cuentan solo los enunciados donde una de las dos partes del par carga o
se beneficia. El par es el de las dos primeras partes del grafo.
