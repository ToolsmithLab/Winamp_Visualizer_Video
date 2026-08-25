# Fase 3 — registro dei rischi

> Aggiornamento 30 luglio 2026: la divergenza projectM fra processi è mitigata
> dalla patch `avs-projectm-4.1.6-determinism-v1`. Restano aperti i gate soak e
> package runtime descritti in `KNOWN_ISSUES.md`.

Stato aggiornato il 29 luglio 2026 dopo l’audit M5.

## Esito gate M5

R-34 è aperto e bloccante: la sequenza dei Preset MilkDrop è deterministica,
ma lo stato raster interno di projectM 4.1.6 non è riproducibile fra processi
indipendenti. Il probe nativo differisce in 180/180 frame e i due export
completi in 18/18 catture. Il rischio non può essere accettato perché viola un
criterio esplicito di chiusura M5.

Restano inoltre aperti, senza essere contati come superati: qualifica
1080×1920/60 FPS a piena durata, test symlink filesystem privilegiato, test su
VM Windows pulita e misura esatta degli external bytes durante il playback.
La Fase 4 non è iniziata.

## Esito gate M4

I rischi di import dati, confusione fra Preset di progetto e Preset MilkDrop,
asset spostati, sostituzione involontaria, scansioni non confinate e omissioni
di packaging sono mitigati nel perimetro T3.12–T3.13. Le evidenze includono
validazione strutturale, IPC specifici, anteprima non mutante, applicazioni
atomiche, SHA-256, magic bytes, relink con conferma, rollback batch, golden
1080×1920 e avvio esterno di Setup/Portable. Restano aperti la qualifica
1080×1920/60 FPS a piena durata, la firma Authenticode e il collaudo su una VM
Windows pulita. Questa è l’evidenza storica del gate M4; lo stato corrente di
T3.14/M5 è riportato nella sezione precedente.

## Esito gate M3

R-04, R-09, R-10, R-11, R-12, R-13, R-21, R-27, R-28, R-31, R-33 e
R-34 sono mitigati per il perimetro M3 con test automatici, runtime Electron,
golden 1080×1920 e Portable esterna. R-20 resta aperto come limite dichiarato:
1080×1920/60 FPS a piena durata non è qualificato. R-22 resta debito
architetturale: i calcoli sono estratti in moduli puri, ma il controller UI
principale richiederà ulteriore scomposizione in una milestone autorizzata.

Scala:

- Probabilità (P): 1 rara, 5 quasi certa.
- Impatto (I): 1 trascurabile, 5 blocco/release non sicura.
- Esposizione: P × I.
- Un rischio è chiuso solo con evidenza verificabile, non con la sola
  implementazione.

| ID | Rischio | P | I | Esp. | Mitigazione | Test/evidenza necessaria | Componente |
|---|---|---:|---:|---:|---|---|---|
| R-01 | Refactor rompe la parità preview/export | 4 | 5 | 20 | Golden prima dell'estrazione; motore puro condiviso; cambi piccoli | Frame golden e progetto di riferimento superati | Engine |
| R-02 | Regressione projectM o trasporto frame | 3 | 5 | 15 | Non cambiare host/IPC; suite Fase 2 a ogni milestone | Banda, latenza, frame persi e runtime test entro baseline | Runtime |
| R-03 | Migrazione 5.0→6.0 perde coordinate, seed o preset | 4 | 5 | 20 | Migrazioni pure per versione; fixture reali; backup atomico | Round trip e frame legacy identici | Project |
| R-04 | Doppia fonte fra campi legacy e transform nuovi | 4 | 4 | 16 | Un solo resolver; deprecazione esplicita; assert in test | Nessuna scrittura concorrente; fixture migrata stabile | Project |
| R-05 | Plugin stateful non deterministico su seek/export | 4 | 5 | 20 | Seed esplicito; niente clock/Math.random; reset/replay definito | Due export e seek inverso con frame hash uguali | Engine |
| R-06 | Eccezione plugin blocca frame loop o audio | 3 | 5 | 15 | Boundary per layer; restore Canvas; sospensione runtime; fallback | Error injection su ogni lifecycle senza crash | Plugin host |
| R-07 | Risorse plugin non rilasciate | 3 | 4 | 12 | Factory per layer e dispose obbligatorio; tracking debug | 100 cicli + test 10 minuti senza crescita monotona | Plugin host |
| R-08 | Inspector metadata genera valori invalidi | 3 | 3 | 9 | Validator centralizzato; clamp; default; test di ogni tipo | Fuzz/branch validation verde | UI/Engine |
| R-09 | History consuma troppa RAM durante drag/slider | 4 | 4 | 16 | Delta, coalescing, transazioni, limite bytes/comandi | 300 eventi = 1 comando; memoria sotto soglia | Editor |
| R-10 | Undo parziale lascia stato incoerente | 3 | 5 | 15 | Comandi atomici; invariant check; test compositi | 200 cicli e riapertura senza divergenze | Editor |
| R-11 | Timeline lenta con molti keyframe | 4 | 3 | 12 | Cache per revisione, indicizzazione tracce, rendering limitato al viewport | 1.000 keyframe <2 ms p95; UI <16 ms p95 | Timeline |
| R-12 | Floating point produce frame diversi 30/60 FPS | 3 | 5 | 15 | Timestamp razionali/espliciti; epsilon e clamp documentati | Valori identici ai timestamp comuni | Keyframes |
| R-13 | Rotazione/scala rompe hit-test e bounds | 3 | 3 | 9 | Matrici condivise draw/hit-test; test angoli/bordi | Manipolazione corretta su tutte le risoluzioni | Preview |
| R-14 | Preset progetto confuso con Preset MilkDrop | 4 | 3 | 12 | Terminologia e sezioni separate; estensione distinta | Test UX e ricerca stringhe | UX |
| R-15 | Preset importato introduce traversal/prototype pollution | 3 | 5 | 15 | JSON non eseguibile, limiti, chiavi vietate, validazione main+engine | Suite sicurezza 100% verde | Security |
| R-16 | Preset sovrascrive il progetto prima della conferma | 3 | 4 | 12 | Parse/migra/preview in memoria; apply atomico come comando | Test rollback/cancel lascia hash progetto invariato | Project presets |
| R-17 | Asset mancanti impediscono apertura progetto | 4 | 4 | 16 | Placeholder e resolver; relink guidato; nessuna apertura all-or-nothing | Progetto apre, relink ripristina preview/export | Media |
| R-18 | Hash diverso viene accettato silenziosamente | 2 | 4 | 8 | Confronto SHA-256 e conferma esplicita | Test hash mismatch e audit event | Media |
| R-19 | Nuovi plugin riducono FPS sotto 30 | 4 | 4 | 16 | Budget geometrie; profilo per plugin; default moderati | p5 ≥27 FPS e regressione <10% sul riferimento | Performance |
| R-20 | 60 FPS dichiarato senza prova completa | 3 | 4 | 12 | Separare smoke da certificazione; linguaggio documentale vincolato | Test completo 60 FPS o limite dichiarato | QA |
| R-21 | Divergenza Canvas browser/`@napi-rs/canvas` | 3 | 5 | 15 | Sottoinsieme API comune; adapter; golden cross-backend | Confronto entro soglia predefinita | Engine |
| R-22 | `app.ts` continua a crescere e crea coupling | 5 | 3 | 15 | Estrarre controller prima delle feature; limite responsabilità/import | App bootstrap sottile e test moduli indipendenti | Architecture |
| R-23 | Modifica IPC amplia accesso filesystem | 2 | 5 | 10 | Canali specifici, schema request, dialoghi main, nessun API generico | Review security e test payload malevoli | Main/Preload |
| R-24 | Salvataggio diretto corrompe progetto | 3 | 5 | 15 | Scrittura atomica stessa directory e backup recuperabile | Fault injection su write/rename | Project |
| R-25 | Progetto futuro viene risalvato distruttivamente | 2 | 5 | 10 | Read-only/rifiuto; preservare bytes originali | Fixture 7.0 non modificata | Project |
| R-26 | Modifiche licensing/deps non valutate | 2 | 4 | 8 | Nessuna nuova dipendenza di default; audit prima di aggiungerla | SBOM/licenze aggiornate o nessuna nuova dipendenza | Release |
| R-27 | Setup/Portable omette nuovi file dati | 3 | 4 | 12 | Test packaging; risorse personali fuori bundle | Avvio esterno e inventario package | Packaging |
| R-28 | Unicode/percorsi lunghi regrediscono | 3 | 5 | 15 | Fixture e Portable matrix Fase 2 in ogni gate finale | Tutti i casi byte-esatti superati | QA |
| R-29 | Test golden nasconde un bug esistente | 2 | 3 | 6 | Golden più invariant test; review visuale; non approvare automaticamente update | Differenza motivata e revisionata | QA |
| R-30 | Scope creep verso scene/plugin terzi/autosave | 4 | 4 | 16 | Scope file vincolante; change request e revisione roadmap | Nessun task fuori perimetro nei milestone | Product |
| R-31 | Accessibilità dei controlli grafici insufficiente | 3 | 3 | 9 | Equivalenti numerici, focus, ARIA, shortcut, test tastiera | Flusso completo senza mouse | UX |
| R-32 | Effetti luminosi nuovi creano rischio fotosensibilità | 2 | 5 | 10 | Niente strobe default; limiti; warning e reduced mode se necessario | Review di ogni plugin e test frequenza | UX/Safety |
| R-33 | Stato runtime entra nel file progetto/history | 3 | 3 | 9 | Tipi separati; serializer allowlist | Fixture non contiene frame/PCM/error counters | Project |
| R-34 | Modifiche Fase 3 alterano transizioni/seed MilkDrop | 3 | 5 | 15 | Sequencer invariato; test stesso seed e transizioni | Sequenza/frame Fase 2 identici | QA |

## Condizioni che bloccano l'avanzamento

La condizione è valutata al gate della task che modifica il componente. La
presenza di una condizione blocca il gate anche se gli altri test sono verdi.

| ID | Condizione di blocco |
|---|---|
| R-01 | Qualunque golden preview/export cambia senza decisione approvata |
| R-02 | projectM crasha, perde audio/frame oltre baseline o cambia IPC |
| R-03 | Una fixture 1.0–5.0 perde un campo o cambia il frame |
| R-04 | Due campi possono determinare contemporaneamente la stessa proprietà |
| R-05 | Due render con stessi input/seed producono frame diversi |
| R-06 | Un errore plugin ferma audio, frame loop o applicazione |
| R-07 | Istanze, memoria o handle crescono oltre soglia dopo dispose |
| R-08 | Un valore invalido raggiunge il renderer o corrompe il progetto |
| R-09 | Un gesto continuo crea più di un comando o supera il budget history |
| R-10 | Undo/redo viola un invariant o non ripristina l'hash previsto |
| R-11 | 1.000 keyframe superano i budget p95 definiti |
| R-12 | I timestamp comuni a 30/60 FPS valutano valori differenti |
| R-13 | Draw e hit-test non condividono la stessa trasformazione |
| R-14 | La UI o i file chiamano un `.milk` plugin/preset di progetto |
| R-15 | Un caso di sicurezza preset viene accettato o eseguito |
| R-16 | Cancel/fallimento import modifica l'hash del progetto |
| R-17 | Un asset mancante impedisce apertura o salvataggio non distruttivo |
| R-18 | Hash differente viene sostituito senza conferma |
| R-19 | Preview 30 FPS o regressione prestazioni non rispetta le soglie |
| R-20 | Documentazione dichiara stabile 60 FPS senza test completo |
| R-21 | I backend divergono oltre la soglia definita prima del test |
| R-22 | Feature Fase 3 aggiunge ancora responsabilità monolitiche ad `app.ts` |
| R-23 | IPC espone accesso filesystem generico o accetta payload invalido |
| R-24 | Fault injection può perdere sia file corrente sia copia recuperabile |
| R-25 | Un progetto futuro può essere risalvato come 6.0 automaticamente |
| R-26 | Entra una dipendenza senza licenza/compatibilità/packaging verificati |
| R-27 | Setup o Portable non trova un file obbligatorio fuori dal workspace |
| R-28 | Un caso Unicode/percorso lungo precedentemente verde fallisce |
| R-29 | Un golden viene aggiornato senza review visiva e motivazione |
| R-30 | Un task include scene, plugin terzi, autosave o release senza change request |
| R-31 | Una nuova operazione essenziale non è completabile da tastiera/inspector |
| R-32 | Un plugin introduce strobe non limitato o attivo di default |
| R-33 | Serializer/history include PCM, frame, bitmap o contatori runtime |
| R-34 | Stesso seed non riproduce sequenza/transizione MilkDrop della baseline |

## Rischi critici e decisioni preventive

### R-01/R-21 — compositor

La dipendenza shared→renderer deve essere rimossa, ma il comportamento raster
non va riscritto nello stesso passaggio. Prima si estraggono i moduli con API
compatibile, poi si introduce il nuovo contratto. Se i golden cambiano durante
la sola estrazione, la milestone si ferma.

### R-03/R-04 — schema

L'incremento a 6.0 è autorizzabile solo dopo una mappa completa di:

- layer e ordine;
- reactive settings;
- cover/text;
- blend e intervalli;
- projectM, playlist, cronologia, marcatori e seed;
- export settings.

La migrazione non può limitarsi a sovrapporre default all'oggetto in ingresso.

### R-05/R-12 — determinismo

I plugin procedurali ricevono un PRNG contestuale derivato da seed, layer e
frame. Non possono accumulare stato dipendente dal numero di render preview.
Quando una simulazione richiede integrazione nel tempo, l'host usa step fissi e
checkpoint limitati oppure una funzione chiusa del timestamp.

### R-15/R-23 — confine di fiducia

Un preset di progetto è input non fidato. Renderer e main validano per scopi
diversi: il renderer per correttezza editoriale, il main per filesystem e
limiti. Nessun campo del preset sceglie moduli, eseguibili o librerie native.

### R-19 — prestazioni

I quattro plugin nuovi devono avere limiti di complessità indipendenti dalla
risoluzione quando possibile. Il numero di primitive/particelle ha un massimo
validato. Le ottimizzazioni vengono guidate da profili; non si introduce una
seconda pipeline visuale “veloce”.

## Processo di gestione

1. Riesaminare il registro a ogni milestone.
2. Aggiornare P/I solo con nuove evidenze.
3. Collegare ogni difetto a rischio e test.
4. Bloccare la milestone per esposizione ≥15 senza mitigazione attuata.
5. Non chiudere un rischio perché “non riprodotto” una sola volta.
6. Riportare i rischi residui nel report finale e nei problemi noti.

## Rischi accettati per il perimetro

- Nessun loader per plugin di terze parti: riduce estensibilità esterna, ma
  evita esecuzione arbitraria e incompatibilità ABI.
- Nessuna scena multipla: la Fase 3 anima una scena singola.
- 60 FPS non è automaticamente un profilo stabile.
- I preset di progetto portabili non incorporano asset per impostazione
  predefinita; riferimenti mancanti richiedono relink.
- L'accessibilità completa del canvas è limitata, ma ogni operazione introdotta
  deve avere un equivalente inspector/tastiera.

## Riesame Milestone M1

| ID | Stato M1 | Evidenza |
|---|---|---|
| R-01 | Mitigato M1 | Golden identici e parità 1080×1920/30/60 s verde |
| R-02 | Mitigato M1 | projectM 4.1.6, PCM/framebuffer e Portable esterna verdi |
| R-03 | Mitigato M1 | Fixture 1.0–5.0, idempotenza e frame 5.0 invariato |
| R-04 | Mitigato M1 | Resolver unico `resolveLayerTransform` |
| R-05 | Mitigato per i sei plugin correnti | Seek e due istanze stateful deterministici |
| R-09 | Mitigato M1 | Coalescing 100/300 eventi e limite 32 MiB |
| R-10 | Mitigato M1 | 200 undo/redo, UI, save e reopen verdi |
| R-18 | Mitigato M1 | Backup/temporaneo/fault injection 5/5 |
| R-19 | Aperto | Export 30 FPS è offline (~5,90 frame/s); 60 FPS non qualificato |
| R-22 | Aperto | Setup non provato su VM pulita e artefatti senza firma di release |

T3.05–T3.08 sono state implementate nella M2. I rischi da T3.09 in avanti
restano invariati perché quelle attività non sono state iniziate. Coverage
strumentata e symlink privilegiato restano gap di evidenza, non test superati.

## Riesame Milestone M2

| ID | Stato M2 | Evidenza |
|---|---|---|
| R-05 | Mitigato | registro unico, ID duplicati/projectM rifiutati |
| R-06 | Mitigato | istanza per layer e test con seed distinti |
| R-07 | Mitigato | soglia 3 errori, stato visibile e riattivazione |
| R-08 | Mitigato | dispose su rimozione/reset/chiusura e 100 cicli |
| R-09 | Mitigato | inspector usa descriptor e `textContent` |
| R-10 | Mitigato | golden M1 invariato dopo migrazione dei sei plugin |
| R-11 | Mitigato | nessun `Math.random`, DOM o clock reale |
| R-12 | Aperto parziale | 30 FPS offline qualificato; 60 FPS piena durata no |
| R-13 | Mitigato | Orbiting senza blur per particella; stack ~90 ms/frame |
