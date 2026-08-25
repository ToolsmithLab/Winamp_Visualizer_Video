# Fase 3 — Milestone M3: implementazione

Data: 29 luglio 2026. Perimetro: T3.09, T3.10 e T3.11. T3.12 e attività
successive non sono state iniziate.

## Risultato

M3 introduce trasformazioni dirette per cover, artista e titolo, keyframe base
deterministici e una timeline minima modificabile. Preview Electron e export
offline passano entrambi da `SceneCompositor`, che valuta i keyframe con
timestamp esplicito prima di disegnare.

## Moduli aggiunti

- `src/engine/transforms/geometry.ts`: matrice, trasformazione inversa,
  hit-test ruotato, maniglie e snapping.
- `src/engine/keyframes/keyframeEngine.ts`: proprietà ammesse, validazione,
  indicizzazione, interpolazioni, evaluator e operazioni.
- `src/engine/timeline/geometry.ts`: tempo/pixel, zoom, scroll, clamp, snap,
  hit-test e clip.

Questi moduli sono puri, non importano renderer, Electron, DOM o Node.

## Trasformazioni

La sola fonte persistente è `ProjectLayer.transform` con coordinate
normalizzate. I campi storici di cover e testo restano leggibili dalla
migrazione, ma le operazioni M3 non li aggiornano parallelamente.

Il canvas supporta selezione, trascinamento, ridimensionamento non uniforme,
ridimensionamento uniforme con Maiusc, rotazione, input numerico, reset,
lock, frecce e annullamento del gesto con Escape. Le maniglie seguono la
rotazione e la scala CSS della preview.

Lo snapping canvas è disattivabile; Alt lo sospende durante il gesto. La
priorità in caso di pari distanza è: centro, bordo canvas, elemento, griglia.
Le guide sono disegnate soltanto da `PreviewRenderer`, dopo il compositor, e
non entrano nell’export.

## Keyframe

Proprietà: `x`, `y`, `scale`, `rotation`, `opacity`, `intensity`.

`scale` è uniforme: prima del primo keyframe restano validi `scaleX/scaleY`
base; dal primo keyframe in poi il valore anima entrambi gli assi. Non esiste
una seconda interpretazione.

L’intensità vive in `layer.reactive.intensity`. I plugin legacy la ricevono
nelle impostazioni storiche; i plugin descriptor M2 ricevono lo stesso
moltiplicatore comune tramite il contratto host, senza condizioni per ID.

Interpolazioni: linear, ease-in, ease-out, ease-in-out e hold. La
interpolazione del keyframe sinistro governa il segmento successivo.

Collision policy: per proprietà e timestamp rimane un solo keyframe; un
upsert sostituisce esplicitamente quello esistente. In normalizzazione di input
non canonico vince l’ID lessicalmente ultimo. L’ordine canonico è tempo, poi ID.
NaN/Infinity e proprietà sconosciute sono rifiutati; i range sono clampati.

## Timeline

La waveform preesistente usa ora lo stesso viewport temporale della timeline.
Sono presenti zoom 1×–100×, scroll, clip con due maniglie, traccia della
proprietà selezionata, keyframe selezionabili/trascinabili, snap a marker,
clip e frame, tempo leggibile e valori nell’inspector.

La durata minima di una clip è `1/60 s`. La clip è clampata alla durata del
progetto. I keyframe fuori dal nuovo intervallo sono conservati: non vengono
eliminati silenziosamente e tornano effettivi se l’intervallo viene esteso.
Il drag dei keyframe è invece clampato alla clip corrente.

## Command history e accessibilità

Drag, resize, rotazione, slider e drag timeline aprono una transazione e
producono un solo comando. Escape esegue rollback senza history. Input
numerici, keyframe, clip, lock e reset passano dal `ProjectStore`/
`CommandDispatcher`.

Canvas, layer, clip e keyframe hanno label e focus visibile. Frecce spostano
elementi e keyframe; Delete elimina il keyframe; i pulsanti precedente/
successivo e gli input numerici forniscono equivalenti non grafici.

## Compatibilità

Lo schema resta 6.0. I progetti M1/M2 aprono senza keyframe e producono la
baseline precedente. Nessuna nuova dipendenza è stata aggiunta. projectM,
sequencer, Preset MilkDrop e catalogo non sono stati modificati.

