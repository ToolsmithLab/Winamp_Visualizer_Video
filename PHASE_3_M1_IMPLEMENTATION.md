# Fase 3 — Milestone M1: implementazione

Data verifica: 29 luglio 2026.  
Perimetro: esclusivamente T3.01, T3.02, T3.03 e T3.04.

## Stato

La M1 introduce le fondamenta richieste senza avviare T3.05 o attività
successive. I sei visualizzatori Canvas, projectM 4.1.6, il protocollo
projectM, i default visuali e l'ordine di composizione non sono stati cambiati.

Prima delle modifiche la suite contava 61 test: 60 superati e un test symlink
non eseguibile per privilegio Windows. Il repository corrispondeva ai documenti
di pianificazione, con una divergenza nominale: i moduli condivisi reali erano
ancora in `src/renderer/plugins` e `src/shared/sceneCompositor.ts`, esattamente
il debito che T3.02 richiedeva di rimuovere.

## T3.01 — Baseline

Sono state aggiunte fixture progetto 1.0, 2.0, 3.0, 4.0 e una fixture 5.0
rappresentativa. La 5.0 contiene projectM, playlist e transizione MilkDrop,
sei plugin Canvas, cover/testi, intervalli, opacità, sette blend mode, ordine
layer, percorsi Unicode e seed fissi.

`tests/fixtures/audio/phase2-multiband.wav` è il WAV reale congelato, SHA-256
`14e48c3ca306f903817b23803732e09e0b7e9bf344166a69721762c9388d9a20`.

`phase2-canvas-golden.json` conserva gli hash raster dei sei plugin con PCM
sintetico e reale, preview/offline, seek avanti/indietro e due istanze
indipendenti del plugin stateful. Il test ricalcola e confronta i dati tre
volte; non esiste aggiornamento automatico. Lo script
`compute-phase3-m1-golden.cjs` stampa soltanto il candidato.

`phase2-contract-baseline.json` congela progetto pre-M1, contratti IPC,
messaggi critici e manifest runtime.

## T3.02 — Motore condiviso

La composizione è in `src/engine/composition`; i sei plugin, i tipi e il loro
host sono in `src/engine/plugins`. Preview browser ed export offline importano
gli stessi moduli. Il controllo statico vieta a `engine` e `shared` import da
`renderer` o dipendenze DOM, Electron e Node.

`src/renderer/state.ts` è stato ridotto a istanza/esportazione del
`ProjectStore`; la gestione history è delegata a
`src/renderer/commands/historyController.ts`. `app.ts` collega tali servizi,
ma non implementa dispatcher, history o diff.

Non sono stati modificati host C++, protocollo IPC, parametri plugin, seed,
default o ordine di rendering. Tutti gli hash golden sono rimasti identici.

## T3.03 — Progetto 6.0

Lo schema 6.0 rappresenta riferimento/versione/settings del plugin,
trasformazione comune, keyframe futuri, riferimenti asset e payload sconosciuti.
PCM, framebuffer, bitmap, metriche, playhead, handle, PID e istanze runtime
sono rifiutati dal validatore.

La catena pura ed esplicita è:

`1.0 → 2.0 → 3.0 → 4.0 → 5.0 → 6.0`.

Il resolver unico `resolveLayerTransform` gestisce la compatibilità delle
coordinate legacy. I plugin sconosciuti sono conservati come dati, non
eseguiti. Una versione futura genera `FutureProjectVersionError`, non viene
normalizzata né risalvata.

Il salvataggio usa un file temporaneo esclusivo nella stessa directory,
scrittura e `fsync`, backup `.bak` sincronizzato, rename e pulizia. Le fault
injection `invalid-json`, `write`, `disk-full`, `interrupt` e `rename`
dimostrano che originale e backup non vengono persi.

## T3.04 — Comandi e revisioni

`CommandDispatcher` assegna revisioni monotone e confronta `revision` con
`savedRevision`. `History` conserva al massimo 200 comandi e 32 MiB stimati,
eliminando in modo controllato le voci più vecchie.

Le mutazioni persistenti generano delta di proprietà. Gli array stabili sono
diffati per elemento; una struttura array modificata usa uno snapshot
circoscritto dell'array, non del progetto e mai di PCM/framebuffer/bitmap.

Slider e drag aprono una transazione e registrano un solo comando alla
conferma. Escape annulla il gesto ripristinando lo stato senza history.
Nuovo/apri azzerano la history. Salva aggiorna `savedRevision` senza
cancellarla. Undo fino alla revisione salvata rende il progetto pulito; redo lo
rende nuovamente modificato.

Sono collegati modifica proprietà, visibilità, lock, nome, opacità, blend,
intervalli, ordine, aggiunta/duplicazione/eliminazione dei visualizzatori
esistenti, trasformazioni cover/testi e impostazioni dei visualizzatori.
Scorciatoie: `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z`; input, textarea, select e
contenteditable mantengono il comportamento nativo.

## Esclusioni confermate

Non sono stati aggiunti plugin, keyframe visibili, timeline avanzata, preset di
progetto o loader di terze parti. T3.05 e attività successive non sono
iniziate.

