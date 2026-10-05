# Esquema del grafo — qué se extrae de un contrato

La base sobre la que se apoyan las métricas y la vista: cualquier cambio aquí se propaga
a todo lo demás. En el código: `server/schemas/knowledge.py` (tipos y campos),
`server/services/graph/knowledge/ontology.py` (lo que se le da al modelo al extraer) y
`web/src/types/knowledge.ts` (el espejo del frontend).

---

## Los nueve tipos de nodo

| Tipo | Qué es | Campos que lo distinguen |
|---|---|---|
| `Party` | una parte del contrato | `name`, `role`, `aliases` |
| `Clause` | una cláusula o sección | `ref` (`"Section 3.2"`, o nulo si no va numerada), `heading`, `level` |
| `Obligation` | un deber que el obligado **debe** cumplir | `burdenPartyId`, `benefitPartyId`, `deadline`, `frequency` |
| `Right` | una facultad que su titular **tiene** | igual que arriba |
| `Prohibition` | una restricción que el obligado **no debe** incumplir | igual que arriba |
| `Condition` | un requisito previo | `trigger`, `operator` (`IF`/`UNLESS`/`UNTIL`/`UPON`), `gatesId` |
| `Value` | una cifra | `valueType`, `amount`, `unit`, `quantifiesId` |
| `DefinedTerm` | un término con definición propia | `term`, `definition`, `definedInClauseId` |
| `Reference` | una cita externa (`ISO 27001`, `GDPR`) | `name`, `citation`, `citedById` |

Los tres del medio — obligación, derecho y prohibición — son los **enunciados
deónticos**: lo que el contrato afirma. El resto los describe.

**Las declaraciones y garantías no tienen tipo propio, y la ontología no se amplía.** Se
extraen como `Obligation` de quien garantiza, frente a la otra parte: quien declara que
algo es cierto responde si no lo es. Dejarlas fuera perdía la asimetría que más pesa en
SteelVault —el Affiliate garantiza tres cosas, Equidata una, y §11 anula esa una— y el
vínculo con la indemnización de §9, que se dispara por *«breach of any warranties»*.

### Todo nodo lleva su procedencia

Cada uno guarda `paragraphIds`, y los enunciados además `text` con el fragmento literal
del que salieron: sin procedencia no hay evidencia que enseñar. Llevan también
`evidenceVerified` y `evidenceSpans`, que escribe una pasada posterior — el modelo elide
fragmentos aunque se le pida literalidad, así que se comprueba en vez de confiar.

---

## Las dos partes de un enunciado

`burdenPartyId` y `benefitPartyId` son la pieza más cargada del esquema:

- **quién carga** — el obligado de un deber, el restringido de una prohibición;
- **quién se beneficia** — el titular de un derecho, o el destinatario del deber ajeno.

Son dos caras del mismo hecho: un deber de A es una pretensión de B. No todos los
enunciados nombran las dos: cuando el texto no dice a quién se debe algo, el campo
queda nulo.

### Qué no sabe expresar

`burdenPartyId` es un puntero a **un** nodo `Party`. De ahí salen dos límites que se
notan en los datos:

**Lo bilateral.** Una cláusula recíproca no obliga a una parte, obliga a las dos. Se
emite un enunciado por parte, con el mismo texto y la otra como beneficiaria. La
extracción antigua lo resolvía inventando una tercera parte, *«each Party»*, que quedaba
en un componente desconectado del grafo; ya no puede, porque las partes las fija una
lectura previa del contrato y cada bloque solo elige entre ellas (ver *De dónde salen los
ids*). Los roles que las partes juegan por turnos —*Receiving Party*, *Indemnified
Party*— se listan con quién los juega, y un enunciado de ese rol sale una vez por parte.

**Lo condicionado a un rol.** *«La parte que incumpla debe presentar un plan
correctivo»* no nombra a nadie: el obligado depende de un hecho futuro. El campo se
queda nulo y se lee igual que un fallo de extracción.

**Lo que firma alguien que no es parte.** El avalista personal de SteelVault (§1, *«the
undersigned principal, partner or owner»*) responde con su patrimonio de la deuda del
Affiliate, pero el contrato no lo nombra como parte. Se decidió dejarlo nulo, como
cualquier rol sin resolver: un nodo `Party` para él sería la única parte que no firma
como entidad contratante.

---

## Los tipos de arista

Se separan por **cómo se obtienen**, que determina cuánto fiarse de ellas.

### Derivadas — de campos, no del modelo

| Tipo | De dónde sale |
|---|---|
| `is_part_of` | `clauseId` de un enunciado |
| `assigns_obligation_to` | `burdenPartyId` de una obligación o prohibición |
| `grants_right_to` | `benefitPartyId` de un derecho |
| `defines` | `definedInClauseId` de un término |
| `is_part_of` entre cláusulas | el árbol numerado del fichero de párrafos |

Son deterministas. Y son también las que la retícula **no dibuja**: la fila ya dice la
cláusula y el carril ya dice la parte, así que trazarlas sería repetir la posición.

### Extraídas — las pide el modelo

| Tipo | Qué afirma |
|---|---|
| `uses` | invoca un término definido |
| `references` | menciona otra cláusula de forma neutra |
| `depends_on` | su aplicabilidad está supeditada a otra cláusula |
| `supersedes` | prevalece sobre otra en caso de conflicto |
| `modifies` | cambia lo que otra significa, o si se aplica |

El destino de cada una es un id que ya existe —una cláusula, o un término para `uses`—:
el esquema de la respuesta no admite otro. Antes era el texto de la referencia, que se
emparejaba después con una cláusula por su número, y una referencia a *«Section 2»*
podía caer en el considerando 2.

Estas son las informativas, y son las que el modelo apenas produce: en el documento de
estudio suman **3**, y **`modifies` y `supersedes` salieron 0 en tres corridas
independientes** — describir una relación en la guía no basta para que el modelo la
emita.

---

## Campos que no son aristas

`Condition.gatesId`, `Value.quantifiesId`, `Reference.citedById` y
`DefinedTerm.definedInClauseId` son **punteros en campos**, no entradas en `edges`.

Cualquier cosa que recorra `kg.edges` es ciega a ellos, y ahí vive parte de la estructura
interesante: 10 de las 11 condiciones apuntan a un enunciado concreto, y **7 de esas 10
cierran un derecho, no una obligación** — lo que se condiciona son los permisos.

`DefinedTerm.definedInClauseId` venía nulo en los 22 términos de la extracción antigua.
Ahora no lo pide al modelo: es la cláusula del párrafo donde está la definición literal.

---

## Volumen observado

Documento de estudio, el resumen del contrato Bellicum–Miltenyi:

| Partes | Cláusulas | Enunciados | Condiciones | Valores | Términos |
|---|---|---|---|---|---|
| 3 | 14 | 74 | 11 | 14 | 22 |

Tres partes para un contrato bilateral: la tercera es el nodo «each Party» de las
cláusulas recíprocas.

---

## De dónde salen los ids

Partes, cláusulas y términos existen **antes** de extraer ningún enunciado. Antes cada
trozo del contrato inventaba los suyos y luego se fusionaban comparando nombres y números;
así fue como §1 *Compensation* absorbió el considerando 1 de SteelVault.

| Nodo | De dónde sale | Lo que no puede expresar |
|---|---|---|
| `Clause` | el árbol que `build_clause_tree` lee de la numeración | una cláusula sin número —*Permission* en SteelVault— queda fuera, y sus enunciados sin cláusula |
| `Party` | una lectura del contrato entero: solo quien firma o por quien se firma | terceros mencionados, roles, colectivos y personas que el contrato no nombra como parte |
| `DefinedTerm` | la misma lectura; la definición, literal | — |

El título de una cláusula lo propone esa lectura y **solo se acepta si la cláusula
empieza por él**: el modelo lo nombra, el texto decide.

### Lo que no se extrae, aunque el texto diga *may* o *shall*

- **Los considerandos.** Cuentan por qué existe el contrato, no qué debe o puede hacer
  nadie; los deberes y derechos que anuncian los repiten las cláusulas operativas. En la
  primera corrida del pipeline nuevo el modelo sacó tres «derechos» de los considerandos
  de SteelVault.
- **Una mención al contrato entero** —*«subject to the terms and conditions of this
  Agreement»*— no es una relación: no apunta a ninguna cláusula, y como el esquema obliga
  a elegir un id, el modelo la colgaba de la que tuviera más cerca.
- **La misma disposición en dos listas.** Una disposición es un deber, un derecho o una
  prohibición, no varios: repetida bajo otro tipo cuenta dos veces lo que el contrato
  dice una. Una frase que dice dos cosas distintas —un derecho y quién paga su coste— sí
  son dos enunciados.

El árbol depende de que la numeración sea limpia. En Bellicum se cortaba en 9.4: el
artículo 10 no tiene encabezado propio y una lista *«2) …»* justo antes parecía una
numeración que retrocede. El constructor ya no toma un *«2)»* por un título. El árbol
guardado de cada contrato se regenera solo cada vez que se abre el documento en la app, y
[`clause_tree_check.ipynb`](../../notebooks/KG/clause_tree_check.ipynb) avisa de los que aún
no se han regenerado.

---

## El *abstract* — una capa encima, no dentro

Se le llama **abstract** y no «resumen» a propósito: en este proyecto *el resumen* es el
documento fuente —el contrato Bellicum–Miltenyi que ya viene resumido—, y confundir los
dos nombres arruina cualquier frase sobre qué se midió sobre qué.

`infra/json/abstract.json` guarda el abstract en prosa de cada contrato, indexado por
`documentId`. **No es parte del KG** y no se genera con él: el grafo lo construye el
notebook offline, mientras que el abstract se pide desde la UI, cuando alguien pulsa el
botón, y se cachea en ese archivo para no volver a pagarlo.

Un archivo único para todo el corpus, a diferencia de los KGs, que van uno por documento.
Un abstract ocupa unas líneas: separarlos costaría más de lo que ahorra, y en un solo mapa
se leen y se diffean todos a la vez.

### Las partes no se vuelven a extraer

El prompt **recibe las partes del grafo** —id, nombre, rol y alias— y solo puede elegir
entre ellas. El modelo devuelve `partyId` y una línea de qué hace esa parte; el nombre y
el rol se rellenan desde el nodo del KG, nunca desde lo que escriba el modelo.

La razón es que la alternativa ya se sabe cómo termina: dos listas de partes que divergen
en ortografía, en número y en rol, y ninguna forma de decidir cuál manda. Aquí el KG manda
por construcción.

Eso deja dos desviaciones visibles, y ambas son señal:

| Qué pasa | Qué significa |
|---|---|
| el modelo **no elige** una parte del grafo | ese nodo probablemente no es una entidad contratante — es el caso de «each Party» |
| el modelo **nombra una parte que no está** (`partyId: null`) | la extracción del KG se dejó una entidad fuera |

La primera es una comprobación independiente de las partes del grafo: un nodo que el
abstract ignora es un candidato a fusionar o a descartar. Ya no hay otra pasada que lo
sugiera: la que proponía fusiones (`party_hints`) se retiró porque, desde que las partes las
fija una lectura del contrato entero, no salen roles ni colectivos que fusionar.

### Las menciones van marcadas

Dentro de `summary`, cada mención de una parte se escribe `{{partyId|texto corto}}` — el
id da el color en la UI y el texto corto es cómo debe leerse en la frase. El cliente no
busca nombres en la prosa: los recibe delimitados.

Un `partyId` que el grafo no tenga se degrada a texto plano: pierde el color, nunca la
frase. El recorte por longitud opera sobre segmentos enteros, así que tampoco puede partir
una mención por la mitad.
