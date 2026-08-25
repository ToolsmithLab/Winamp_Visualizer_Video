# Attività verificabili per completare la Fase 2

> Documento storico pre-implementazione. Per attività eseguite, fallimenti e stato corrente vedere `PHASE_2_TEST_RESULTS.md` e `KNOWN_ISSUES.md`.

Stato: **da implementare**  
Regola: nessuna attività è “completa” se usa mock, placeholder, frame sintetici
al posto di projectM o preset che non vengono realmente interpretati.

## Dipendenze fra attività

```text
T01 -> T02 -> T03 -> T04
                  -> T05 -> T06 -> T07
T04 + T07 -> T08 -> T09 -> T10
T04 + T08 + T10 -> T11
T01 + T05 -> T12
T09 + T10 + T11 + T12 -> T13 -> T14
```

## T01 — Congelare versioni, sorgenti e licenze

**Obiettivo**

Definire una distinta base riproducibile e verificare prima dell'integrazione
che ogni componente nativo possa essere costruito e distribuito.

**File coinvolti**

- da creare: `native/projectm-host/third-party-lock.json`,
  `licenses/projectM/*`, `licenses/FFmpeg/*`, `licenses/presets/README.md`;
- da modificare: `THIRD_PARTY_LICENSES.md`, `PRESET_LICENSES.md`,
  `BUILD_WINDOWS.md`.

**Dipendenze**

- libprojectM 4.1.6;
- projectM playlist 4.1.6;
- GLEW, GLM, projectm-eval e dipendenze effettive del build;
- SDL2;
- toolchain MSVC/CMake;
- decisione sul build FFmpeg.

**Implementazione prevista**

1. registrare URL, tag, commit e SHA-256 del source archive projectM;
2. registrare opzioni CMake, triplet x64 e versioni della toolchain;
3. costruire shared DLL, con `ENABLE_CXX_INTERFACE=OFF`;
4. enumerare DLL/link effettivi con strumenti Windows;
5. acquisire testi licenza e notice;
6. definire build FFmpeg LGPL senza `--enable-gpl`/libx264 e con `h264_mf`;
7. creare manifest per i futuri 10 preset, ancora senza dichiararli approvati.

**Test**

- verifica automatica SHA-256;
- controllo che le DLL projectM siano dinamiche e separabili;
- controllo `ffmpeg -buildconf` e `ffmpeg -encoders`;
- scan della cartella nativa per dipendenze mancanti;
- revisione manuale licenze.

**Criterio di completamento**

Una macchina pulita può ricostruire gli stessi artefatti; manifest, hash,
opzioni build e licenze sono completi; il responsabile legale/prodotto approva
la strategia prima della redistribuzione.

**Rischi**

- dipendenze transitive con licenze non registrate;
- FFmpeg Media Foundation non disponibile nel build scelto;
- differenze fra tag e source archive.

**Prerequisiti**

- nessuno; è il primo gate.

## T02 — Creare lo scaffold del host C++ Windows x64

**Obiettivo**

Produrre un eseguibile nativo autonomo che crea un contesto OpenGL nascosto,
carica dinamicamente projectM e risponde a un health check.

**File coinvolti**

- da creare: `native/projectm-host/CMakeLists.txt`,
  `native/projectm-host/CMakePresets.json`,
  `native/projectm-host/src/main.cpp`,
  `native/projectm-host/src/RenderContext.{h,cpp}`,
  `native/projectm-host/src/ProjectMEngine.{h,cpp}`;
- da modificare: `BUILD_WINDOWS.md`.

**Dipendenze**

- output e manifest di T01;
- MSVC 2022 x64, CMake, projectM shared, GLEW, SDL2, OpenGL.

**Implementazione prevista**

- contesto OpenGL Core su finestra SDL2 nascosta;
- caricamento DLL solo dalla directory verificata;
- creazione/distruzione `projectm_handle`;
- query versione projectM e informazioni GPU;
- FBO BGRA8 ridimensionabile;
- gestione RAII e uscita con codici documentati;
- modalità `--health-check`.

**Test**

- unit test lifecycle create/destroy ripetuto;
- health check su Debug e Release;
- avvio senza DLL, DLL errata e OpenGL non disponibile;
- leak check di handle/processo;
- verifica che nessuna finestra visibile resti aperta.

**Criterio di completamento**

`projectm-host.exe --health-check` restituisce versione projectM reale, versione
OpenGL e stato OK su Windows x64; errori di dipendenza sono espliciti e non
causano crash dell'app.

**Rischi**

- profilo OpenGL non supportato da driver vecchi;
- DLL search order non sicuro;
- differenze fra runtime MSVC presenti sulle macchine target.

**Prerequisiti**

- T01 completata.

## T03 — Implementare protocollo IPC e lifecycle del host

**Obiettivo**

Creare un contratto versionato e robusto tra Electron e il processo C++ senza
binding Node nativi.

**File coinvolti**

- da creare:
  `native/projectm-host/src/Protocol.{h,cpp}`,
  `src/main/projectm/projectMProtocol.ts`,
  `src/main/projectm/projectMHostService.ts`,
  `src/main/projectm/projectMPaths.ts`,
  `tests/projectm-protocol.test.cjs`;
- da modificare: `src/main/main.ts`, `src/main/ipc.ts`,
  `src/preload/preload.ts`, `src/shared/ipc.ts`,
  `src/renderer/global.d.ts`.

**Dipendenze**

- host T02;
- Node stream/child process integrati;
- nessun addon N-API.

**Implementazione prevista**

- header binario con magic, major/minor, tipo, request id e lunghezza;
- handshake con versioni protocollo/projectM/host;
- comandi `createSession`, `configure`, `reset`, `shutdown`;
- canali audio, frame, eventi e log con backpressure;
- limiti payload, parser incrementale e validazione schema;
- timeout, cancel, heartbeat, crash detection e restart;
- path host risolto da `process.resourcesPath`;
- teardown di tutte le sessioni su chiusura app.

**Test**

- pacchetti frammentati e multipli nello stesso chunk;
- header corrotto, payload eccessivo e versione incompatibile;
- timeout, chiusura pipe, crash forzato e restart;
- 1.000 richieste request/response senza perdita;
- nessun listener o processo orfano dopo shutdown.

**Criterio di completamento**

La suite protocollo passa; il main distingue errori applicativi, timeout e crash;
una versione incompatibile viene rifiutata; non restano processi host orfani.

**Rischi**

- deadlock per backpressure;
- race durante shutdown/cancel;
- log binari che contaminano il canale protocollo.

**Prerequisiti**

- T02 completata.

## T04 — Caricare preset `.milk`, texture e renderizzare frame projectM reali

**Obiettivo**

Dimostrare end-to-end che il host interpreta un `.milk` reale con projectM e
restituisce il framebuffer risultante.

**File coinvolti**

- da creare:
  `native/projectm-host/src/PresetValidator.{h,cpp}`,
  `native/projectm-host/tests/projectm_render_tests.cpp`,
  `tests/fixtures/projectm/README.md`;
- da modificare:
  `native/projectm-host/src/ProjectMEngine.{h,cpp}`,
  `native/projectm-host/src/Protocol.{h,cpp}`,
  `src/main/projectm/projectMProtocol.ts`.

**Dipendenze**

- T03;
- almeno un preset reale con licenza utilizzabile nei test;
- API C projectM e contesto OpenGL.

**Implementazione prevista**

- impostare dimensioni, FPS e texture search paths;
- caricare via `projectm_load_preset_file`;
- registrare callback load/switch failure;
- renderizzare con `projectm_opengl_render_frame`;
- leggere l'FBO in BGRA8 con orientamento e stride documentati;
- restituire frame index, dimensioni e hash pixel;
- modalità `--validate` isolata con timeout e almeno un frame reale.

**Test**

- preset reale produce frame non uniforme e variabile;
- preset inesistente, sintassi non valida e texture mancanti;
- resize 540×960 e 1080×1920;
- 300 frame senza errori OpenGL;
- callback di fallimento osservabile;
- confronto che il risultato non sia un frame mock/sintetico.

**Criterio di completamento**

Un preset `.milk` reale viene accettato da projectM 4.1.6 e produce framebuffer
reali verificabili. Un file invalido non viene marcato come caricato.

**Rischi**

- shader dipendenti dal driver;
- lettura FBO lenta;
- differenze di orientamento/alpha;
- preset che richiedono texture non incluse.

**Prerequisiti**

- T03 completata;
- prima approvazione di un fixture in T01.

## T05 — Implementare importazione sicura file/cartella/ZIP

**Obiettivo**

Importare preset e risorse in una staging controllata, impedendo traversal,
ZIP bomb, collisioni Windows, symlink e sovrascritture.

**File coinvolti**

- da creare:
  `src/main/presets/presetImportService.ts`,
  `src/main/presets/zipSecurity.ts`,
  `src/shared/presets.ts`,
  `tests/preset-import.test.cjs`,
  `tests/fixtures/preset-import/*`;
- da modificare: `package.json`, `package-lock.json`, `src/main/ipc.ts`,
  `src/preload/preload.ts`, `src/shared/ipc.ts`,
  `src/renderer/global.d.ts`.

**Dipendenze**

- T01 per formati/licenze;
- T04 per validazione reale;
- libreria ZIP streaming diretta e pinning nel lockfile;
- `node:crypto`, filesystem e dialoghi Electron.

**Implementazione prevista**

- funzioni separate per file, directory e ZIP;
- staging unica per operazione;
- SHA-256 incrementale;
- canonicalizzazione e verifica `path.relative`;
- rifiuto path assoluti/UNC/drive/ADS/NUL/reserved names;
- niente symlink/reparse point;
- limiti su archivio, entry, file, totale, ratio e profondità;
- allowlist `.milk` e texture supportate;
- file aperti in modalità create-new;
- validazione `projectm-host --validate`;
- promozione atomica o rollback completo;
- risultato dettagliato per ogni preset.

**Test**

- import `.milk` valido;
- cartella annidata e nome Unicode;
- `../`, path assoluto, UNC, drive letter e slash misti;
- collisione case-insensitive e nomi riservati;
- entry symlink, ZIP64, ZIP bomb simulata, troppe entry;
- file duplicati, parziali e cancellazione;
- crash/timeout del validatore;
- conferma che nessun file esca dalla staging root.

**Criterio di completamento**

Tutti i fixture ostili sono rifiutati senza scritture esterne o residue; un
pacchetto valido viene promosso soltanto dopo il render projectM reale.

**Rischi**

- metadati ZIP ambigui;
- cleanup bloccato da antivirus;
- texture necessarie con estensioni non ancora inventariate.

**Prerequisiti**

- T01 e T04 completate.

## T06 — Creare libreria preset, metadati e quarantena

**Obiettivo**

Fornire un catalogo persistente, ricercabile e resistente ai crash per preset
importati, duplicati, texture, licenze e stato di validazione.

**File coinvolti**

- da creare:
  `src/main/presets/presetLibraryService.ts`,
  `tests/preset-library.test.cjs`;
- da modificare:
  `src/shared/presets.ts`, `src/main/ipc.ts`,
  `src/preload/preload.ts`, `src/shared/ipc.ts`,
  `src/renderer/global.d.ts`, `PRESET_LICENSES.md`.

**Dipendenze**

- T05;
- directory `app.getPath("userData")`;
- scrittura JSON atomica.

**Implementazione prevista**

- schema catalogo versionato;
- ID stabile e content-addressed storage per SHA-256;
- indici in memoria per hash/nome/tag/preferito/stato;
- metadati fonte, autore, licenza, texture e versione projectM testata;
- rilevamento duplicati;
- stati `valid`, `warning`, `quarantined`, `missing`, `incompatible`;
- write temp + flush + rename e backup ultimo catalogo valido;
- API query/paginazione/filtro;
- rimozione recuperabile dalla libreria senza cancellare file arbitrari;
- log di quarantena e tentativo di rivalidazione.

**Test**

- catalogo vuoto, migrazione e round-trip;
- crash simulato durante scrittura;
- duplicato per hash con nomi diversi;
- file mancante o modificato esternamente;
- ricerca Unicode/case-insensitive;
- quarantena e ripristino;
- 10.000 record sintetici entro le soglie prestazionali concordate.

**Criterio di completamento**

Il catalogo sopravvive a riavvio e scrittura interrotta; duplicati e file
alterati sono riconosciuti; un preset quarantinato non può essere caricato
silenziosamente.

**Rischi**

- concorrenza fra import e query;
- crescita JSON oltre le previsioni;
- cancellazione asset condivisi fra preset.

**Prerequisiti**

- T05 completata.

## T07 — Implementare browser libreria e controlli preset

**Obiettivo**

Esporre libreria, import e selezione reale nell'interfaccia, senza controlli
decorativi o placeholder.

**File coinvolti**

- da creare:
  `src/renderer/presets/presetLibraryView.ts`;
- da modificare:
  `src/renderer/app.ts`, `src/renderer/index.html`,
  `src/renderer/styles.css`, `src/renderer/state.ts`,
  `src/preload/preload.ts`, `src/renderer/global.d.ts`.

**Dipendenze**

- T06;
- API preload tipizzate.

**Implementazione prevista**

- pannello libreria con ricerca, tag, preferiti e stato;
- import file/cartella/ZIP con rapporto per-item;
- selezione preset reale collegata alla sessione host;
- precedente/successivo/casuale/automatico/lock;
- durata e transizione;
- badge texture mancanti/quarantena/licenza non verificata;
- nessun accesso filesystem diretto dal renderer;
- focus, tastiera e messaggi di errore accessibili.

**Test**

- component/integration test degli stati;
- import valido e fallito;
- selezione e callback host;
- disabilitazione corretta senza sessione/audio;
- libreria grande, ricerca Unicode e riavvio;
- verifica manuale accessibilità e DPI Windows.

**Criterio di completamento**

Ogni controllo visibile produce un comando verificabile al host o una modifica
persistita; errori e quarantena sono visibili; non esiste UI finta.

**Rischi**

- UI bloccata da scansioni;
- troppi eventi frame/stato;
- selezione concorrente durante una transizione.

**Prerequisiti**

- T06 completata.

## T08 — Passare PCM reale a projectM con clock deterministico

**Obiettivo**

Alimentare projectM con gli stessi campioni audio, nello stesso ordine, in
preview ed export.

**File coinvolti**

- da creare:
  `native/projectm-host/src/PcmScheduler.{h,cpp}`,
  `native/projectm-host/tests/pcm_scheduler_tests.cpp`,
  `src/shared/projectm.ts`,
  `tests/projectm-audio.test.cjs`;
- da modificare:
  `src/renderer/audioEngine.ts`,
  `src/renderer/app.ts`,
  `src/main/projectm/projectMHostService.ts`,
  `src/main/projectm/projectMProtocol.ts`,
  `src/shared/ipc.ts`, `src/preload/preload.ts`.

**Dipendenze**

- T04;
- audio PCM decodificato Float32 stereo;
- API `projectm_pcm_get_max_samples` e `projectm_pcm_add_float`.

**Implementazione prevista**

- normalizzazione mono/stereo e sample rate definito;
- campioni indicizzati dall'origine;
- formula razionale campioni/frame senza drift;
- chunk entro il massimo projectM;
- invio PCM prima del frame corrispondente;
- pausa senza avanzamento;
- reset/seek con pre-roll configurato;
- backpressure e metriche di ritardo;
- export con decode FFmpeg f32le e identica schedulazione.

**Test**

- 44,1 e 48 kHz a 30 e 60 FPS;
- audio mono e stereo;
- durata non multipla del frame;
- nessun campione perso/duplicato e drift zero a 10 minuti;
- pausa/ripresa/seek;
- risposta visiva diversa fra silenzio, bassi e alte frequenze;
- hash dei blocchi PCM uguali tra preview test-mode ed export.

**Criterio di completamento**

I log dimostrano corrispondenza campione-frame e projectM reagisce al PCM reale.
Nessuna statistica `AnalyserNode` viene usata come sostituto del PCM.

**Rischi**

- copie IPC e garbage collection;
- differenze fra decoder browser e FFmpeg;
- seek projectM non perfettamente ricostruibile senza pre-roll.

**Prerequisiti**

- T04 completata.

## T09 — Aggiungere projectM come livello della preview

**Obiettivo**

Mostrare il framebuffer projectM reale nello stack visuale, preservando overlay
Canvas, copertina, testi, ordine, opacità e blend.

**File coinvolti**

- da creare:
  `src/renderer/projectm/projectMPreviewController.ts`,
  `src/renderer/composition/sceneComposer.ts`;
- da modificare:
  `src/renderer/previewRenderer.ts`,
  `src/renderer/app.ts`,
  `src/renderer/state.ts`,
  `src/renderer/plugins/types.ts`,
  `src/shared/project.ts`,
  `src/shared/projectm.ts`,
  `src/preload/preload.ts`.

**Dipendenze**

- T07 e T08;
- frame BGRA8 dal host;
- API Canvas `ImageData`/bitmap.

**Implementazione prevista**

- nuovo `LayerKind`/riferimento projectM;
- conversione BGRA/RGBA e orientamento una sola volta;
- rendering secondo ordine layer;
- opacità, visibilità, intervallo e blend mode;
- preview resolution-aware;
- massimo un frame in volo e consegna latest-frame;
- indicatore host/preset/FPS senza sovrapporlo all'export;
- fallback solo come errore visibile, mai come falso projectM.

**Test**

- projectM sopra/sotto overlay;
- cover e testi sopra projectM;
- hide/opacity/blend/intervallo;
- resize, 30/60 FPS e DPI;
- host lento/crash e recupero;
- ispezione pixel che dimostra presenza congiunta dei layer.

**Criterio di completamento**

La preview mostra un preset `.milk` realmente renderizzato e consente tutti gli
overlay esistenti nello stesso stack. Host assente o preset fallito è segnalato.

**Rischi**

- consumo CPU della copia frame;
- allocazioni per-frame;
- tearing o frame fuori ordine.

**Prerequisiti**

- T07 e T08 completate.

## T10 — Cambio manuale, casuale, automatico e transizioni

**Obiettivo**

Gestire tutte le modalità di selezione e rendere la sequenza riproducibile
nell'export.

**File coinvolti**

- da creare:
  `src/main/projectm/presetScheduler.ts`,
  `tests/projectm-scheduler.test.cjs`;
- da modificare:
  `src/shared/projectm.ts`,
  `src/shared/project.ts`,
  `src/main/projectm/projectMHostService.ts`,
  `src/renderer/presets/presetLibraryView.ts`,
  `src/renderer/app.ts`,
  `native/projectm-host/src/ProjectMEngine.{h,cpp}`.

**Dipendenze**

- T09;
- projectM playlist API e transition API;
- PRNG deterministico.

**Implementazione prevista**

- comandi manuali previous/next/select;
- shuffle deterministico con seed e no-repeat;
- auto-switch a frame index;
- lock;
- hard cut e smooth transition;
- soft-cut duration, preset duration e beat hard-cut;
- callback switch/failure con aggiornamento schedule;
- policy deterministica per preset fallito;
- snapshot dello schedule per export.

**Test**

- manuale avanti/indietro;
- stessa sequenza con stesso seed, diversa con seed diverso;
- cambio automatico ai frame previsti a 30/60 FPS;
- lock;
- transizione 0, durata nominale e valori limite;
- preset fallito durante transizione;
- preview/export con schedule identico.

**Criterio di completamento**

Tutte le modalità funzionano con preset reali; sequenza e transizioni sono
registrate e riproducibili; nessun timer UI decide autonomamente l'export.

**Rischi**

- callback asincrone fuori ordine;
- differenze di durata interna projectM;
- leak durante molti cambi, incluso rischio upstream.

**Prerequisiti**

- T09 completata.

## T11 — Rendere deterministici gli overlay e unificare il compositore

**Obiettivo**

Usare esattamente lo stesso codice di compositing per preview ed export.

**File coinvolti**

- da creare:
  `src/renderer/composition/seededRandom.ts`,
  `tests/scene-composer.test.cjs`;
- da modificare:
  `src/renderer/composition/sceneComposer.ts`,
  `src/renderer/previewRenderer.ts`,
  `src/renderer/plugins/*.ts`,
  in particolare `src/renderer/plugins/particleBurst.ts`,
  `src/shared/project.ts`.

**Dipendenze**

- T09 e T10;
- Canvas 2D in renderer visibile e offscreen.

**Implementazione prevista**

- estrarre `SceneComposer` puro rispetto alla UI;
- dipendenze esplicite per tempo, frame, audio, asset e random;
- sostituire `Math.random()` con PRNG seedato;
- pre-caricare font/cover/texture;
- coordinate normalizzate e scaling comune;
- rendere ordinamento, blend e intervalli un'unica implementazione;
- snapshot immutabile del progetto.

**Test**

- stesso input/seed produce stessi pixel;
- layer order, opacity, blend e intervalli;
- tutti i sei plugin Canvas;
- cover/testi;
- 540×960 e 1080×1920;
- nessun accesso implicito a clock o random globale.

**Criterio di completamento**

Preview e harness offscreen producono lo stesso raw composite per gli stessi
input; tutti gli overlay preesistenti restano disponibili.

**Rischi**

- plugin con stato globale;
- differenze di font rasterization;
- uso involontario di `performance.now()`/`Math.random()`.

**Prerequisiti**

- T09 e T10 completate.

## T12 — Estendere salvataggio, migrazione e validazione progetto

**Obiettivo**

Salvare integralmente impostazioni projectM, preset, seed, schedule, transizioni
e layer senza rompere i progetti 2.0.

**File coinvolti**

- da modificare:
  `src/shared/project.ts`, `src/shared/projectm.ts`,
  `src/renderer/state.ts`, `src/main/ipc.ts`,
  `tests/phase2.test.cjs`;
- da creare:
  `tests/projectm-project-schema.test.cjs`.

**Dipendenze**

- modello definito da T10;
- IDs e hash di libreria da T06.

**Implementazione prevista**

- incrementare versione schema;
- default projectM disattivato per migrazione 2.0;
- validazione range e union;
- riferimenti per ID/hash e stato asset mancante;
- round-trip senza path temporanei/session id;
- migrazione idempotente;
- snapshot schedule/export.

**Test**

- open/save/open completo;
- migrazione 2.0;
- campi mancanti/sconosciuti e valori fuori range;
- preset mancante/modificato;
- stessa serializzazione semantica dopo due migrazioni;
- progetto con Unicode e lista ampia.

**Criterio di completamento**

Dopo riavvio il progetto ricostruisce la stessa sessione, impostazioni e
sequenza. Un riferimento mancante genera richiesta di ripristino, non una
sostituzione silenziosa.

**Rischi**

- schema troppo accoppiato al catalogo locale;
- progetto non portabile;
- schedule molto grande.

**Prerequisiti**

- T06 e T10 completate.

## T13 — Rifare l'export MP4 con projectM e compositore condiviso

**Obiettivo**

Esportare MP4 che riproduca il frame composito della preview, includendo
projectM reale e tutti i layer Canvas.

**File coinvolti**

- da creare:
  `src/main/offscreenExportService.ts`,
  `src/renderer/export/offscreenEntry.ts`,
  `src/renderer/export/offscreen.html`,
  `tests/projectm-parity.test.cjs`;
- da modificare:
  `src/main/exportService.ts`, `src/main/main.ts`, `src/main/ipc.ts`,
  `src/shared/ipc.ts`, `vite.config.ts`, `package.json`,
  `src/renderer/composition/sceneComposer.ts`.

**Dipendenze**

- T08, T10, T11 e T12;
- FFmpeg scelto in T01;
- renderer Electron offscreen;
- host projectM dedicato all'export.

**Implementazione prevista**

- snapshot immutabile e asset hash check;
- decode audio PCM;
- sessione projectM nuova da frame zero;
- request/ack sequenziale senza frame dropping;
- `SceneComposer` nel renderer offscreen;
- raw RGBA con backpressure a FFmpeg;
- conversione NV12/yuv420p e `h264_mf`;
- mux audio e durata guidata dall'audio;
- progress basato sui frame confermati;
- cancel/cleanup e output `.partial` promosso solo a successo;
- rimozione del vecchio fallback `showfreqs` come percorso equivalente.

**Test**

- export con ognuno dei 10 preset;
- overlay multipli, cover e testi;
- 30 e 60 FPS;
- audio 44,1/48 kHz e durata non intera;
- transizioni/schedule;
- cancel e crash host;
- SSIM raw preview/offscreen e MP4 decodificato;
- A/V sync entro un frame;
- nessun file finale falso su errore.

**Criterio di completamento**

L'MP4 contiene projectM reale e l'intero stack; supera i gate di parità e sync;
il percorso non usa `showfreqs`/`showwaves` per imitare projectM.

**Rischi**

- throughput raw frame;
- memoria del renderer offscreen;
- encoder Media Foundation diverso per hardware;
- conversioni colore/alpha.

**Prerequisiti**

- T08, T10, T11 e T12 completate.

## T14 — Packaging, corpus di 10 preset, soak test e gate finale

**Obiettivo**

Certificare l'intera Fase 2 in build sviluppatore, unpacked, NSIS e portable su
Windows x64, incluse licenze e parità.

**File coinvolti**

- da creare:
  `tests/projectm-packaging.test.cjs`,
  `tests/fixtures/projectm/manifest.json`,
  `test-results/phase2-projectm/*`;
- da modificare:
  `package.json`, `package-lock.json`,
  `PHASE_2_TEST_PLAN.md`, `PHASE_2_TEST_RESULTS.md`,
  `PHASE_2_REPORT.md`, `PROJECTM_INTEGRATION.md`,
  `THIRD_PARTY_LICENSES.md`, `PRESET_LICENSES.md`,
  `README.md`, `BUILD_WINDOWS.md`.

**Dipendenze**

- T01–T13;
- 10 preset reali con licenza e texture verificate;
- macchina/VM Windows x64 pulita;
- GPU/driver di almeno Intel e un secondo vendor target;
- firma codice per artefatti release.

**Implementazione prevista**

- includere EXE/DLL/manifest/licenze in `extraResources`, fuori ASAR;
- risoluzione path tramite `process.resourcesPath`;
- hash check e health check installato;
- test automatici del corpus;
- soak preview 30 minuti e cambi preset ripetuti;
- export lungo almeno 10 minuti;
- monitor memoria, handle, CPU/GPU, frame time e crash;
- test NSIS/portable senza Node/VS/CMake installati;
- raccolta log e matrice evidenze per ognuno dei 13 obiettivi bloccanti;
- aggiornamento documentazione solo con risultati realmente osservati.

**Test**

- build pulita e suite completa;
- 10/10 preset load/render/audio/transition/export;
- import fixture ostili;
- preview/export SSIM e A/V sync;
- restart host e quarantena;
- installer install/uninstall e portable da path con spazi/Unicode;
- DLL projectM sostituita con build ABI compatibile e health check;
- inventario licenze presente nel pacchetto;
- `ffmpeg -buildconf` del binario distribuito.

**Criterio di completamento**

Tutti i test obbligatori passano con evidenze salvate; zero preset testati sono
mock; installer e portable sono autonomi; licenze approvate; nessun P0/P1
aperto; il rapporto finale può dichiarare chiusa la Fase 2 senza eccezioni.

**Rischi**

- differenze hardware/driver non emerse in CI;
- leak dopo numerosi cambi manuali;
- firma o antivirus;
- preset/texture con licenze incomplete;
- performance export inferiore alla soglia concordata.

**Prerequisiti**

- T01–T13 completate.

## Gate di avanzamento

- Non iniziare T05–T14 se T04 non prova il rendering di un `.milk` reale.
- Non dichiarare la preview completa se il layer projectM è un'immagine
  preregistrata o un Canvas sostitutivo.
- Non dichiarare l'export completo se usa ancora `showfreqs`/`showwaves` al
  posto del frame projectM.
- Non includere i 10 preset nel pacchetto senza manifest licenze per-file.
- Non iniziare la Fase 3 finché T14 non è completata.
