# Métodos descartados — qué se probó y por qué se cayó

Dos métodos gobernaron la vista y ya no lo hacen. Se conservan porque el resultado
negativo —**qué se midió para descartarlos**— es material del paper.

---

## PPR sembrado en la parte

**Qué era.** Un PageRank personalizado sobre el grafo tratado como no dirigido, con el
vector de reinicio en el nodo de la parte enfocada (reinicio `0.15`, ~80 iteraciones).
Cada enunciado pesaba `PPR × severidad`, y de ahí salía todo: la barra de la parte, el
orden de las cláusulas y el tamaño de los nodos.

**Qué se midió sobre el documento de estudio**, y cada punto lo hunde:

- **La masa llegaba por el sitio equivocado.** El paseo alcanza una parte a través del
  nodo de cláusula, que es compartido: el **79%** del peso de Miltenyi en *Rights
  Granted and Restrictions on Bellicum* venía de prohibiciones sobre Bellicum.
- **Los dos lados no eran comparables.** Cada parte se normalizaba contra su propia
  cláusula máxima, así que las dos mitades de un reparto tenían denominadores distintos.
- **Cuatro cláusulas valían cero exacto.** El nodo «each Party» está en un componente
  desconectado, de modo que una semilla en una parte real nunca lo alcanza y toda
  cláusula recíproca —*Limitation of Liability* entre ellas— caía al fondo.
- **Y no aportaba nada.** Contra una simple suma de severidades, ρ = **0.882**: medía
  cuántos `is_part_of` colgaban de la cláusula, es decir, su tamaño.

**Qué lo reemplazó.** El prior por cláusula de GraphQAG, en
[`importancia-clausula.md`](./importancia-clausula.md). El `1/|V_c|` es exactamente el
desesgo que faltaba, y ninguna cláusula puede ya valer cero.

**Sigue en el código**, en `web/src/features/docx/utils/knowledge/party-pagerank.ts`
—`attention.ts`, donde vivía cuando se escribió esta nota, ya no existe—. De ahí lo
consumen `graph-payload.ts`, para los párrafos que el documento resalta y para el
resumen que se manda al chat, y `pair.ts`, para las puntuaciones del par cuando hay dos
partes abiertas. **No ordena nada de lo que se ve en la retícula**: eso es
[`importancia-clausula.md`](./importancia-clausula.md), que se calcula en el servidor.

**Tampoco se dibuja.** El grafo del KG llegó a construirse sobre este
vector y se rehízo antes de usarla: lo que se dibuja ahí es el PPR del servidor,
descrito en [`importancia-clausula.md`](./importancia-clausula.md). Este vector no
dibuja nada.

La pestaña propia que tuvo el grafo también se retiró: vivía separada de la retícula y
obligaba a mantener dos listas de cláusulas, dos priors y dos órdenes que conciliar.
Ahora cuelga debajo de la retícula y comparte con ella la selección, el filtro de tipos
y la respuesta del servidor.

De paso se cayó una vista intermedia —maestro-detalle, la cláusula abierta en tres
columnas cláusula → disposiciones → entidades— construida sobre el argumento de que el
grafo es una jerarquía y no una red: 148 de sus 157 aristas son `is_part_of` o
`assigns_obligation_to`/`grants_right_to`, y solo 3 son transversales. El argumento
sigue siendo cierto, pero **resultó innecesario dibujar la jerarquía aparte**: basta con
encender esa misma vecindad dentro del grafo y apagar el resto. La cláusula seleccionada
se ancla por encima del corte top-N, porque sin eso quedaban 3 de sus 15 nodos en
pantalla.

---

## La barra con signo

**Qué era.** Cada parte llevaba un número con signo, restando a quien soporta la
transferencia: *Rights Granted* daba **−6.1 / +7.3**.

Se descartó por lectura, no por cálculo: **`−6.1` no tiene unidad** y a *«¿6.1 qué?»* no
había respuesta que el lector pudiera comprobar. Con dos números no negativos el par se
vuelve un reparto, y el porcentaje sí se verifica contando las marcas de la fila.

Se ganaron dos cosas de paso. **Nada queda fuera**: con el signo, 30 de 74 enunciados
nombraban un solo extremo y quedaban a medias; sumando, un derecho sin sujeto sigue
acreditando a su titular. Y **las recíprocas dejan de ser un caso aparte**. Lo que se
perdió es la magnitud —ya no se puede decir que una cláusula pesa el triple que otra—,
y por eso la magnitud pasó al orden de las filas.

### Total contra intensidad

Antes hubo **dos barras**: el total (suma, donde el número de enunciados cuenta) y la
intensidad (esa suma dividida entre el número de enunciados). La distancia entre ambas
era el **efecto del recuento**: mucha distancia significaba muchas disposiciones ligeras,
poca distancia significaba disposiciones pesadas de verdad.

La idea era buena y la lectura no: exigía comparar dos porcentajes para extraer un
tercero que nunca se mostraba. La magnitud vive ahora en el **orden de las filas**, y la
barra dice solo el reparto.

---

## Qué se borró con ellos

La ficha de balance de la parte, la barra divergente de las cláusulas más pesadas, los
anillos alrededor de los nodos, el tamaño de nodo por puntuación y la casilla *Weigh with
PageRank* —que existía como ablación del PPR y dejó de tener sentido cuando el PageRank
pasó a ser el único orden posible—. Todo eso desapareció con el grafo radial que lo
contenía.
