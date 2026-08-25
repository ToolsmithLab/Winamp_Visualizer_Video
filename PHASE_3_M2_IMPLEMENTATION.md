# Implementazione Fase 3 — Milestone M2

Data: 29 luglio 2026. Perimetro: T3.05–T3.08. T3.09 e attività successive
non sono state iniziate.

## Esito

La M2 introduce esattamente dieci visualizzatori Canvas integrati e fidati.
projectM 4.1.6 resta un motore nativo separato e i Preset MilkDrop restano
contenuti interpretati da projectM.

## T3.05 — contratto, registro e lifecycle

Creati o sostituiti:

- `src/engine/plugins/types.ts`;
- `src/engine/plugins/validation.ts`;
- `src/engine/plugins/descriptorHelpers.ts`;
- `src/engine/plugins/pluginUtils.ts`;
- `src/engine/plugins/registry.ts`;
- `src/engine/plugins/visualizerHost.ts`.

Il contratto separa descriptor immutabile e istanza runtime. Il registro
rifiuta ID duplicati e `projectM`, conserva ordine stabile e contiene dieci
descriptor. L'host crea un'istanza per layer, gestisce tutto il lifecycle,
normalizza le impostazioni, deriva seed distinti, isola eccezioni e sospende
solo l'istanza dopo tre errori consecutivi.

`SceneCompositor`, preview e compositor offline rilasciano esplicitamente
l'host. La chiusura della finestra chiama il dispose della preview.

## T3.06 — sei plugin migrati

Sono stati migrati nel contratto:

- `spectrumBars`;
- `circularSpectrum`;
- `waveformLine`;
- `particleBurst`;
- `pulseShapes`;
- `dynamicVignette`.

Gli algoritmi raster, i default e gli ID persistiti restano invariati. La
factory di Particle Burst fornisce stato separato per layer. La prova golden M1
è rimasta identica in tre ripetizioni.

## T3.07 — inspector dinamico

`src/renderer/inspector/parameterControls.ts` genera controlli number, boolean,
color e select esclusivamente da `descriptor.parameters`. `src/renderer/app.ts`
usa il registro per il catalogo, aggiunge/duplica/elimina/rinomina istanze e
gestisce reset parametro/plugin, lock, visibilità, ordine, blend, opacità e
intervalli.

Tutte le mutazioni persistenti passano dal `CommandDispatcher`; slider e color
picker usano transazioni per gesto. Focus e scorciatoie restano gestiti. I testi
sono assegnati con `textContent`, senza `innerHTML` o IPC generico.

## T3.08 — quattro visualizzatori

Creati:

- `src/engine/plugins/radialRays.ts`;
- `src/engine/plugins/mirroredWaveform.ts`;
- `src/engine/plugins/audioGrid.ts`;
- `src/engine/plugins/orbitingParticles.ts`.

I quattro algoritmi usano spettro, waveform e bande reali, rispettano limiti
geometrici, supportano 30/60 FPS e risoluzioni diverse e hanno output
deterministico. Orbiting Particles usa un hash PRNG e trail limitato; uno shadow
blur per particella è stato rimosso dopo profiling perché rendeva l'export
1080×1920 non sostenibile.

## Test e strumenti aggiunti

- `tests/phase3-m2.test.cjs`;
- `tests/fixtures/golden/phase3-m2-canvas-golden.json`;
- `scripts/compute-phase3-m2-golden.cjs` (sola lettura/stampa);
- `scripts/benchmark-phase3-m2-plugins.cjs`;
- `scripts/phase3-m2-electron-ui-test.cjs`;
- modalità `m2` in `scripts/run-preview-export-parity.cjs`.

Il golden M2 comprende projectM reale, tre preset, transizioni, tutti i plugin,
due Particle Burst, cover, testi, sette blend mode, layer nascosti/lockati,
intervalli, seed fisso, percorso Unicode e WAV di 60 secondi.

## Compatibilità

Lo schema resta 6.0. I progetti 1.0–5.0 migrano senza perdita e i plugin
sconosciuti restano conservati ma non eseguiti. Nessun loader esterno è stato
aggiunto. Packaging e dipendenze native della Fase 2 restano invariati.
