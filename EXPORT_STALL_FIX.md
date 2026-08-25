# Correzione del blocco dell'esportazione

Data implementazione: 31 luglio 2026.

## Job registrato prima delle attese

Il servizio registra immediatamente un job con `AbortController`, fase,
destinazione e Promise di completamento. Inizializzazione projectM, caricamento
preset, decoder, encoder e primo frame sono quindi annullabili.

Il job mantiene i riferimenti a:

- decoder PCM FFmpeg;
- encoder OpenH264/AAC FFmpeg;
- host projectM separato;
- output parziale;
- log JSONL persistente.

## Timeout

| Operazione | Timeout |
| --- | ---: |
| inizializzazione projectM | 20 s |
| caricamento preset MilkDrop | 20 s |
| risposta IPC render | 32 s |
| primo framebuffer projectM | 35 s |
| avvio FFmpeg | 10 s |
| primo blocco PCM | 15 s |
| scrittura primo frame | 30 s |
| apertura output | 10 s |

Un timeout interrompe host, decoder ed encoder, elimina il parziale e presenta
il nome della fase, per esempio `Primo framebuffer projectM: timeout dopo
35 s`.

## Progresso UI

La finestra mostra:

- fase leggibile;
- messaggio corrente;
- frame corrente e totale;
- percentuale;
- tempo trascorso;
- frame/s;
- tempo rimanente stimato;
- codec, encoder, risoluzione, FPS e durata;
- output, FFmpeg, runtime OpenH264 e log diagnostico.

La mappatura percentuale riserva:

- 1–14% a preparazione, audio, projectM e compositor;
- 15–97% ai frame realmente scritti;
- 98% alla finalizzazione MP4;
- 100% al file completato.

Il primo frame produce sempre un avanzamento maggiore di zero.

## Diagnostica projectM

Prima della codifica vengono registrati preset, percorso, stato, texture,
texture mancanti, opacità, blend, visibilità, versione GL, PID host, richieste
IPC pendenti e stato render. Ogni framebuffer deve avere larghezza, altezza,
stride e numero di byte esatti.

`Nessun effetto` non avvia projectM e usa lo stesso compositor per cover,
testi e Canvas. In caso di errore projectM l'utente riceve quindi un messaggio
specifico e può isolare il problema esportando senza effetto.

## Annullamento e cleanup

`Annulla`:

1. segnala l'abort al compositore;
2. termina decoder ed encoder;
3. termina l'host projectM;
4. attende il completamento del cleanup;
5. elimina l'MP4 parziale;
6. invia l'evento `cancelled`;
7. chiude la finestra di progresso.

Il test runtime ha lasciato zero processi residui e nessun file
`cancelled.mp4`.

## File applicativi modificati

- `src/main/exportService.ts`;
- `src/main/projectm/projectMExportRenderer.ts`;
- `src/main/projectm/projectMHostService.ts`;
- `src/renderer/app.ts`;
- `src/renderer/styles.css`;
- `src/renderer/global.d.ts`;
- `src/shared/ipc.ts`;
- `src/shared/presetSequencer.ts`.

## Test aggiunti

- `tests/export-stall.test.cjs`;
- regressione preset iniziale in `tests/preset-transition.test.cjs`;
- `scripts/export-stall-electron-test.cjs`.
