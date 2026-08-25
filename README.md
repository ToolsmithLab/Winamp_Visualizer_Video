# Audio Visualizer Studio

Editor desktop Windows per comporre ed esportare video musicali
audio-reattivi. La schermata principale usa ora un flusso semplice a sei
passaggi; la validazione umana indipendente dell'usabilità resta da eseguire.
La Fase 4 non è iniziata.

## Funzioni

- projectM 4.1.6 reale in host C++ separato, PCM e framebuffer BGRA;
- Preset MilkDrop `.milk`, libreria personale e catalogo verificato;
- cambio manuale/automatico, playlist, transizioni e seed;
- dieci plugin Canvas deterministici;
- interfaccia semplice: Sfondo immagine/video, Audio, Titolo, Artista,
  Effetto e Intensità;
- gestione MilkDrop nella maschera con ricerca, filtri, preferiti e rimozione
  persistente del singolo preset;
- stage video delimitato con scelta progetto 9:16, 1:1, 4:3 o 16:9 e zoom
  anteprima indipendente dalle coordinate reali;
- pannello `Layer` fisso a destra con Immagine oppure Video, Effetto, Titolo
  e Artista, stato `ATTIVO` e blocco selezione abilitato per default;
- waveform e barra Play/Stop/Esporta separate e completamente esterne allo
  stage;
- Sfondo esclusivo immagine/video con primo frame immediato,
  Adatta/Riempi/Dimensione originale, selezione, drag, resize, rotazione e
  opacità;
- titolo e artista immediati con dimensione, colore e opacità indipendenti;
- un solo effetto principale, sostituito immediatamente dal menu;
- keyframe e timeline;
- progetto `.avsproject` schema 6.0 e Preset di progetto `.avspreset`;
- manifest asset e relink SHA-256;
- undo/redo, dirty state e salvataggio atomico;
- export frame-by-frame con OpenH264/AAC, progresso per fase/frame, ETA,
  timeout del primo frame e annullamento con cleanup;
- Setup NSIS e Portable Windows x64.

## Stato test

- framing IPC projectM: 33/33;
- stress IPC reale: 100.000/100.000 render;
- suite: 346 totali, 344 pass, 0 fail, 2 skip symlink;
- layer Video: 42/42 e 18 scenari runtime Electron;
- Portable e Setup finali: 19 scenari runtime ciascuno, 0 fallimenti;
- UI semplice: audit 56/56 handler;
- pannello/stage: sviluppo, Portable esterna e Setup installato superati;
- workflow end-to-end sviluppo/Portable/Setup superato;
- golden M1/M2 invariati;
- M1–M4: 91 totali, 90 pass, 0 fail, 1 skip;
- catalogo: 37/37; preset reali: 10/10;
- determinismo: probe 1/180/1.800 e due export indipendenti superati;
- soak: playback 600,750 s ed export 18.000 frame completati;
- errori IPC/pipe, crash, frame neri, duplicati e cambi falliti: 0;
- Portable e Setup verificati fuori workspace da percorsi Unicode;
- processi residui: 0.

L'audit specifico dell'esportazione ha completato otto scenari da 10 secondi
e il brano reale completo da 155,43 secondi. Il primo frame è arrivato entro
0,638 s anche con projectM e tutti i nove MP4 sono stati decodificati.

Il caso Video 1080×1920/30 FPS con clip di 8 secondi, WAV esterno di 4:13,
Freeze, Canvas e testi ha completato 7.590 frame in 1.091 secondi: 0 frame
neri, 0 duplicati anomali, un solo audio AAC e MP4 H.264 decodificabile.

Dettagli:

- `PROJECTM_IPC_FRAMING_ANALYSIS.md`;
- `PROJECTM_IPC_FRAMING_FIX.md`;
- `PROJECTM_IPC_FRAMING_TEST_RESULTS.md`;
- `PHASE_3_FINAL_RUNTIME_GATE_RESULTS.md`;
- `PHASE_3_FINAL_AUDIT.md`;
- `PHASE_3_FINAL_REPORT.md`;
- `COVER_WORKFLOW_TEST_RESULTS.md`;
- `SIMPLE_UI_REDESIGN.md`;
- `SIMPLE_UI_TEST_RESULTS.md`;
- `VISIBLE_CONTROLS_AUDIT.md`;
- `EXPORT_STALL_ANALYSIS.md`;
- `EXPORT_STALL_FIX.md`;
- `EXPORT_PROGRESS_TEST_RESULTS.md`;
- `MILKDROP_PRESET_MANAGEMENT_UI.md`;
- `LAYER_SELECTION_UI_FIX.md`;
- `RIGHT_LAYER_PANEL_AND_STAGE_FIX.md`;
- `RIGHT_LAYER_PANEL_AND_STAGE_TEST_RESULTS.md`;
- `PRESET_FAVORITES_AND_DELETE_TEST_RESULTS.md`.
- `VIDEO_LAYER_INTEGRATION_FIX.md`;
- `VIDEO_PREVIEW_DECODER_ANALYSIS.md`;
- `VIDEO_LAYER_TEST_RESULTS.md`;
- `VIDEO_BACKGROUND_SUPPORT.md`.

## Sviluppo

Requisiti:

- Windows 10/11 x64;
- Node.js compatibile con Electron 37;
- npm;
- MSVC/CMake soltanto per ricompilare host o DLL projectM.

```powershell
npm install
npm run dev
npm test
npm run dist
```

L'utente finale non deve installare Node.js, Visual Studio, projectM o FFmpeg.

## Struttura

```text
assets/      preset e catalogo
licenses/    testi di licenza
native/      host, runtime, FFmpeg e overlay projectM
scripts/     probe, audit, benchmark e packaging
src/         main, preload, renderer, engine e shared
tests/       suite automatica e fixture
```

## Licenze

Consultare `THIRD_PARTY_LICENSES.md`, `PRESET_LICENSES.md` e `licenses/`.
La documentazione registra una verifica tecnica e documentale, non un parere
legale definitivo.
