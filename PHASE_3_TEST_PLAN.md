# Fase 3 — piano di test

> Aggiornamento 30 luglio 2026: i risultati di determinismo storici riportati
> sotto sono superati da `PROJECTM_DETERMINISM_TEST_RESULTS.md`. Il nuovo gate
> projectM è superato; soak finale e runtime package restano aperti.

Stato aggiornato il 29 luglio 2026 dopo l’esecuzione M5. I risultati completi
sono in `PHASE_3_FINAL_TEST_RESULTS.md`; M5 non supera il gate di determinismo
projectM e la Fase 3 resta non completata.

## Esecuzione Milestone M5

- suite completa: 166 test, 164 superati, 0 falliti, 2 non eseguibili;
- golden M1/M2: fixture e tre run identici;
- golden M3/M4: requisiti visuali nella singola esecuzione superati, ma
  ripetibilità indipendente fallita per projectM;
- due export 1080×1920/30 FPS/60 s: 1.800 frame, zero neri compositi, zero
  duplicati e zero cambi falliti;
- confronto indipendente: 0/18 catture pre-encoding identiche;
- probe nativo: 180/180 framebuffer projectM differenti;
- soak: 600,5 s di playback e export completo di 600 s;
- Portable finale: flusso save/reopen/relink/export fuori workspace superato;
- Setup finale: installazione/avvio/disinstallazione superati;
- 1080×1920/60 FPS a piena durata e VM pulita: non eseguiti, non qualificati.

I test non eseguibili non sono conteggiati come superati e gli hash golden non
sono stati aggiornati.

## Esecuzione Milestone M4

La M4 aggiunge `tests/phase3-m4.test.cjs`, un harness Electron e smoke test
dedicati a Setup/Portable. La verifica finale copre:

- formato `.avspreset` 1.0, round trip Unicode/long path e limiti strutturali;
- JSON/UTF-8 corrotti, versione futura, prototype pollution, traversal,
  device path, URL e contenuto eseguibile;
- libreria CRUD persistente, import/export, anteprima e annullamento non
  mutanti, applicazione atomica con undo/redo;
- plugin sconosciuti preservati e applicazione parziale solo dopo conferma;
- manifest audio/cover/Preset MilkDrop/texture, apertura con media mancanti;
- relink singolo e multiplo, SHA-256, magic bytes, mismatch esplicito,
  rollback, ignore/remove opzionali e preflight export;
- progetto spostato, percorso relativo, Unicode NFC e oltre 260 caratteri;
- runtime Electron con WAV reale, tre Preset MilkDrop reali e MP4 60 s;
- golden M1/M2 invariati e golden M3/M4 rieseguito a
  1080×1920/30 FPS/60 s;
- Setup installato/disinstallato e Portable avviata fuori workspace;
- flusso M4 completo ripetuto sull'hash Portable finale con 10/10 asserzioni.

Esito storico della suite M4: 151 totali, 149 superati, 0 falliti, 2 non eseguibili per
privilegio symlink Windows. Copertura focalizzata M4: 86,44% linee, 76,51%
branch e 82,85% funzioni sui moduli caricati. I dettagli e le metriche sono in
`PHASE_3_M4_TEST_RESULTS.md`.

## Esecuzione Milestone M3

La M3 aggiunge `tests/phase3-m3.test.cjs`, il benchmark
`scripts/benchmark-phase3-m3.cjs`, l’harness Electron M3 e il profilo `m3` del
golden preview/export. Copertura eseguita:

- matrice comune draw/hit-test, angoli, scale, rapporti e zoom;
- snapping canvas/timeline on/off, priorità e soglia dipendente dal viewport;
- sei proprietà, cinque interpolazioni, collisioni, seek e 30/60 FPS;
- operazioni keyframe, round trip schema 6.0 e command history;
- timeline tempo/pixel, zoom, scroll, clip, densità 1.000 e stress 10.000;
- runtime Electron di drag, resize, rotate, inspector, timeline, lock e reopen;
- golden M1/M2 invariati e golden M3 1080×1920/30 FPS/60 s;
- Portable finale avviata fuori workspace da percorso Unicode.

## Esecuzione Milestone M2

La M2 aggiunge `tests/phase3-m2.test.cjs` e gli harness runtime dedicati.
L'esecuzione copre:

- registro esatto di 10 ID, projectM assente, ordine e lookup;
- tutti i metodi lifecycle, due istanze, 100 cicli e dispose;
- errori in initialize/render/resize/reset/deserialize/dispose, sospensione e
  ripristino dello stato Canvas;
- golden dei quattro plugin nuovi, audio differente, determinismo, 30/60 FPS,
  due risoluzioni, seek, resize e timeline simulata di 600 secondi;
- ricerca statica di `Math.random`, DOM e clock reale;
- schema 6.0, inspector descriptor-driven e sicurezza `textContent`;
- test Electron dei dieci plugin, quattro tipi parametro, duplicazione
  stateful, ordine/lock/visibilità/eliminazione, undo/redo, save/reopen;
- golden M2 1080×1920/30 FPS/60 s con projectM reale;
- regressione M1, 10 preset reali, catalogo 37 preset e Portable esterna.

Il benchmark `scripts/benchmark-phase3-m2-plugins.cjs` forza la
rasterizzazione e registra media, p95, dispose e delta memoria. Le allocazioni
native per singolo frame non sono esposte da V8 e sono indicate come non
misurabili, non come superate.

## 1. Obiettivi

Dimostrare che host, dieci plugin Canvas, preset di progetto, trasformazioni,
undo/redo e keyframe base:

- sono reali e persistenti;
- sono deterministici;
- producono lo stesso modello visuale in preview ed export;
- non degradano projectM e le altre funzioni Fase 2;
- gestiscono errori senza chiudere l'app;
- funzionano in sviluppo, Setup e Portable fuori dal workspace.

Un test non eseguito o non eseguibile non equivale a un test superato.

## 2. Ambienti e tracciabilità

Ogni sessione registra:

- identificatore build/commit;
- data, operatore e durata;
- Windows edition/build, lingua e code page;
- CPU, GPU/driver, RAM, disco e spazio libero;
- Electron dichiarato/risolto e Node incorporato;
- versione projectM, host nativo, FFmpeg/OpenH264 e `@napi-rs/canvas`;
- tipo build: dev, unpacked, Setup o Portable;
- percorso di avvio, incluso almeno un percorso Unicode e lungo;
- risoluzione/FPS/codec;
- seed progetto;
- log, screenshot, frame hash e file prodotti.

Matrice minima:

1. macchina Windows x64 di riferimento;
2. account/percorso ASCII;
3. account o cartella Unicode;
4. Portable copiato in directory temporanea fuori dal repository;
5. installazione Setup pulita.

## 3. Livelli di test

### Unitari

- validazione e migrazioni;
- registry e lifecycle plugin;
- interpolazioni;
- keyframe resolver;
- snapping e geometria timeline;
- command/history;
- preset di progetto e percorsi;
- PRNG/seed e hash.

### Integrazione

- compositor + plugin host;
- schema + save/open;
- IPC main/preload;
- preview/offline;
- preset + asset resolver;
- undo/redo + UI controller.

### Runtime Electron

- input reale, playback, seek, transform;
- projectM con overlay;
- timeline e keyframe;
- errori plugin;
- salvataggio e riapertura;
- export e annullamento.

### End-to-end Windows

- Setup;
- Portable;
- avvio esterno;
- progetto reale;
- test lungo;
- export completo.

## 4. Test automatici obbligatori

### A. Schema e migrazioni

| ID | Caso | Esito atteso |
|---|---|---|
| SCH-01 | Default 6.0 | Valido e stabile |
| SCH-02 | Fixture 1.0–5.0 | Migrazione senza perdita |
| SCH-03 | Migrazione ripetuta | Idempotente |
| SCH-04 | Versione futura | Sola lettura/rifiuto comprensibile |
| SCH-05 | NaN/Infinity/tipi errati | Rifiuto o default documentato |
| SCH-06 | Plugin sconosciuto | Dati conservati, layer non renderizzato |
| SCH-07 | Keyframe duplicato | Collision policy stabile |
| SCH-08 | Salvataggio interrotto | Originale recuperabile |

### B. Plugin host

| ID | Caso | Esito atteso |
|---|---|---|
| PLG-01 | Registro dei 10 descriptor | ID univoci, conteggio 10 |
| PLG-02 | projectM nel registro | Assente |
| PLG-03 | Lifecycle completo | Ordine chiamate corretto |
| PLG-04 | Due istanze stesso plugin | Stato indipendente |
| PLG-05 | Resize/reset/seek | Stato coerente |
| PLG-06 | Errore initialize | Fallback, app attiva |
| PLG-07 | Errore render | Solo layer sospeso |
| PLG-08 | Errore dispose | Segnalato, chiusura prosegue |
| PLG-09 | Parametri invalidi | Sanitizzati |
| PLG-10 | 100 cicli create/dispose | Zero istanze residue |

### C. Dieci plugin

Per ognuno:

- silenzio;
- volume/bassi/medi/alti sintetici;
- PCM reale;
- 30 e 60 FPS;
- due risoluzioni;
- due istanze;
- determinismo;
- seek indietro;
- export offline;
- serializzazione parametri.

Il test fallisce se un plugin produce sempre lo stesso frame su ingressi audio
materialmente diversi, se usa un mock o se genera solo un placeholder.

### D. Command history

- set property;
- slider con 100 eventi;
- drag con 300 pointermove;
- add/delete/duplicate/move layer;
- add/move/delete keyframe;
- applicazione preset;
- 200 undo e 200 redo;
- invalidazione redo;
- limite memoria;
- dirty revision prima/dopo save;
- reset su nuovo/apri.

### E. Keyframe

- lineare, ease in, ease out, ease in/out, hold;
- posizione X/Y, scala, rotazione, opacità e intensità;
- prima/dopo la traccia;
- timestamp coincidenti;
- valori fuori range;
- ordinamento non canonico in input;
- seek avanti/indietro;
- stesso valore a timestamp uguale a 30/60 FPS;
- frame iniziale/finale esatti;
- progetto senza keyframe identico alla baseline 5.0.

### F. Preset di progetto

- crea/applica/rinomina/duplica/elimina;
- import/export/round trip;
- Unicode e percorsi lunghi;
- JSON corrotto;
- file vuoto;
- file oltre limite;
- versione futura;
- prototype pollution;
- HTML/script in campi testo trattato come testo;
- plugin mancante;
- cover/audio/MilkDrop mancante;
- hash uguale e diverso;
- annulla import;
- rollback su errore;
- persistenza dopo riavvio.

### G. Sicurezza

- traversal relativo;
- percorso assoluto;
- device path Windows;
- URL e UNC non autorizzati;
- symlink/reparse point dove rilevante;
- estensione ingannevole;
- payload profondamente annidato;
- numero eccessivo di layer/keyframe/parametri;
- stringhe molto lunghe;
- `__proto__`, `constructor`, `prototype`;
- nessuna chiamata a shell, `eval`, `Function` o import dinamico da preset.

## 5. Test manuali obbligatori

### Editor

1. creare progetto e caricare WAV/MP3;
2. aggiungere un'istanza per ognuno dei dieci plugin;
3. modificare ogni tipo parametro;
4. duplicare, riordinare, lockare, nascondere ed eliminare;
5. trascinare, ridimensionare e ruotare cover/testi;
6. verificare guide e snap attivo/disattivo;
7. provare undo/redo e scorciatoie;
8. verificare focus, etichette e operazioni da tastiera;
9. salvare, chiudere e riaprire.

### Keyframe e timeline

1. creare almeno cinque tracce proprietà;
2. usare tutte le interpolazioni;
3. spostare keyframe con zoom diversi;
4. modificare start/end clip;
5. pausa e seek durante editing;
6. lock del layer;
7. riapertura e confronto valori;
8. stesso timestamp a 30/60 FPS.

### Preset di progetto

1. creare preset senza asset;
2. creare preset con riferimenti espliciti;
3. esportare/importare in altra cartella;
4. rimuovere un asset e usare ricollegamento;
5. annullare anteprima/applicazione;
6. distinguere chiaramente Preset di progetto e Preset MilkDrop.

## 6. Progetto di riferimento preview/export

Il progetto golden deve includere:

- Motore projectM reale e almeno tre Preset MilkDrop;
- transizioni MilkDrop;
- dieci plugin Canvas, almeno quattro simultaneamente visibili;
- due istanze dello stesso plugin stateful;
- cover, artista e titolo;
- sette blend mode distribuiti fra i layer;
- livelli nascosti, lockati e riordinati;
- intervalli temporali;
- keyframe su tutte le cinque proprietà e tutte le interpolazioni;
- almeno un asset con percorso Unicode;
- seed fisso;
- audio WAV reale di almeno 60 secondi.

Confrontare preview ed export agli stessi timestamp:

- frame 0;
- 10%, 25%, 50%, 75%, 90%;
- frame finale valido;
- inizio, metà e fine di ogni transizione MilkDrop;
- esattamente sui keyframe e un frame prima/dopo;
- confini degli intervalli layer.

Metriche:

- hash esatto dove backend e formato coincidono;
- altrimenti SSIM/errore pixel con soglia definita prima del test;
- differenze spiegate solo per elementi UI esclusi (guide, selection, maniglie).

Non sono accettabili layer mancanti, schermate nere, sostituti FFmpeg o
valutazione keyframe differente.

## 7. Sincronizzazione e determinismo

Eseguire due export indipendenti con stesso progetto/seed:

- sequenza preset identica;
- valori keyframe identici per frame;
- frame hash identici prima della codifica;
- stesso numero di frame;
- stessa durata;
- audio/video allineati entro la tolleranza già approvata in Fase 2.

Poi cambiare un solo seed e verificare che cambino solo le proprietà
procedurali previste. Ripetere a 30 FPS e 60 FPS confrontando i timestamp
comuni.

## 8. Prestazioni

### Scenari

1. baseline Fase 2;
2. un plugin leggero;
3. dieci plugin configurati, quattro visibili;
4. due plugin stateful duplicati;
5. 1.000 keyframe;
6. 10.000 keyframe come stress non supportato;
7. projectM + overlay + keyframe;
8. timeline con zoom e drag;
9. export 1080×1920 30 FPS per almeno 60 secondi;
10. smoke 1080×1920 60 FPS.

### Misure

- FPS medio, p1 e p5;
- tempo frame medio, p95 e massimo;
- CPU processo e totale;
- GPU e memoria GPU, se il contatore è disponibile;
- working set, private bytes e heap JS;
- handle e thread;
- frame projectM persi e latenza IPC;
- tempo medio plugin;
- dimensione history;
- tempo valutazione keyframe;
- tempo export e spazio temporaneo.

### Soglie iniziali

- nessun peggioramento >10% della baseline Fase 2 a progetto equivalente;
- preview 30 FPS: p5 almeno 27 FPS sulla macchina di riferimento;
- nessuna crescita monotona >10% di private bytes o handle dopo warm-up e 10
  minuti, salvo cache limitate e documentate;
- valutazione di 1.000 keyframe <2 ms p95 per frame sulla macchina di
  riferimento;
- interazione timeline <16 ms p95 per evento senza rendering export;
- zero frame neri e zero crash.

Il profilo 60 FPS viene dichiarato stabile solo dopo un test completo
documentato; lo smoke non basta.

## 9. Test lungo e leak

Durata minima: 10 minuti dopo warm-up.

Sequenza:

- playback;
- 100 cambi preset MilkDrop;
- 100 modifiche plugin;
- 100 undo/redo;
- 50 seek;
- 20 add/delete istanza;
- 20 applicazioni preset di progetto;
- timeline in movimento;
- projectM attivo;
- pausa/ripresa;
- chiusura progetto.

Campionare ogni 30 secondi CPU, GPU, RAM, heap, private bytes, handle, thread,
FPS, errori e frame persi. Dopo chiusura progetto e garbage collection
opportunistica, le risorse runtime plugin devono tornare entro la soglia
documentata.

## 10. Regressione Fase 2

Rieseguire integralmente:

- projectM reale/versione/host isolato;
- PCM al motore;
- preview e export projectM;
- Preset MilkDrop singolo, multiplo, cartella, ricorsivo e ZIP;
- sicurezza ZIP, hash, duplicati, texture e quarantena;
- Libreria preset personale e Catalogo ufficiale;
- licenze non verificate utilizzabili localmente;
- precedente/successivo/diretto/casuale/lock/automatico;
- transizioni e seed;
- salvataggio/riapertura;
- ricollegamento Preset MilkDrop;
- Unicode, percorsi lunghi e UTF-8;
- parità preview/export;
- annullamento export e spazio insufficiente;
- Setup, Portable e avvio esterno.

I test di caratterizzazione non sostituiscono la suite Fase 2.

## 11. Error injection

- plugin assente dopo apertura progetto;
- eccezione per ogni fase lifecycle;
- impostazioni corrotte;
- asset rimosso durante playback;
- preset applicato durante pausa;
- seek durante keyframe/transition;
- main IPC che rifiuta payload;
- disco pieno durante save/export preset;
- file senza permessi;
- chiusura durante scrittura;
- projectM indisponibile;
- encoder indisponibile.

In ogni caso l'app deve restare aperta quando tecnicamente possibile, offrire
un messaggio comprensibile e non perdere il file progetto precedente.

## 12. Build e packaging

Verificare:

- build pulita;
- test automatici;
- `electron-builder --dir`;
- Setup x64;
- Portable x64;
- nessuna dipendenza da Node/Visual Studio/repository/variabili manuali;
- risorse/licenze Fase 2 incluse;
- preset di progetto personali non inclusi nella distribuzione;
- avvio da cartella temporanea Unicode e lunga;
- import/export preset e salvataggio progetto fuori workspace;
- disinstallazione senza rimuovere dati personali non richiesti.

## 13. Copertura e report

Obiettivi per il codice nuovo:

- linee: almeno 85%;
- branch: almeno 80%;
- funzioni: almeno 90%;
- 100% dei rami di validazione sicurezza, migrazione e interpolazione.

Se il runner corrente non misura copertura, aggiungere una modalità di
strumentazione approvata durante T3.01; non stimare manualmente la percentuale.

Il report finale deve indicare:

- totali, superati, falliti, ignorati e non eseguibili;
- durata;
- copertura reale;
- hardware e versioni;
- artefatti e hash;
- problemi noti;
- criteri di completamento soddisfatti/non soddisfatti.

## 14. Gate

- **Gate A:** caratterizzazione verde prima del refactor.
- **Gate B:** schema/migrazioni/history verdi prima della UI avanzata.
- **Gate C:** 10 plugin e lifecycle verdi prima dei preset.
- **Gate D:** keyframe e parità verdi prima dell'audit prestazioni.
- **Gate E:** zero P0/P1, regressione Fase 2 e build Windows verdi prima di
  dichiarare completata la Fase 3.

## 15. Esecuzione Milestone M1

Gate A e Gate B sono superati.

- Suite TAP: 84 totali, 83 superati, 0 falliti, 1 non eseguibile per privilegio
  symlink Windows.
- Golden: tre esecuzioni identiche.
- Migrazioni: 1.0–5.0 verso 6.0, idempotenza e frame legacy invariato.
- Atomic save: JSON, write, disco pieno, interrupt e rename verificati.
- History: 100 eventi slider, 300 drag, 200 undo, 200 redo e limiti verificati.
- Regressione Fase 2: projectM 4.1.6, 10 preset, catalogo 37, import, cambi,
  transizioni, Portable esterna e parità 1080×1920/30/60 s verdi.
- Test UI assistito: 11/11 asserzioni verdi.

Non eseguiti/non eseguibili:

- coverage strumentata, perché il runner corrente non è configurato;
- symlink reale senza Developer Mode/privilegio;
- qualifica completa 1080×1920 a 60 FPS;
- installazione/disinstallazione Setup su VM pulita.

Gate C–E restano futuri e non sono stati anticipati.
