# Esquema del grafo de conocimiento

Qué se extrae de un contrato y con qué forma. Es la base sobre la que se apoyan las
métricas y la vista, así que cualquier cambio aquí se propaga a todo lo demás.

Fuente de verdad en el código:

- `server/schemas/knowledge.py` — los tipos y sus campos.
- `server/services/graph/knowledge/ontology.py` — las definiciones que se le dan al
  modelo durante la extracción.
- `web/src/types/knowledge.ts` — el espejo en el frontend.

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

Cada uno guarda `paragraphIds`, y los enunciados además `text` con el fragmento
literal del que salieron. Sobre eso se apoya el resaltado en el documento: sin
procedencia no hay evidencia que enseñar.

Los enunciados llevan también `evidenceVerified` y `evidenceSpans`, que escribe la
pasada de verificación posterior a la extracción — el modelo elide fragmentos aunque
se le pida literalidad, así que se comprueba en vez de confiar.

---

## Las dos partes de un enunciado

`burdenPartyId` y `benefitPartyId` son la pieza más cargada del esquema:

- **quién carga** — el obligado de un deber, el restringido de una prohibición;
- **quién se beneficia** — el titular de un derecho, o el destinatario del deber ajeno.

Son dos caras de un mismo hecho: un deber de A es una pretensión de B. En los tres
contratos medidos, **entre el 43% y el 54% de los enunciados nombran las dos**
(ver [medidas del corpus](../medidas/corpus.md)).

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

Se separan por **cómo se obtienen**, que es lo que determina cuánto fiarse de ellas.

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

Estas sí son las informativas, y su rendimiento es desigual. En el contrato completo
suman 243; en el resumen, 3. **`modifies` y `supersedes` salieron 0 en tres corridas
independientes**: describir una relación en la guía no basta para que el modelo la
emita.

---

## Un detalle que importa: campos que no son aristas

`Condition.gatesId`, `Value.quantifiesId`, `Reference.citedById` y
`DefinedTerm.definedInClauseId` son **punteros en campos**, no entradas en `edges`.

Cualquier cosa que recorra `kg.edges` es ciega a ellos. Y es donde vive parte de la
estructura interesante: en el contrato de referencia, 10 de las 11 condiciones apuntan
a un enunciado concreto, y **7 de esas 10 cierran un derecho, no una obligación** — en
ese contrato lo que se condiciona son los permisos.

En cambio `DefinedTerm.definedInClauseId` viene nulo en los 22 términos del resumen:
la extracción no lo rellena nunca.

---

## Volumen observado

| Contrato | Partes | Cláusulas | Enunciados | Condiciones | Valores | Términos |
|---|---|---|---|---|---|---|
| BELLICUM–MILTENYI (resumen) | 3 | 14 | 74 | 11 | 14 | 22 |
| BELLICUM (completo) | 5 | 142 | 372 | 71 | 51 | 111 |
| SteelVault Affiliate | 2 | 26 | 76 | 0 | 0 | 0 |

SteelVault sale con cero condiciones, cero valores y cero términos definidos. O el
contrato no los tiene, o la extracción falló con él — hoy no sabemos distinguirlo, y
eso es exactamente lo que las [medidas del corpus](../medidas/corpus.md) tienen que
resolver con más documentos.
