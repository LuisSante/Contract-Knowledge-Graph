# Comparadores — contra qué se mide cada ausencia

Una ausencia solo se ve comparada con algo. La tabla cláusulas × partes no compara con
nada, y por eso no puede enseñar lo que falta: una sola discreción, un tope, un derecho
que tiene una parte y la otra no. El Clause Analyzer ofrece ahora un comparador en su
propia pestaña, y deja la tabla de siempre como segunda pestaña y como tarjeta compacta
dentro de la primera.

| Pestaña | La fila es | Se compara con | Código |
|---|---|---|---|
| What if… | un paso dentro de una situación | el hecho que dispara las condiciones | `utils/knowledge/scenarios.ts` |

Las cifras de este documento salen de `node scripts/comparators.mjs` sobre el acuerdo de
suministro Bellicum–Miltenyi, con los mismos módulos que ejecuta la web.

---

## What if…

Una situación es el hecho que espera una condición (`Condition.trigger`), y sus pasos
son los enunciados que esa condición cierra (`gatesId`), en el orden del documento.
Un paso es riesgo cuando da un derecho a la otra parte de quien lee. Los límites son los
enunciados de tope o exclusión en los mismos artículos. Un hueco es un paso que no nombra
a ninguna parte, o un deber de la otra parte sin plazo.

Resultado leído como Bellicum: siete situaciones. La de entrega defectuosa tiene 21 pasos,
2 riesgos —§7.2, Miltenyi no responde de nada una vez aceptado el envío, y §11.4, no
responde de los defectos de causa externa—, 8 límites y 4 huecos, los cuatro deberes de
Miltenyi sin plazo.

---

## Límites

- Los hechos son una lista de palabras. Funciona en este corpus; una pasada de
  clasificación por enunciado la sustituiría.
- «Quién paga el laboratorio» y el tope de §12.1(b) no se ven porque el grafo no los
  tiene. La pestaña los distingue de lo que el contrato no dice, pero no los recupera.
