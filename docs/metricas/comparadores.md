# Comparadores — contra qué se mide cada ausencia

Una ausencia solo se ve comparada con algo. La tabla cláusulas × partes no compara con
nada, y por eso no puede enseñar lo que falta: una sola discreción, un tope, un derecho
que tiene una parte y la otra no. El Clause Analyzer ofrece ahora dos comparadores,
uno por pestaña, y deja la tabla de siempre como tercera pestaña y como tarjeta compacta
dentro de las otras dos.

| Pestaña | La fila es | Se compara con | Código |
|---|---|---|---|
| Mirror | un derecho que cualquiera de las dos partes podría tener | la otra parte | `utils/knowledge/mirror.ts` |
| What if… | un paso dentro de una situación | el hecho que dispara las condiciones | `utils/knowledge/scenarios.ts` |

Las cifras de este documento salen de `node scripts/comparators.mjs` sobre el acuerdo de
suministro Bellicum–Miltenyi, con los mismos módulos que ejecuta la web.

---

## Mirror

Se emparejan solo los derechos de familias que las dos partes podrían tener —renovar,
salir, ceder, auditar, responsabilidad—, y dentro de cada familia por coincidencia de
palabras en la acción (Dice ≥ 0,5, sin los nombres de las partes). Lo que queda sin
pareja es un hueco; si la pareja existe pero solo un lado lleva *sole discretion*,
*without cause*, consentimiento o tope, es «otra letra pequeña».

Solo **32 de los 103 derechos** de las dos partes caen en esas familias. El resto es
propio del rol —comprar, fabricar, entregar— y emparejarlo marcaría medio contrato como
hueco: comprador y proveedor no hacen lo mismo por definición. Una familia más,
«cambios», se probó y se quitó: mezclaba el precio y las especificaciones del producto,
que también son del rol.

Resultado: **10 iguales · 6 solo Miltenyi · 6 solo Bellicum**. Salen solos los casos
que se buscaban a mano: *Terminate … without cause* (§15.3), la renovación (§15.1) y la
auditoría (§9.1), solo de Bellicum.

## What if…

Una situación es el hecho que espera una condición (`Condition.trigger`), y sus pasos
son los enunciados que esa condición cierra (`gatesId`), en el orden del documento.
Un paso es riesgo cuando da un derecho a la otra parte de quien lee. Los límites son los
enunciados de tope o exclusión en los mismos artículos.

Resultado leído como Bellicum: seis situaciones; la de entrega defectuosa tiene 7 pasos,
1 riesgo (§7.2, el envío se da por aceptado si no se rechaza a tiempo) y 3 límites.

---

## Límites

- Las familias y los hechos son listas de palabras. Funcionan en este corpus; una
  pasada de clasificación por enunciado las sustituiría.
- «Quién paga el laboratorio» y el tope de §12.1(b) no se ven porque el grafo no los
  tiene. La pestaña los distingue de lo que el contrato no dice, pero no los recupera.
