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

Son dos caras del mismo hecho: un deber de A es una pretensión de B. En el documento de
estudio, **el 54% de los enunciados nombran las dos**
([medidas](../medidas/corpus.md)).

### Qué no sabe expresar

`burdenPartyId` es un puntero a **un** nodo `Party`. De ahí salen dos límites que se
notan en los datos:

**Lo bilateral.** Una cláusula recíproca no obliga a una parte, obliga a las dos. La
extracción lo resuelve inventando una tercera parte llamada *«each Party»* — que queda
en un componente desconectado del grafo, porque no toca a ninguna de las dos reales.

**Lo condicionado a un rol.** *«La parte que incumpla debe presentar un plan
correctivo»* no nombra a nadie: el obligado depende de un hecho futuro. El campo se
queda nulo y se lee igual que un fallo de extracción.

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

`DefinedTerm.definedInClauseId`, en cambio, viene nulo en los 22 términos: la extracción
no lo rellena nunca.

---

## Volumen observado

Documento de estudio, el resumen del contrato Bellicum–Miltenyi:

| Partes | Cláusulas | Enunciados | Condiciones | Valores | Términos |
|---|---|---|---|---|---|
| 3 | 14 | 74 | 11 | 14 | 22 |

Tres partes para un contrato bilateral: la tercera es el nodo «each Party» de las
cláusulas recíprocas. El desglose completo está en las
[medidas del documento](../medidas/corpus.md).
