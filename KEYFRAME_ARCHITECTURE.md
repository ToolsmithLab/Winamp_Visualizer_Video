# Architettura keyframe M3

## Contratto

Un keyframe persistente contiene `id`, `property`, `time`, `value` e
`interpolation`. Le proprietà supportate sono `x`, `y`, `scale`, `rotation`,
`opacity` e `intensity`.

Il valore effettivo è funzione pura di:

`layer + timestamp + indice della traccia + valore base`.

Non usa clock, `Math.random`, stato di riproduzione o frame rate. Preview ed
export chiamano `evaluateLayerAtTime`.

## Regole temporali

- prima del primo keyframe: valore base;
- esattamente sul keyframe: valore del keyframe;
- fra due keyframe: interpolazione scelta dal keyframe sinistro;
- dopo l’ultimo: ultimo valore;
- hold: mantiene il valore sinistro fino al timestamp destro;
- ordinamento: tempo crescente, poi ID;
- collisione: un solo valore effettivo per proprietà/timestamp.

L’epsilon di confronto è `1e-7 s`. Il timestamp del frame resta esplicito; la
quantizzazione a frame avviene soltanto quando l’utente richiede lo snap.

## Scala e intensità

La scala animata è uniforme e imposta entrambi gli assi. Una trasformazione
base senza traccia scale conserva la scala non uniforme.

L’intensità è una proprietà comune del layer visualizer. Il contratto host la
applica ai plugin descriptor attraverso `commonIntensity` e un audio snapshot
intensificato; i sei plugin legacy mantengono il percorso settings già
verificato. La scelta è descriptor-driven, non basata sull’ID.

## Prestazioni

Le tracce sono preindicizzate per proprietà e valutate con ricerca binaria.
Una `WeakMap` riusa l’indice finché l’array keyframe immutabile non cambia.
L’evaluator non modifica né il layer né i keyframe.

Sulla macchina di riferimento, 1.000 keyframe hanno p95 `0,0041 ms` dopo
l’indicizzazione. Il caso 10.000 è stress non supportato: costruzione indice
`18,17 ms`, valutazione p95 `0,0082 ms`.

