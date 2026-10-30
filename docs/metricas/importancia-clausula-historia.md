# Importancia de la cláusula — cómo llegamos al método actual

El método actual está en [`importancia-clausula.md`](./importancia-clausula.md). Este documento
guarda los que vinieron antes y las variantes que se probaron y se descartaron, con el
motivo de cada decisión, para no volver a probarlas sin saberlo.

Las cifras de los apartados 2 y 3 las regenera
[`notebooks/verify_clause_importance.ipynb`](../../notebooks/verify_clause_importance.ipynb)
(secciones 2, 3 y 6) sobre los grafos actuales de `infra/json/kg/`. Las del apartado 1 se
midieron sobre un grafo resumen de Bellicum que ya no existe, y **no se pueden reproducir**.

En todo el documento, ρ es la correlación de Spearman entre el orden de las filas y su número
de enunciados: cerca de 1, el orden solo cuenta enunciados; cerca de 0, el tamaño no lo decide.

---

## 0. La idea de partida

**Para qué se ordena.** La tabla muestra las cláusulas de más a menos relevante para ayudar
al lector a inspeccionar el contrato: le dice por dónde empezar. No es un veredicto. El lector
puede no estar de acuerdo con el orden, y para poder hacerlo tiene que ver **por qué** cada fila
está donde está.

**De dónde salió la idea.** De la vista circular de GraphQAG (Li et al., arXiv, julio de 2026):

- El anillo exterior tiene un sector por párrafo, en el orden del documento, y entre todos
  completan el círculo.
- El ancho de cada sector es «the total importance weight of the graph facts linked to that
  paragraph»: la suma de los pesos de las relaciones unidas a ese párrafo.
- Dentro del círculo, las entidades se acercan al centro cuanto mayor es su PageRank, el
  calculado con el prior por párrafos. Las que comparten varios párrafos van en la zona
  interior; las de un solo párrafo, en la exterior.

El paper no ordena los párrafos, pero sí les da una relevancia: el ancho del sector. Tampoco
define cómo se calcula el peso de cada relación; solo lo nombra, $w(f)$.

El método anterior (apartado 2) trasladaba esa idea a la tabla: la relevancia de una cláusula
era la suma del PageRank de sus enunciados, como el sector suma los pesos de su párrafo. En el
círculo, que un párrafo con más contenido ocupe más es correcto, porque el círculo muestra cómo
se reparte el conocimiento del documento. Usado como **orden de filas**, en cambio, esa suma
sigue casi exactamente al tamaño (ρ = 0.92 en Bellicum y 0.83 en SteelVault). Ese es el
recorrido que lleva al método actual.

---

## 1. Primer intento: un paseo sembrado en el nodo de la parte

El paseo arrancaba en el nodo de una parte y la importancia de cada cláusula era la masa que
retenían sus enunciados.

Se descartó por dos motivos, medidos sobre el grafo resumen de Bellicum
(`root_BELLICUM_MILTENYI_Supply_Agreement_Summary.json`):

- **Ordenaba por tamaño:** ρ = 0.882.
- **Dejaba cuatro cláusulas en cero exacto:** las que el paseo no alcanzaba desde la parte.

## 2. El método anterior: un solo paseo con el prior de GraphQAG

Estuvo en uso hasta el 30 de octubre de 2026. Adaptaba la identificación de entidades clave
de GraphQAG (Li et al., IEEE TVCG, 2026, §IV-A), cambiando el párrafo por la cláusula.

**Prior.** Un solo paseo para todo el documento: la masa se reparte a partes iguales entre las
cláusulas y, dentro de cada una, entre sus enunciados.

$$\pi(v_i)=\frac{1}{|C|\cdot|V_c|}\qquad v_i\in V_c$$

**PPR:**

$$PR_i^{(t+1)}=\bigl(1-d+dD^{(t)}\bigr)\,\pi_i+d\sum_{j\in\mathcal{N}_i}\frac{PR_j^{(t)}}{\deg(v_j)}$$

**Importancia.** Lo que retienen los enunciados de la cláusula:

$$I(c)=\sum_{v_i\in V_c}PR_i$$

Detalles:

- El paseo recorría **el grafo entero**: partes, cláusulas, enunciados, términos definidos,
  condiciones, referencias y valores, sin dirección y sin pesos.
- El prior solo contaba los enunciados de la tabla: los de las columnas de las dos partes.
  El paseo, en cambio, recorría todo.
- $d = 0.85$; paraba cuando dos rondas diferían menos de $10^{-9}$.
- Daba un solo orden, el mismo para las tres pestañas.

**Lo que arregló frente al primer intento**, según el grafo resumen de Bellicum (no
reproducible):

- **Ninguna cláusula podía valer cero**, porque todas recibían masa del prior.
- **Bajó el sesgo por tamaño** de ρ = 0.882 a ρ = 0.400.

### Por qué se sustituyó

Medido sobre los grafos actuales, el sesgo por tamaño seguía ahí:

| contrato | ρ con el tamaño |
|---|---|
| Bellicum | 0.92 |
| Santander | 0.85 |
| SteelVault | 0.83 |
| HalversonCorvin | 0.89 |
| OrvaneTalvera | 0.59 |
| lease 10 | 0.82 |
| lease 166 | 0.81 |
| lease 201 | 0.89 |

El prior sí daba a cada fila exactamente la misma masa. El sesgo entraba **después**, al
propagar y al sumar, por dos vías:

1. **Las partes.** Cada enunciado está unido a su parte, y la parte reparte lo que recibe entre
   todos sus enunciados, así que una fila con más enunciados recibe más. En SteelVault los dos
   nodos de parte se quedaban el 15.5 % de toda la masa. *Compensation*, la cláusula con más
   enunciados, quedaba 1.ª, y el 78 % de su valor le llegaba de otras cláusulas a través de
   las partes, no por conexiones reales.
2. **La masa propia.** Con un solo paseo no se puede separar la masa que una cláusula se da a
   sí misma de la que le llega de las demás. Esa masa propia depende de cuántos enunciados
   tiene la cláusula, no del resto del contrato.

El módulo sigue calculando este paseo, porque la pestaña del grafo lo usa para dibujar
(`byNode`). Ya no ordena las filas.

## 3. Lo que se probó entre el 29 y el 30 de octubre de 2026

### 3.1 Prior por partes

**La idea.** Un paseo por cada parte $a \in \mathrm{Pa}$, sobre el grafo entero, sembrado solo
en sus celdas de la tabla. Con «You are» se ordenaría por $I_a$; sin parte elegida, por el
promedio de las partes.

$$\pi_a(v_i)=\frac{1}{|C_a|\cdot|V_{c,a}|}\qquad v_i\in V_{c,a}$$

$$I_a(c)=\sum_{v_i\in V_c}PR_a(v_i)$$

- $V_{c,a}$: la celda $(c, a)$, los enunciados de la cláusula $c$ que pertenecen a la parte $a$.
- $C_a$: las cláusulas donde la columna de $a$ no está vacía.

Por linealidad, el promedio de los $I_a$ es lo mismo que un solo paseo con el prior repartido
primero entre partes, después entre celdas y por último entre enunciados.

**Resultados:**

| contrato | ρ del promedio con el tamaño | ρ de $I_a$ con su celda | ρ entre las dos partes |
|---|---|---|---|
| Bellicum | 0.91 | 0.89 – 0.90 | 0.79 |
| Santander | 0.87 | 0.90 – 0.93 | 0.00 |
| SteelVault | 0.85 | 0.86 – 0.93 | 0.56 |
| HalversonCorvin | 0.60 | 0.39 – 0.95 | (3 partes) |
| OrvaneTalvera | 0.82 | 0.82 – 0.87 | −0.20 |
| lease 10 | 0.82 | 0.83 – 0.94 | 0.46 |
| lease 166 | 0.95 | 0.90 – 0.96 | 0.39 |
| lease 201 | 0.89 | 0.87 – 0.93 | 0.93 |

**Por qué se descartó:**

- **El promedio tiene el mismo sesgo que el método anterior** (0.60 a 0.95).
- **$I_a$ es casi contar los cuadrados de $a$ en la fila** (ρ entre 0.82 y 0.96 en los
  contratos de dos partes), algo que el lector ya ve en la tabla.
- **Una parte menor distorsiona el promedio.** HalversonCorvin tiene una tercera parte con un
  solo enunciado, que recibía un tercio de toda la masa. Su ρ más bajo (0.60) se debe a eso,
  no a un orden mejor.
- **No resuelve el caso de pocas cláusulas**, porque $|C_a| \le |C|$: hay todavía menos
  unidades que repartir.

### 3.2 Entrada desde las demás cláusulas, con todo el grafo menos las partes

**La idea.** La forma de la importancia que se mantuvo, $I(c)=\frac{1}{|C|}\sum_{c'\neq c}M_{c'\to c}$,
con un paseo por cláusula. Pero el paseo recorría todo el grafo menos las partes: términos
definidos, condiciones, referencias y valores incluidos. Fue la primera versión de la entrada
que se programó.

| contrato | ρ con el tamaño | filas sin conexión |
|---|---|---|
| Bellicum | 0.67 | 0 de 91 |
| Santander | 0.47 | 2 de 81 |
| SteelVault | −0.12 | 6 de 22 |
| HalversonCorvin | −0.05 | 2 de 19 |
| OrvaneTalvera | 0.10 | 9 de 48 |
| lease 10 | −0.12 | 8 de 20 |
| lease 166 | — | 9 de 9 |
| lease 201 | −0.12 | 2 de 8 |

**Por qué se cambió:** la entrada viajaba sobre todo por los términos definidos compartidos.
Dos cláusulas parecían conectadas solo por usar el mismo término, aunque ninguna mencionara a
la otra. Además, esos nodos no se ven en la tabla, así que el lector no podía comprobar el
orden. El método actual deja en el paseo solo cláusulas y enunciados.

### 3.3 Las partes dentro del paseo

**La idea.** Recorrer solo lo que muestra la tabla, pero contando también las partes:
cláusulas, enunciados y partes.

| contrato | ρ con el tamaño |
|---|---|
| Bellicum | 0.97 |
| Santander | 0.93 |
| SteelVault | 0.94 |
| HalversonCorvin | 0.94 |
| OrvaneTalvera | 0.85 |
| lease 10 | 0.97 |
| lease 166 | 0.97 |
| lease 201 | 0.89 |

**Por qué se descartó:** sin términos, condiciones ni referencias, la parte se convierte en el
principal camino entre cláusulas. El orden vuelve a ser «primero las filas con más
cuadrados». Las partes se quedaron en la tabla como columnas, pero fuera del paseo.

### 3.4 Las partes como puente, con reparto justo

**La idea.** Mantener las partes en el paseo, pero que cada parte reparta lo que recibe primero
a partes iguales entre las filas donde aparece, y después entre sus enunciados de esa fila,
igual que hace el prior.

| contrato | ρ con el tamaño | filas sin conexión | empates |
|---|---|---|---|
| Bellicum | 0.72 | 0 | 3 |
| Santander | 0.72 | 0 | 11 |
| SteelVault | 0.48 | 0 | 4 |
| HalversonCorvin | 0.73 | 1 | 2 |
| OrvaneTalvera | 0.47 | 0 | 17 |
| lease 10 | 0.55 | 0 | 3 |
| lease 166 | 0.12 | 0 | 4 |
| lease 201 | 0.54 | 0 | 1 |

**Por qué se descartó:** casi ninguna fila queda sin valor, pero lo que la parte aporta es
casi igual para todas. Una fila donde aparecen las dos partes recibe dos porciones, y una con
una sola parte, una. En lease 166 el orden resultante era exactamente «primero las filas con
cuadrados en las dos columnas», algo que la tabla ya muestra. Las filas sin conexiones reales
pasaban de ceros a empates, y el sesgo por tamaño volvía a subir.

### 3.5 Dividir por el tamaño en lugar de sumar

**La idea.** Con el método anterior, usar la media de los enunciados de la fila en lugar de la
suma.

**Por qué se descartó:** invierte el sesgo en lugar de quitarlo, y favorece a las cláusulas
cortas. Como el prior da la misma masa a cada fila, cualquier división por algo que crezca con
el tamaño da ese resultado. Se probó en un script aparte y no está en el cuaderno.

## 4. Qué se conservó de todo esto

- La forma del prior de GraphQAG. Promediando los priors por cláusula del método actual sale
  exactamente $1/(|C|\cdot|V_c|)$.
- $d = 0.85$, la tolerancia de $10^{-9}$ y el máximo de 200 rondas.
- El grafo sin dirección y sin pesos por tipo.
- Contar en el prior solo los enunciados que muestra la tabla.
- La verificación contra `networkx` para cada cambio.
