# Trasformazioni e snapping M3

## Una sola geometria

`createTransformGeometry` converte `LayerTransform` e dimensione base in
centro, dimensioni, angolo e quattro vertici. `transformPoint` è usato per le
maniglie; `inverseTransformPoint` e `hitTestGeometry` usano la matrice inversa.
Le stesse trasformazioni effettive arrivano dal frame evaluator.

Il compositor disegna cover e testi con translate/rotate/scale intorno al
centro. L’anteprima calcola hit-test e maniglie dalla stessa trasformazione.
Le coordinate persistenti X/Y restano normalizzate.

## Snapping canvas

Target:

- centro orizzontale e verticale;
- bordi canvas, considerando metà dimensione dell’elemento;
- griglia al 10%;
- centro di altri elementi modificabili.

La soglia è 8 pixel della preview convertiti nell’asse normalizzato. Prima
vince la distanza minore; a pari distanza la priorità è centro, bordo,
elemento, griglia. Lo snap può essere disattivato globalmente o con Alt.

Le guide sono stato UI effimero: non entrano nel progetto, nella history o nel
compositor offline.

## Gesture

Move, resize e rotate aprono una transazione. Il resize è non uniforme; Maiusc
coordina gli assi. La rotazione usa gradi e, con snap attivo, passi da 15°.
Escape ripristina lo snapshot iniziale. Il lock consente selezione/lettura ma
blocca mouse, tastiera, inspector, timeline e azioni layer.

