# Piano di completamento della Fase 2

> Documento storico pre-implementazione. Le descrizioni dello stato iniziale non rappresentano il codice corrente; l’audit finale è in `PHASE_2_REPORT.md`.

Stato: **analisi tecnica completata; implementazione non iniziata**  
Data: 28 luglio 2026  
Ambito: chiusura integrale della Fase 2. La Fase 3 resta bloccata.

## Sintesi esecutiva

La Fase 2 non è completa. Il repository possiede un editor Electron funzionante
con visualizzatori Canvas e un export FFmpeg separato, ma non contiene projectM,
un loader `.milk`, una libreria preset o un percorso di rendering comune tra
preview ed export.

La soluzione raccomandata è un **host C++ Windows x64 separato** che usa
dinamicamente libprojectM 4.1.6 e comunica con Electron tramite un protocollo
IPC versionato. projectM genera il layer base; un unico compositore Canvas
TypeScript applica sopra gli overlay esistenti, copertina e testi sia nella
preview sia in un renderer offscreen usato dall'export.

## Architettura attuale

### Runtime e sicurezza

- applicazione: `audio-visualizer-studio` 0.2.0;
- Electron dichiarato: `^37.2.0`;
- Electron installato e bloccato dal lockfile: **37.10.3**;
- Electron Builder: 26.15.3 installato;
- TypeScript: 5.9.3 installato;
- Vite: 7.3.6 installato;
- FFmpeg: `ffmpeg-static` 5.3.0 installato, binario FFmpeg 6.1.1 GPL;
- finestra Electron con `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: false`;
- bridge preload limitato a dialoghi, lettura media, progetto ed export.

### Rendering attuale

`src/renderer/previewRenderer.ts` rende su Canvas 2D. Il modello
`src/shared/project.ts` definisce layer visualizer, cover e testi. Sei plugin
Canvas sono registrati in `src/renderer/plugins/visualizerHost.ts`:

- Spectrum Bars;
- Circular Spectrum;
- Waveform Line;
- Particle Burst;
- Pulse Shapes;
- Dynamic Vignette.

I layer hanno visibilità, opacità, blend mode, intervallo e parametri reattivi.
Copertina e testi sono composti nel renderer. Non esistono WebGL projectM,
OpenGL, framebuffer esterni o `.milk`.

### Pipeline audio attuale

`src/renderer/audioEngine.ts`:

1. legge il file come byte tramite IPC;
2. crea un Blob e un elemento `HTMLAudioElement`;
3. decodifica una copia con `decodeAudioData` per la waveform;
4. collega l'elemento a `MediaElementAudioSourceNode`;
5. usa `AnalyserNode` (`fftSize` 512, smoothing 0,72);
6. estrae spettro e dominio temporale a 8 bit;
7. calcola volume, bassi, medi e alti per i plugin Canvas.

Il PCM interleaved non esce dal renderer e non può alimentare projectM.

### Pipeline export attuale

`src/main/exportService.ts` avvia FFmpeg e costruisce un grafo autonomo:

- `showfreqs` o `showwaves` per il visualizzatore;
- colore di sfondo;
- cover via `overlay`;
- testi via `drawtext`;
- vignetta;
- `libx264` e AAC in MP4.

Non esegue `PreviewRenderer` né i plugin Canvas. Di conseguenza la parità è
strutturalmente impossibile: il file esportato non è la registrazione del frame
composito mostrato in preview.

### Persistenza e packaging attuali

- schema progetto: versione 2.0, senza projectM/preset/seed/schedule;
- storage libreria preset: assente;
- import file/cartella/ZIP: assente;
- packaging: NSIS e portable;
- file inclusi: `dist`, `package.json`, licenze correnti;
- `ffmpeg-static` viene estratto da ASAR;
- binari projectM: assenti.

## Gap rispetto agli obiettivi bloccanti

| Obiettivo | Stato attuale | Chiusura prevista |
|---|---|---|
| Integrazione projectM reale | Assente | host C++ + DLL projectM |
| Preset `.milk` reali | Assente | API `projectm_load_preset_file` e validazione host |
| Audio a projectM | Assente | PCM Float32 stereo indicizzato per campione |
| Preview projectM | Assente | frame BGRA come layer del `SceneComposer` |
| Export projectM | Assente | stessa sessione host in modalità frame-step |
| Import sicuro | Assente | staging, limiti ZIP, canonicalizzazione, hash, quarantena |
| Libreria preset | Assente | catalogo JSON atomico, file gestiti e metadati |
| Cambio manuale/casuale/automatico | Assente | scheduler persistito e comandi playlist |
| Transizioni | Assente | smooth load projectM e durata soft-cut persistita |
| Salvataggio impostazioni | Assente | schema progetto successivo con migrazione |
| 10 preset reali | 0 | corpus con licenze e test automatici/manuali |
| Parità preview/export | Non presente | compositore Canvas unico e confronti frame |
| Licenze | Bloccante | projectM LGPL dinamica, preset per-file, nuova strategia FFmpeg |

## Punto di integrazione projectM

### Main process

Il main deve possedere:

- lifecycle del host projectM;
- verifica manifest/hash;
- named pipe e protocollo;
- importazione e catalogo preset;
- validazione file in processo isolato;
- sessione export;
- log e crash recovery.

Il main non deve interpretare `.milk` e non deve implementare formule MilkDrop:
questa responsabilità resta esclusivamente a projectM.

### Preload

Il preload espone API tipizzate e limitate per:

- import preset/file/cartella/ZIP;
- query libreria;
- creazione/configurazione sessione preview;
- cambio preset e lock;
- consegna frame/eventi;
- avvio/cancellazione export.

Non espone `child_process`, filesystem arbitrario, pipe o path nativi.

### Renderer

Il renderer:

- presenta browser, ricerca, filtri, preferiti e stato preset;
- orchestra la preview;
- invia PCM e frame index tramite il bridge;
- disegna il framebuffer projectM come un normale livello Canvas;
- continua a disegnare gli overlay esistenti sopra o sotto secondo l'ordine;
- mostra errori e quarantena senza mascherarli.

### Export

L'export viene rifatto come pipeline raw-frame:

```text
audio -> decoder PCM -> projectm-host -> frame projectM
                                      -> SceneComposer offscreen
                                      -> frame RGBA -> FFmpeg -> MP4
audio -------------------------------------------------------> mux
```

La vecchia sintesi `showfreqs`/`showwaves` non è più il percorso primario e non
può essere usata come fallback dichiarato equivalente a projectM.

## Soluzione Windows x64

### Componenti nativi

- Visual Studio 2022 Build Tools, toolset MSVC x64;
- CMake con preset riproducibile;
- libprojectM 4.1.6, shared;
- libreria playlist projectM, shared;
- OpenGL di sistema;
- GLEW;
- SDL2 per il contesto OpenGL nascosto;
- Microsoft Visual C++ Redistributable o runtime redistribuito nei termini
  ammessi;
- CTest/unit test nativi.

### Componenti TypeScript

- servizio lifecycle/protocollo host;
- decoder/coordinatore PCM;
- catalogo e importatore preset;
- modello projectM/preset;
- `SceneComposer` condiviso;
- renderer offscreen export;
- API preload e UI libreria.

Per l'import ZIP va aggiunta come dipendenza diretta una libreria streaming
pure JavaScript con supporto ZIP64 e controllo per-entry, per esempio `yauzl`.
L'uso deve essere diretto e bloccato nel lockfile; non si deve dipendere da una
presenza transitiva accidentale.

## Modello dati previsto

Il nuovo schema deve includere almeno:

```ts
interface ProjectMSettings {
  enabled: boolean;
  libraryPresetIds: string[];
  activePresetId: string | null;
  selectionMode: "manual" | "random" | "automatic";
  randomSeed: string;
  presetDurationSeconds: number;
  transitionMode: "hard" | "smooth";
  transitionDurationSeconds: number;
  beatSensitivity: number;
  hardCutEnabled: boolean;
  hardCutDurationSeconds: number;
  hardCutSensitivity: number;
  locked: boolean;
  textureSearchPathIds: string[];
  schedule: PresetScheduleEntry[];
}
```

Ogni riferimento usa un ID di libreria stabile e SHA-256, non soltanto un path
assoluto. La migrazione dai progetti 2.0 deve aggiungere impostazioni disattivate
senza alterare il visual corrente.

Lo schedule effettivo deve essere persistito quando necessario per assicurare
che una preview casuale sia riproducibile nell'export.

## Libreria e import sicuro

### Layout

Nel `userData` dell'app:

```text
presets/
  library.json
  objects/<sha256>/preset.milk
  objects/<sha256>/textures/...
  thumbnails/
  staging/
  quarantine/
  logs/
```

Il catalogo è JSON versionato, scritto con file temporaneo + flush + rename
atomico. È caricato in memoria e indicizzato per ID, hash, nome, autore, tag e
stato. Questa scelta evita un'altra dipendenza nativa Electron; SQLite potrà
essere valutato solo dopo misure reali di scala.

### Import file

- accetta `.milk` case-insensitive;
- calcola SHA-256;
- copia in staging, non usa direttamente il file originale;
- limita dimensione e lunghezza path;
- effettua una prevalidazione testuale senza dichiararla parsing MilkDrop;
- avvia `projectm-host --validate` con timeout;
- promuove atomicamente solo dopo caricamento e almeno un frame valido;
- identifica duplicati per hash;
- registra origine e licenza dichiarata senza inventarla.

### Import cartella

- scansione iterativa con limiti di profondità e quantità;
- nessun follow di symlink/reparse point;
- preserva soltanto le risorse relative ammesse;
- canonicalizza ogni destinazione;
- ogni preset è un risultato indipendente;
- errori e texture mancanti vengono riportati.

### Import ZIP

Valori iniziali configurabili:

- massimo 256 MiB di archivio;
- massimo 10.000 entry;
- massimo 32 MiB per file;
- massimo 512 MiB non compressi totali;
- rapporto di compressione massimo 100:1;
- profondità massima 16.

Sono rifiutati:

- path assoluti, UNC e drive letter;
- `..` dopo normalizzazione;
- NUL, alternate data stream e nomi Windows riservati;
- symlink e reparse point;
- entry duplicate con collisione case-insensitive;
- file eseguibili/script e formati non ammessi;
- destinazioni che escono dalla staging root.

L'estrazione usa create-new, non sovrascrive file, non invoca shell e viene
cancellata integralmente su fallimento.

### Quarantena

Un preset passa in quarantena se:

- fa terminare il host;
- supera timeout di load/render;
- causa errore shader/load bloccante;
- supera limiti di risorsa;
- contiene risorse non sicure;
- fallisce ripetutamente la validazione.

Quarantena non significa cancellazione. UI e log mostrano motivo, timestamp,
hash e versione projectM. Il ripristino richiede nuova validazione.

## Cambio preset e transizioni

- **manuale**: selezione, precedente, successivo; può essere hard o smooth;
- **casuale**: PRNG deterministico dell'app e seed persistito, evitando
  ripetizioni immediate;
- **automatico**: durata per preset e schedule basato su frame, non timer UI;
- **lock**: impedisce i cambi automatici;
- **transizione**: `projectm_load_preset_file(..., smooth_transition=true)` e
  `projectm_set_soft_cut_duration`;
- **hard cut beat-driven**: opzionale tramite parametri projectM, salvati;
- **errore preset**: il successivo valido è scelto con policy registrata, mai
  con un cambio invisibile non riproducibile.

Preview ed export ricevono lo stesso schedule in termini di frame index.

## Parità preview/export

### Regola

La parità non significa “effetto simile”: significa stessa configurazione,
stesso PCM, stesso ordine layer, stesso frame index, stessi asset, stessi seed e
stesso codice di compositing.

### Meccanismi

- `SceneComposer` unico;
- PRNG seedato al posto di `Math.random()` negli effetti;
- font e immagini caricati prima del primo frame;
- risoluzione indipendente tramite coordinate normalizzate;
- frame projectM generati in sequenza a FPS fissato;
- schedule preset espresso in frame;
- export avviato da una snapshot immutabile del progetto;
- hash di preset e asset verificati prima dell'export;
- nessun filtro FFmpeg sostitutivo per i layer visuali.

### Criteri misurabili

- il raw composite prodotto dal renderer visibile e quello offscreen allo stesso
  frame devono essere byte-identici quando GPU, risoluzione e build coincidono,
  oppure superare SSIM 0,99 se il percorso di cattura introduce conversioni;
- il frame decodificato dall'MP4 deve superare una soglia SSIM definita per il
  codec, inizialmente 0,97, senza layer mancanti;
- timestamp audio/video entro un frame per tutta la durata;
- stessa sequenza e stessi intervalli preset nei log preview/export;
- test a 30 e 60 FPS, inclusi seek, pausa, cambio e transizione.

Le soglie vanno confermate con il corpus reale prima di diventare gate CI.

## Strategia test con almeno 10 preset reali

Il corpus non può essere “preso da Internet” senza provenienza. Per ogni preset:

- file `.milk` reale;
- autore/progetto se noto;
- URL sorgente;
- licenza esplicita;
- hash SHA-256;
- eventuali texture e relative licenze;
- note di compatibilità.

La suite minima copre:

1. preset semplice senza texture;
2. custom wave;
3. custom shape;
4. shader warp;
5. shader composite;
6. megabuf/loop/regXX;
7. texture relativa;
8. preset con nome/path Unicode;
9. preset pesante;
10. preset con transizione verso un altro preset.

Non si dichiareranno dieci preset testati finché i dieci file e le loro licenze
non saranno presenti nel corpus controllato.

Test:

- load e primo frame;
- 300 frame con PCM sintetico multibanda;
- cambio hard e smooth;
- precedente/successivo/random/automatico;
- preview/export;
- packaging installato e portable;
- soak test di cambi ripetuti con memoria/handle/GDI monitorati;
- preset invalido, ZIP malevolo e crash recovery.

## Licenze

### projectM

projectM core è LGPL-2.1. La libreria deve essere dinamica, separata e
sostituibile. Il pacchetto deve includere testo licenza, notice, versione,
hash, link al sorgente corrispondente, istruzioni di sostituzione e patch.
Ogni dipendenza transitiva nativa va inventariata.

### Preset

La compatibilità MilkDrop non concede il diritto di redistribuire i preset.
Nessun preset o texture entra in installer/catalogo senza licenza esplicita.
Gli import manuali restano locali; l'app registra “licenza non verificata” e
non trasforma tale stato in autorizzazione alla redistribuzione.

### FFmpeg

Il build corrente è GPL e usa libx264. È un blocco di release. Il piano prevede
un build FFmpeg LGPL riproducibile senza componenti GPL e H.264 tramite
Media Foundation, con verifica `-buildconf`, sorgenti e notice. Se questa strada
non soddisfa i requisiti tecnici, deve essere presa una decisione legale/prodotto
esplicita prima di distribuire; non si mantiene silenziosamente l'attuale
binario.

Riferimenti:

- [projectM ufficiale](https://github.com/projectM-visualizer/projectm);
- [release projectM](https://github.com/projectM-visualizer/projectm/releases);
- [FFmpeg legal](https://ffmpeg.org/legal.html);
- [FFmpeg MediaFoundation](https://ffmpeg.org/ffmpeg-codecs.html#MediaFoundation).

## File da creare

Percorsi definitivi da confermare durante l'attività di scaffolding:

```text
native/projectm-host/CMakeLists.txt
native/projectm-host/CMakePresets.json
native/projectm-host/src/main.cpp
native/projectm-host/src/ProjectMEngine.{h,cpp}
native/projectm-host/src/RenderContext.{h,cpp}
native/projectm-host/src/Protocol.{h,cpp}
native/projectm-host/src/PcmScheduler.{h,cpp}
native/projectm-host/src/PresetValidator.{h,cpp}
native/projectm-host/tests/*
native/projectm-host/third-party-lock.json
src/main/projectm/projectMHostService.ts
src/main/projectm/projectMProtocol.ts
src/main/projectm/projectMPaths.ts
src/main/presets/presetImportService.ts
src/main/presets/presetLibraryService.ts
src/main/presets/zipSecurity.ts
src/main/offscreenExportService.ts
src/renderer/projectm/projectMPreviewController.ts
src/renderer/composition/sceneComposer.ts
src/renderer/composition/seededRandom.ts
src/renderer/presets/presetLibraryView.ts
src/shared/projectm.ts
src/shared/presets.ts
tests/fixtures/projectm/*
tests/fixtures/preset-import/*
tests/projectm-protocol.test.cjs
tests/preset-import.test.cjs
tests/projectm-parity.test.cjs
tests/projectm-packaging.test.cjs
licenses/projectM/*
licenses/FFmpeg/*
licenses/presets/*
```

## File da modificare

```text
package.json
package-lock.json
src/main/main.ts
src/main/ipc.ts
src/main/exportService.ts
src/preload/preload.ts
src/renderer/app.ts
src/renderer/audioEngine.ts
src/renderer/previewRenderer.ts
src/renderer/state.ts
src/renderer/global.d.ts
src/renderer/index.html
src/renderer/styles.css
src/renderer/plugins/types.ts
src/renderer/plugins/visualizerHost.ts
src/renderer/plugins/particleBurst.ts
src/shared/ipc.ts
src/shared/project.ts
tests/phase2.test.cjs
THIRD_PARTY_LICENSES.md
PRESET_LICENSES.md
README.md
BUILD_WINDOWS.md
```

`src/main/exportService.ts` potrà diventare un coordinatore sottile o essere
sostituito da `offscreenExportService.ts`; l'eliminazione verrà decisa solo
dopo la migrazione e i test di regressione.

## Strategia di implementazione

Ordine obbligatorio:

1. congelare versioni, licenze e criteri di accettazione;
2. prototipo host: contesto OpenGL, preset reale, PCM reale, frame reale;
3. protocollo e lifecycle robusti;
4. libreria/import sicuro;
5. modello progetto e UI preset;
6. layer projectM nella preview;
7. scheduler/transizioni;
8. compositore condiviso deterministico;
9. export offscreen raw-frame;
10. packaging;
11. corpus e suite completa;
12. gate licenze e chiusura documentata.

Non si costruisce prima la UI “finta”: ogni controllo projectM visibile deve
essere collegato al host reale o restare fuori dalla release.

## Rischi e mitigazioni

| Rischio | Probabilità/Impatto | Mitigazione |
|---|---|---|
| Crash o leak projectM/preset | Media/Alta | isolamento processo, watchdog, quarantena, soak test |
| Driver OpenGL incompatibile | Media/Alta | probe startup, diagnostica GPU, test multi-vendor |
| Banda frame raw | Media/Alta | preview ridotta, backpressure, 30 FPS default, profiling, futura shared memory |
| Divergenza preview/export | Alta/Alta | unico `SceneComposer`, schedule/seed/PCM deterministici |
| Seek non identico allo stato storico | Media/Media | reset + pre-roll definito; export sempre da zero |
| ZIP traversal/bomb | Media/Alta | staging, limiti, canonicalizzazione, niente shell/symlink |
| Preset senza licenza | Alta/Alta | nessuna redistribuzione, manifest per-file, gate release |
| FFmpeg GPL corrente | Certa/Alta | sostituzione build o decisione legale esplicita |
| Encoder Media Foundation variabile | Media/Alta | capability probe e matrice test software/hardware |
| Aggiornamenti Electron | Media/Media | nessun addon projectM; protocollo esterno |
| Random non deterministico | Certa/Media | PRNG seedato e schedule persistito |
| Antivirus/firma binari | Media/Media | code signing, path stabile, niente temp EXE |

## Gate di completamento della Fase 2

La Fase 2 sarà completa soltanto quando:

- un build pulito contiene projectM reale e ne riporta versione 4.1.6;
- almeno 10 `.milk` reali e licenziati superano i test;
- PCM reale raggiunge projectM;
- il layer projectM è visibile nella preview e nell'MP4;
- overlay Canvas, cover e testi restano componibili;
- manuale, casuale, automatico, lock e transizioni funzionano;
- impostazioni, seed, schedule e riferimenti preset sopravvivono a save/open;
- import file/cartella/ZIP supera i test di sicurezza;
- crash/timeout/preset invalido sono gestiti senza successo falso;
- preview ed export superano i criteri di parità;
- installer e portable funzionano su Windows x64 pulito;
- licenze projectM, dipendenze, preset e FFmpeg sono approvate e incluse;
- non esistono mock o fallback Canvas dichiarati come projectM;
- tutti i task in `PHASE_2_TASKS.md` risultano chiusi con evidenze.

Fino a quel momento la Fase 3 non deve iniziare.
