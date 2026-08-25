# Correzione integrazione layer Video

Data verifica: 1 agosto 2026.

## Causa

La clip era memorizzata in `project.clip` e decodificata da un
`HTMLVideoElement`, ma veniva disegnata come sorgente speciale prima dello
stack. Il pannello destro, l'hit test e le trasformazioni dipendevano invece
dal solo `project.cover.filePath` e dal layer storico `cover`. Caricare una
clip non rendeva visibile né selezionava quel layer. In export la clip veniva
inoltre scalata e ritagliata dal decoder FFmpeg con calcoli separati da quelli
della preview. Il resolver del compositor ignorava inoltre le proprietà
intrinseche `videoWidth/videoHeight`: l'elemento video risultava 1×1 e
stirava sullo stage soltanto il pixel superiore sinistro.

## Correzione

- la UI espone il concetto `Sfondo`, con etichetta dinamica `Immagine` o
  `Video`;
- nel flusso semplice immagine e clip sono alternative: caricare una rimuove
  il riferimento all'altra;
- il layer persistito conserva l'identificatore storico `cover` per
  compatibilità con i progetti schema 6.0, ma la sua semantica UI è ora
  generica;
- il layer Sfondo viene ordinato sotto Canvas/projectM e sotto i testi;
- il caricamento attende `loadedmetadata`, `loadeddata` e il primo
  `requestVideoFrameCallback`; un piccolo seek a 1 ms inizializza Chromium
  senza avviare Play;
- codec, contenitore, dimensioni, FPS, durata e audio sono rilevati da FFmpeg;
- i contenitori dichiarati nella UI sono MP4/M4V/MOV e WebM, subordinati a un
  codec Chromium compatibile;
- un codec incompatibile produce un errore con suggerimento MP4 H.264;
- posizione, scala X/Y, rotazione, opacità, Adatta, Riempi, Originale, Centra
  e Ripristina lavorano sul layer Video;
- Play, pausa, seek e Stop sincronizzano l'elemento video col clock della sola
  sorgente audio attiva;
- l'avvio audio ha un timeout di 5 secondi, evitando attese indefinite del
  dispositivo;
- Loop usa `projectTime % clipDuration`, Freeze mantiene l'ultimo frame e
  Black compone nero intenzionale;
- preview ed export usano entrambi `SceneCompositor` e `coverDrawPlan`;
- il resolver delle dimensioni usa `videoWidth/videoHeight` per
  `HTMLVideoElement`, evitando il campionamento errato 1×1 del solo primo
  pixel;
- FFmpeg decodifica la clip alla risoluzione nativa. Crop, fit, trasformazione
  e opacità sono applicati una sola volta dal compositor condiviso.

## Compatibilità e risorse

L'object URL della clip viene revocato alla sostituzione, alla rimozione e
alla chiusura. Callback video, superfici e buffer vengono riutilizzati o
rilasciati. La clip non viene riprodotta come seconda sorgente audio: l'export
mappa una sola traccia audio.

## File principali

- `src/renderer/previewRenderer.ts`
- `src/renderer/app.ts`
- `src/renderer/audioEngine.ts`
- `src/engine/composition/sceneCompositor.ts`
- `src/main/mediaService.ts`
- `src/main/projectm/projectMExportRenderer.ts`
- `src/main/export/offlineSceneCompositor.ts`
- `src/shared/project.ts`
- `src/shared/ipc.ts`

La Fase 4 non è stata iniziata.
