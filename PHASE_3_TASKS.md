# Fase 3 — attività numerate e verificabili

> Aggiornamento 30 luglio 2026: il precedente risultato 180/180 divergente è
> superato (0 differenze su 1.800 frame). Consultare
> `PROJECTM_DETERMINISM_TEST_RESULTS.md` e la checklist finale corrente.

Stato aggiornato il 29 luglio 2026 dopo l’audit M5.  
T3.01–T3.13 sono completate; T3.14 è stata eseguita ma il gate non è
superato per la divergenza dei framebuffer projectM fra processi indipendenti.
La Fase 3 resta quindi non completata e la Fase 4 non è iniziata.

## Convenzioni

- Priorità **P0**: blocca tutte le attività successive.
- Priorità **P1**: obbligatoria per chiudere la Fase 3.
- Priorità **P2**: obbligatoria, ma pianificabile dopo il percorso critico.
- Ogni attività deve lasciare verdi i test di regressione Fase 2.
- I percorsi “da creare” sono proposte e possono essere affinati con una ADR
  prima dell'implementazione, senza cambiare responsabilità o criteri.

## T3.01 — Baseline e test di caratterizzazione

**Stato esecuzione M1:** completata e verificata. Golden ripetuti tre volte,
fixture 1.0–5.0, WAV reale e contratti congelati in
`tests/fixtures/golden/`.

**Priorità:** P0  
**Obiettivo:** congelare il comportamento corrente prima delle estrazioni
architetturali.

**File coinvolti**

- da modificare: `tests/phase2.test.cjs`, eventuali test runtime esistenti;
- da creare: `tests/phase3-characterization.test.cjs`,
  `tests/fixtures/projects/`;
- sola lettura: `src/shared/sceneCompositor.ts`,
  `src/renderer/plugins/*.ts`, `src/shared/project.ts`.

**Dipendenze:** nessuna nuova; richiede build/test Fase 2 funzionante.

**Implementazione prevista**

- fixture progetto 5.0 rappresentativa;
- hash golden di frame dei sei plugin a timestamp/audio/seed noti;
- round trip di ordine, blend, intervalli, projectM e impostazioni;
- inventario dei contratti IPC e dei messaggi di errore critici;
- snapshot strutturale del progetto default, non snapshot del markup intero.

**Test automatici**

- frame browser-independent sul compositor offline;
- seek avanti/indietro;
- due istanze Particle Burst con stato indipendente;
- apertura fixture 1.0 e 5.0;
- suite completa Fase 2.

**Test manuali:** confronto visivo di almeno un frame per ciascun plugin e
apertura della fixture 5.0 nell'app corrente.

**Criterio di completamento**

- baseline ripetibile in tre esecuzioni;
- ogni futura differenza richiede approvazione esplicita del golden;
- nessun test dipende da clock, locale o percorso macchina.

**Rischi:** golden troppo fragili; mascheramento di bug esistenti.  
**Prerequisiti:** conservare separatamente i risultati Fase 2 già approvati.

## T3.02 — Separazione del motore condiviso

**Stato esecuzione M1:** completata e verificata. Compositor e sei plugin sono
in `src/engine`; controllo statico e golden sono verdi.

**Priorità:** P0  
**Obiettivo:** rendere compositor e host indipendenti dal renderer senza
alterare i frame.

**File coinvolti**

- da creare: `src/engine/composition/`,
  `src/engine/plugins/`;
- da modificare/spostare:
  `src/shared/sceneCompositor.ts`,
  `src/renderer/plugins/types.ts`,
  `src/renderer/plugins/visualizerHost.ts`,
  `src/renderer/plugins/*.ts`,
  `src/renderer/previewRenderer.ts`,
  `src/main/export/offlineSceneCompositor.ts`,
  `tsconfig.main.json`, `tsconfig.renderer.json`.

**Dipendenze:** T3.01; nessuna nuova libreria.

**Implementazione prevista**

- estrazione di tipi e logica puri in `src/engine`;
- adapter minimi per Canvas browser e offline;
- rimozione di ogni import `shared/engine → renderer`;
- API temporaneamente compatibile con l'host corrente;
- un commit/logical change per spostamento, senza aggiungere feature.

**Test automatici**

- golden T3.01 invariati;
- build main e renderer;
- preview/export dello stesso progetto;
- ricerca statica che vieta import di renderer da engine/shared.

**Test manuali:** avvio dev, playback, seek e confronto preview/export prima e
dopo l'estrazione.

**Criterio di completamento**

- il motore compila in entrambi i target;
- zero variazioni ai frame oltre una tolleranza documentata pari a zero per i
  test raster deterministici;
- nessuna regressione projectM.

**Rischi:** incompatibilità fra tipi Canvas DOM e `@napi-rs/canvas`.  
**Prerequisiti:** definire un sottoinsieme Canvas usato dai plugin.

## T3.03 — Schema progetto 6.0 e migrazioni

**Stato esecuzione M1:** completata e verificata. Catena 1.0–6.0, rifiuto
versioni future e salvataggio atomico con cinque fault injection sono verdi.

**Priorità:** P0  
**Obiettivo:** introdurre un modello estensibile per plugin, trasformazioni,
keyframe e riferimenti asset.

**File coinvolti**

- da creare: `src/engine/project/migrations.ts`,
  `src/engine/project/validation.ts`,
  `tests/project-migrations.test.cjs`,
  fixture 1.0–6.0;
- da modificare: `src/shared/project.ts`, `src/shared/ipc.ts`,
  `src/main/ipc.ts`.

**Dipendenze:** T3.01, T3.02.

**Implementazione prevista**

- nuovo modello descriptor reference/settings per layer visualizer;
- trasformazione comune e keyframe;
- riferimenti asset con stato risolvibile;
- catena di migrazione esplicita fino a 6.0;
- conservazione controllata dei dati plugin sconosciuti;
- gestione read-only/versione futura;
- salvataggio atomico tramite servizio dedicato.

**Test automatici**

- fixture per ogni versione;
- migrazione idempotente;
- input parziale, corrotto, eccessivo e versione futura;
- confronto frame 5.0 pre/post migrazione;
- interruzione simulata durante salvataggio atomico.

**Test manuali:** aprire e risalvare copie di progetti reali 1.0–5.0,
verificando layer, cover, testi, preset, seed e intervalli.

**Criterio di completamento**

- tutti i progetti legacy testati aprono senza perdita;
- nessun input invalido arriva al compositor;
- un errore non sovrascrive il file originale.

**Rischi:** perdita di coordinate/ordine; doppia fonte legacy/nuova.  
**Prerequisiti:** mappa campo-per-campo approvata prima di incrementare
`PROJECT_VERSION`.

## T3.04 — Command dispatcher, dirty state, undo e redo

**Stato esecuzione M1:** completata e verificata. Dispatcher, delta,
transazioni, revisioni, limiti e scorciatoie sono integrati e testati.

**Priorità:** P0  
**Obiettivo:** rendere reversibili e raggruppabili le modifiche editoriali.

**File coinvolti**

- da creare: `src/renderer/commands/command.ts`,
  `commandDispatcher.ts`, `history.ts`, `projectCommands.ts`;
- da modificare: `src/renderer/state.ts`, `src/renderer/app.ts`;
- test: `tests/command-history.test.cjs` e test UI.

**Dipendenze:** T3.03.

**Implementazione prevista**

- revision ID e revisione salvata;
- comandi delta per proprietà/layer/keyframe;
- transazioni e coalescing;
- limiti 200 comandi/32 MiB stimati;
- reset history su nuovo/apri;
- scorciatoie e stato abilitato/disabilitato;
- migrazione progressiva dei mutator esistenti.

**Test automatici**

- 200 cicli undo/redo;
- drag e slider generano un solo comando;
- redo invalidato dalla nuova modifica;
- save non altera il documento;
- nuovo/apri svuota history;
- nessun PCM/frame/bitmap nella history.

**Test manuali:** eseguire scorciatoie, drag, slider, salva, undo fino alla
revisione salvata e redo nell'interfaccia.

**Criterio di completamento**

- ogni funzione nuova Fase 3 usa il dispatcher;
- dirty state corretto anche dopo undo fino alla revisione salvata;
- memoria entro limite.

**Rischi:** comandi non invertibili; snapshot troppo pesanti.  
**Prerequisiti:** modello persistente stabile.

## T3.05 — Contratto, registro e ciclo di vita plugin

**Stato esecuzione M2:** completata e verificata. Contratto tipizzato,
registro unico di dieci descriptor, lifecycle completo, validazione e
isolamento errori sono integrati.

**Priorità:** P1  
**Obiettivo:** completare il plugin host secondo un unico contratto tipizzato.

**File coinvolti**

- da creare/modificare: `src/engine/plugins/types.ts`, `registry.ts`,
  `host.ts`, `validation.ts`;
- da modificare: `src/shared/project.ts`,
  `src/engine/composition/sceneCompositor.ts`;
- test: `tests/plugin-host.test.cjs`.

**Dipendenze:** T3.02, T3.03.

**Implementazione prevista**

- descriptor e factory;
- registro con ID univoci;
- istanza per layer;
- lifecycle completo;
- parametri tipizzati e validati;
- fallback per plugin assente o in errore;
- contatore errori/sospensione solo runtime;
- dispose su eliminazione, reset, cambio progetto e chiusura.

**Test automatici**

- plugin di test che registra tutte le chiamate lifecycle;
- ID duplicato;
- impostazioni invalide;
- eccezione in initialize/render/resize/dispose;
- due istanze indipendenti;
- 100 crea/render/dispose senza crescita di istanze/handle JS.

**Test manuali:** provocare un errore controllato del plugin in sviluppo e
verificare che audio, projectM e altri livelli proseguano.

**Criterio di completamento**

- nessun elenco plugin duplicato fra UI, schema e host;
- un crash logico di plugin non interrompe audio, projectM o altri layer;
- tutte le risorse note vengono rilasciate.

**Rischi:** abuso del fallback nasconde errori; plugin stateful non seekable.  
**Prerequisiti:** policy errori e determinismo definite in architettura.

## T3.06 — Migrazione dei sei plugin esistenti

**Stato esecuzione M2:** completata e verificata. I sei ID e raster golden M1
sono invariati; ogni layer possiede un'istanza runtime indipendente.

**Priorità:** P1  
**Obiettivo:** portare i visualizzatori correnti nel nuovo host senza
regressioni visive.

**File coinvolti**

- `src/renderer/plugins/spectrumBars.ts`;
- `circularSpectrum.ts`, `waveformLine.ts`, `particleBurst.ts`,
  `pulseShapes.ts`, `dynamicVignette.ts` oppure equivalenti in `src/plugins/`;
- registro e fixture golden.

**Dipendenze:** T3.05.

**Implementazione prevista**

- descriptor, default e metadati per ciascun plugin;
- factory per istanza;
- seed derivato da progetto e ID layer;
- serialize/deserialize e validazione;
- rimozione del singleton Particle Burst;
- alias di migrazione per gli ID 5.0.

**Test automatici**

- golden T3.01;
- audio silenzioso, picchi e bande;
- 30/60 FPS;
- seek e reset;
- duplicazione istanza;
- preview/offline frame equivalenti.

**Test manuali:** confrontare i sei plugin in preview su audio reale e nel
video esportato, inclusi seek e duplicazione.

**Criterio di completamento**

- sei plugin registrati;
- frame legacy invariati;
- nessuno usa `Math.random`, DOM o clock reale.

**Rischi:** variazioni dovute a delta-time o ordine di reset.  
**Prerequisiti:** fixture PCM deterministica.

## T3.07 — Inspector dinamico e gestione istanze

**Stato esecuzione M2:** completata e verificata. Catalogo e controlli sono
generati dai descriptor; tutte le mutazioni persistenti usano il dispatcher.

**Priorità:** P1  
**Obiettivo:** controllare i plugin dal descriptor senza UI hardcoded per ID.

**File coinvolti**

- da creare: `src/renderer/inspector/parameterControls.ts`,
  `inspectorController.ts`, `src/renderer/layers/layerController.ts`;
- da modificare: `src/renderer/app.ts`, `styles.css`, template UI;
- test UI e accessibilità.

**Dipendenze:** T3.04, T3.05, T3.06.

**Implementazione prevista**

- catalogo visualizzatori;
- aggiungi, duplica ed elimina istanza;
- rendering dei controlli da metadata;
- reset di singolo parametro/default;
- error state di plugin;
- lock/visibility/order/blend/intervallo preservati;
- operazioni tramite comandi.

**Test automatici**

- ogni tipo parametro;
- tastiera e focus;
- valori min/max/non finiti;
- eliminazione plugin selezionato;
- undo/redo aggiunta, eliminazione e modifica;
- salvataggio/riapertura.

**Test manuali:** aggiungere, configurare, duplicare ed eliminare istanze
usando mouse e sola tastiera; verificare messaggi e focus dopo ogni azione.

**Criterio di completamento**

- aggiungere un descriptor non richiede modificare l'inspector;
- nessun pulsante decorativo;
- ogni controllo produce un cambiamento visibile e persistente.

**Rischi:** controlli generici poco usabili; injection nelle etichette.  
**Prerequisiti:** testo sempre assegnato via DOM sicuro, non HTML importato.

## T3.08 — Quattro nuovi visualizzatori

**Stato esecuzione M2:** completata e verificata. Radial Rays, Mirrored
Waveform, Audio Grid e Orbiting Particles sono reali, audio-reattivi,
deterministici, persistenti e condivisi fra preview/export.

**Priorità:** P1  
**Obiettivo:** raggiungere dieci plugin Canvas reali.

**File coinvolti**

- da creare: moduli per `radialRays`, `mirroredWaveform`, `audioGrid`,
  `orbitingParticles`;
- da modificare: registro plugin;
- test e fixture visuali.

**Dipendenze:** T3.05, T3.07.

**Implementazione prevista**

- algoritmi Canvas 2D distinti;
- metadati e impostazioni;
- reazione a bande/FFT/waveform reali;
- seed per elementi procedurali;
- limiti espliciti a particelle/geometrie;
- nessuno strobe predefinito.

**Test automatici**

- output non vuoto e differente su audio differente;
- determinismo;
- istanze multiple;
- 10 minuti a 30 FPS;
- smoke 60 FPS;
- preview/export ai timestamp 0, 25, 50, 75 e 100%.

**Test manuali:** valutare reazione audio e distinzione visiva dei quattro
plugin su un brano reale, controllando preview ed MP4.

**Criterio di completamento**

- conteggio esatto di 10 plugin Canvas;
- ognuno visibile, configurabile, salvabile ed esportabile;
- projectM non è contato come plugin.

**Rischi:** costo CPU e similitudine eccessiva fra effetti.  
**Prerequisiti:** budget per-frame definito nel piano test.

## T3.09 — Trasformazioni dirette e snapping

**Stato esecuzione M3:** completata e verificata. Drag, resize, rotazione,
input numerico, lock, reset, matrice/hit-test condivisi, snapping e guide sono
coperti da test puri e runtime Electron.

**Priorità:** P1  
**Obiettivo:** fornire il modello editoriale necessario ai keyframe di
posizione, scala e rotazione.

**File coinvolti**

- da creare: `src/renderer/preview/transformController.ts`,
  `src/renderer/timeline/snapping.ts`;
- da modificare: `previewRenderer.ts`, inspector, schema e compositor.

**Dipendenze:** T3.03, T3.04.

**Implementazione prevista**

- trasformazione comune;
- maniglie resize e rotazione per cover/testi;
- campi numerici;
- guide centro/bordi e griglia;
- snap disattivabile;
- coordinate normalizzate;
- overlay editoriale escluso dall'export;
- una transazione per gesto.

**Test automatici**

- trasformazioni a ogni risoluzione preview;
- lock;
- limiti e coordinate fuori canvas;
- undo/redo;
- nessuna maniglia in export;
- frame equivalente pre-migrazione.

**Test manuali:** drag, resize, rotazione, lock e snap a più livelli di zoom e
con dimensioni preview differenti.

**Criterio di completamento**

- posizione, scala e rotazione hanno una sola semantica;
- drag a 300 eventi crea un solo comando;
- preview ed export usano gli stessi valori.

**Rischi:** hit-test ruotato; regressione dei progetti 5.0.  
**Prerequisiti:** resolver legacy verificato.

## T3.10 — Valutatore keyframe

**Stato esecuzione M3:** completata e verificata. Sei proprietà, cinque
interpolazioni, collision policy, indice/caching e evaluator condiviso
preview/export sono attivi nello schema 6.0.

**Priorità:** P1  
**Obiettivo:** calcolare in modo puro e deterministico le proprietà animate.

**File coinvolti**

- da creare: `src/engine/keyframes/types.ts`, `evaluator.ts`,
  `interpolation.ts`, `propertyPaths.ts`;
- da modificare: frame evaluator/compositor e schema;
- test: `tests/keyframe-evaluator.test.cjs`.

**Dipendenze:** T3.03, T3.09.

**Implementazione prevista**

- cinque proprietà minime;
- cinque interpolazioni;
- vista effettiva immutabile al timestamp;
- clamp e collision policy;
- cache delle tracce invalidata per revisione;
- reset deterministico su seek.

**Test automatici**

- boundary prima/dopo traccia;
- valori esatti a 0/25/50/75/100%;
- hold e easing;
- keyframe coincidenti;
- seek indietro;
- 30/60 FPS stessi valori agli stessi timestamp.

**Test manuali:** osservare ciascuna interpolazione in playback lento, fare
seek avanti/indietro e confrontare i valori numerici.

**Criterio di completamento**

- nessuna mutazione del progetto;
- risultati indipendenti dall'ordine di rendering;
- usato da preview e offline.

**Rischi:** errori floating-point e divergenza al frame finale.  
**Prerequisiti:** convenzione timestamp documentata.

## T3.11 — Editor timeline dei keyframe

**Stato esecuzione M3:** completata e verificata. Zoom, scroll, traccia
proprietà, keyframe, clip, snapping, tastiera e transazioni sono disponibili.
La policy conserva i keyframe fuori clip.

**Priorità:** P1  
**Obiettivo:** rendere i keyframe visibili e modificabili.

**File coinvolti**

- da creare: `src/renderer/timeline/timelineController.ts`,
  `timelineGeometry.ts`;
- da modificare: markup/stili/app/inspector.

**Dipendenze:** T3.04, T3.10.

**Implementazione prevista**

- tracce proprietà espandibili;
- add/move/delete/select;
- zoom e scroll;
- clip start/end editabili;
- snap frame/marcatore/limite;
- input numerico per accessibilità;
- playhead non persistente.

**Test automatici**

- timeline vuota e brano lungo;
- zoom estremi;
- collisione keyframe;
- drag durante pausa;
- seek durante modifica;
- tastiera, focus e screen-reader labels;
- undo/redo.

**Test manuali:** creare, selezionare, spostare ed eliminare keyframe con mouse
e tastiera su brani corti e lunghi.

**Criterio di completamento**

- ogni keyframe persistito è rappresentato;
- modifica UI e valore renderizzato coincidono;
- nessuna modifica avviene con layer lockato.

**Rischi:** DOM troppo grande; errori coordinate con scroll/zoom.  
**Prerequisiti:** virtualizzare solo se la misura lo richiede.

## T3.12 — Preset di progetto

**Stato esecuzione M4:** completata e verificata. Formato `.avspreset` 1.0,
libreria persistente, CRUD, import/export, anteprima non mutante, conferma e
applicazione atomica con undo/redo sono coperti dalla suite e dal runtime
Electron/Portable.

**Priorità:** P1  
**Obiettivo:** creare una libreria separata dai Preset MilkDrop con
import/export sicuro.

**File coinvolti**

- da creare: `src/main/project/projectPresetService.ts`,
  `src/renderer/projectPresets/projectPresetView.ts`,
  tipi/validator condivisi;
- da modificare: IPC, preload, global types, app e stili;
- test: `tests/project-presets.test.cjs`.

**Dipendenze:** T3.03, T3.04, T3.07, T3.10.

**Implementazione prevista**

- formato `.avspreset`;
- CRUD, import, export e applicazione con anteprima;
- limiti e validazione main+engine;
- applicazione come singolo comando;
- riferimenti asset opzionali con hash;
- terminologia distinta;
- nessun dato importato inserito come HTML.

**Test automatici**

- round trip Unicode e percorso lungo;
- JSON corrotto, enorme, versione futura e prototype pollution;
- plugin mancante;
- asset mancante/hash diverso;
- import annullato o fallito lascia il progetto invariato;
- persistenza dopo riavvio Portable.

**Test manuali:** completare CRUD, export, import, anteprima, annulla e
applicazione da una Portable esterna, verificando la terminologia.

**Criterio di completamento**

- tutte le azioni sono reali e persistenti;
- il file non contiene codice eseguibile;
- preset MilkDrop e catalogo ufficiale restano invariati.

**Rischi:** confusione UX e riferimenti non portabili.  
**Prerequisiti:** etichette “Preset di progetto” in tutta la UI.

## T3.13 — Ricollegamento media e resilienza progetto

**Stato esecuzione M4:** completata e verificata. Manifest asset, apertura
resiliente, relink singolo/multiplo atomico, verifica tipo/hash, conferma dei
mismatch, ignore/remove opzionali e preflight export sono operativi.

**Priorità:** P2  
**Obiettivo:** aprire progetti/preset anche quando audio o cover sono stati
spostati.

**File coinvolti**

- da creare: `src/engine/project/assetResolver.ts`,
  `src/main/project/mediaRelinkService.ts`;
- da modificare: IPC/preload/app, apertura progetto e inspector errori.

**Dipendenze:** T3.03, T3.12.

**Implementazione prevista**

- lista asset irrisolti;
- placeholder non distruttivo;
- dialogo di ricollegamento per tipo;
- verifica hash con conferma se differente;
- ricerca relativa limitata alla directory progetto solo su azione esplicita;
- compatibilità con ricollegamento Preset MilkDrop esistente.

**Test automatici**

- audio/cover mancanti;
- file di tipo errato;
- hash uguale/diverso;
- Unicode e >260 caratteri;
- salvataggio e riapertura;
- cancel senza modifiche.

**Test manuali:** spostare realmente audio e cover, aprire il progetto,
ricollegare e completare playback/export.

**Criterio di completamento**

- progetto si apre senza crash;
- asset corretto ripristina preview/export;
- nessun percorso viene eseguito o cercato fuori ambito.

**Rischi:** scansioni lente; sostituzione asset non intenzionale.  
**Prerequisiti:** nessuna ricerca ricorsiva automatica sul disco.

## T3.14 — Accessibilità, prestazioni e audit finale

**Stato esecuzione M5:** audit eseguito, **non completata**. Suite, golden,
soak, export e package sono stati rigenerati. Il criterio “risultati
riproducibili” è fallito: due processi projectM 4.1.6 differiscono in 180/180
frame e due export indipendenti differiscono in tutte le 18 catture
pre-encoding. Vedere `PHASE_3_FINAL_AUDIT.md`.

**Priorità:** P1  
**Obiettivo:** dimostrare la chiusura senza regressioni Fase 2.

**File coinvolti**

- test automatici/runtime;
- documentazione finale Fase 3;
- eventuali file applicativi delle correzioni emerse;
- nessuna modifica a licenze/deps senza audit dedicato.

**Dipendenze:** T3.01–T3.13.

**Implementazione prevista**

- focus order e shortcut;
- metriche plugin/host/history/timeline;
- test lungo e leak;
- confronto preview/export;
- Setup e Portable fuori workspace;
- matrice projectM/preset/Unicode/transizioni;
- documentazione dei limiti, non dichiarazioni non misurate.

**Test automatici**

- intera `PHASE_3_TEST_PLAN.md`;
- suite Fase 2;
- 10 minuti preview e export di riferimento;
- 1080×1920 30 FPS;
- smoke 60 FPS senza dichiararlo stabile se non supera la soglia completa.

**Test manuali:** sessione editor di 10 minuti, progetto di riferimento,
installazione Setup, avvio Portable fuori workspace e audit accessibilità.

**Criterio di completamento**

- zero P0/P1 aperti;
- risultati e artefatti riproducibili;
- nessun crash/leak confermato;
- revisione umana autorizzata prima della Fase 4.

**Rischi:** tempi test lunghi; risultati hardware-specifici.  
**Prerequisiti:** registrare hardware, OS, build, commit e versione binari.

## Percorso critico

```text
T3.01 → T3.02 → T3.03 → T3.04
                     ├→ T3.05 → T3.06 → T3.07 → T3.08
                     └→ T3.09 → T3.10 → T3.11
                                  T3.07 + T3.10 → T3.12 → T3.13
                                      tutte → T3.14
```

## Gate di milestone

- **M1, fondazioni:** T3.01–T3.04, nessuna variazione visiva.
- **M2, host:** T3.05–T3.08, dieci plugin reali e deterministici.
- **M3, animazione:** T3.09–T3.11, keyframe base completi.
- **M4, preset:** T3.12–T3.13, import/export e asset resilienti.
- **M5, chiusura:** T3.14, audit completo e revisione umana.
