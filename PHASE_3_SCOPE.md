# Fase 3 — ambito approvabile

Stato del documento: piano tecnico, 29 luglio 2026.  
Stato implementazione: non iniziata.

## 1. Fonte e interpretazione della roadmap

La definizione esplicita della Fase 3 è in
`Audio_Visualizer_Studio_Spec_v2.md`, sezione 24:

> Sistema plugin completo: plugin host, 10 plugin, preset,
> import/export preset, modalità fusione, keyframe base.

La roadmap originale collocava livelli, trasformazioni, inspector, timeline,
waveform e sei visualizzatori complessivi nella Fase 2. Nel repository attuale
la Fase 2 è cresciuta oltre quella previsione: comprende projectM reale,
Preset MilkDrop, transizioni fra preset, catalogo, build Windows e composizione
frame-by-frame comune a preview ed export. Queste funzioni sono una baseline da
preservare, non elementi da reimplementare in Fase 3.

In questo documento:

- **plugin visuale** indica un visualizzatore Canvas integrato e fidato;
- **Motore projectM** resta un motore nativo isolato;
- **Preset MilkDrop** indica esclusivamente un file `.milk`;
- **preset di progetto** indica una configurazione serializzata dell'editor.

I Preset MilkDrop non saranno mai chiamati plugin.

## 2. Stato reale rispetto alla Fase 3 originale

| Requisito originale | Stato attuale | Decisione Fase 3 |
|---|---|---|
| Plugin host | Parziale | Completare contratto, registro, ciclo di vita, metadati e isolamento dello stato |
| 10 plugin | Parziale: 6 Canvas | Aggiungere 4 visualizzatori Canvas deterministici; projectM non conta nel totale |
| Preset | Assente come preset di progetto; presente la libreria MilkDrop | Introdurre preset di progetto separati e chiaramente denominati |
| Import/export preset | Assente per preset di progetto | Aggiungere JSON versionato, validato e non eseguibile |
| Modalità fusione | Presente: 7 modalità in preview/export | Conservare e coprire con regressioni; nessuna riscrittura |
| Keyframe base | Assente | Introdurre modello, valutatore deterministico, editor e timeline minimi |

Funzioni correlate:

| Area | Stato attuale | Classificazione |
|---|---|---|
| Spostamento diretto | Cover e testi | Parziale |
| Ridimensionamento diretto | Solo cover, una maniglia | Parziale |
| Rotazione, guide, griglia, snap | Assenti | Necessarie solo nella misura utile ai keyframe base |
| Timeline | Waveform, seek, marcatori e intervalli non editabili graficamente | Parziale |
| Livelli | Visibilità, lock, rinomina, ordine; duplica solo visualizzatori | Parziale |
| Undo/redo | Assente | Prerequisito tecnico della Fase 3 |
| Salvataggio/riapertura | Presente | Da migrare senza perdita |
| Ricollegamento media generico | Assente; esiste solo per Preset MilkDrop | Necessario per preset di progetto portabili |
| Autosave/recovery | Assente | Rinviato |
| Log persistenti | Assenti | Rinviati |
| Scene multiple | Assenti | Fase 4 |
| Setup e Portable | Presenti | Solo regressione, non sviluppo Fase 3 |

## 3. Obiettivo della Fase 3

Consegnare un sistema di visualizzatori Canvas realmente estendibile e
deterministico, con dieci plugin integrati, impostazioni descritte da metadati,
preset di progetto sicuri e keyframe di base modificabili nella timeline.

La stessa valutazione temporale e lo stesso renderer devono alimentare preview
ed export. Nessuna funzione può essere considerata completata se esiste solo
nell'interfaccia, usa un mock o viene approssimata in FFmpeg.

### Motivazione

L'editor dispone già di una pipeline visuale solida, ma l'estensione dei
visualizzatori avviene tramite union e registri hardcoded, lo stato non supporta
comandi reversibili e il formato non può descrivere keyframe o impostazioni
plugin generiche. Aggiungere direttamente nuove funzioni al renderer monolitico
aumenterebbe il rischio sulla Fase 2. La Fase 3 deve quindi completare prima i
contratti e gli strumenti editoriali strettamente necessari.

### Risultato atteso

Un utente può comporre una scena con dieci visualizzatori Canvas reali,
configurare istanze indipendenti, animare proprietà di base, annullare e
ripetere modifiche, salvare/importare preset di progetto e ottenere in MP4 lo
stesso risultato della preview, mantenendo projectM e i Preset MilkDrop
inalterati.

## 4. Funzioni incluse

### 4.1 Fondazioni e protezione della baseline

- congelamento di una matrice di regressione Fase 2;
- estrazione graduale dell'orchestrazione da `src/renderer/app.ts`;
- eliminazione della dipendenza inversa per cui `src/shared/sceneCompositor.ts`
  importa un modulo renderer;
- separazione fra modello persistito, stato effimero UI e stato runtime;
- migrazioni esplicite e testate dal formato progetto 1.0–5.0 al nuovo formato.

### 4.2 Host plugin completo

- contratto per plugin Canvas integrati con identificatore stabile, nome,
  categoria, versione, impostazioni predefinite e parametri;
- factory per istanza per livello;
- ciclo di vita `initialize`, `render`, `reset`, `resize`, `serialize`,
  `deserialize` e `dispose`, con operazioni sincrone dove possibile;
- registro centralizzato e interrogabile dalla UI;
- validazione e valori di fallback per impostazioni mancanti o non valide;
- gestione comprensibile del plugin assente;
- stato separato per ogni istanza/livello;
- rilascio verificabile delle risorse;
- nessun caricamento o esecuzione di JavaScript di terze parti.

projectM rimane fuori dal contratto dei plugin Canvas: conserva il proprio host
nativo separato e viene composto come livello dallo stesso compositor.

### 4.3 Dieci visualizzatori Canvas

Migrare senza variazioni visive i sei esistenti:

1. Spectrum Bars;
2. Circular Spectrum;
3. Waveform Line;
4. Particle Burst;
5. Pulse Shapes;
6. Dynamic Vignette.

Aggiungere quattro visualizzatori integrati:

7. Radial Rays;
8. Mirrored Waveform;
9. Audio Grid;
10. Orbiting Particles.

I nomi finali possono essere localizzati, ma gli ID persistiti restano stabili.
Ogni plugin deve reagire a PCM reale, essere deterministico a parità di
timestamp, audio, impostazioni e seed, e funzionare nello stesso compositor
browser/offline.

### 4.4 Livelli e inspector generato

- aggiunta di nuove istanze visualizzatore dal registro;
- duplicazione ed eliminazione sicura delle istanze visualizzatore;
- impostazioni specifiche per istanza, serializzate nel progetto;
- controlli inspector generati dai metadati dei parametri;
- modifica numerica di trasformazione e opacità;
- trascinamento, ridimensionamento e rotazione di cover e testi;
- transazioni uniche per un gesto continuo;
- snap configurabile a bordi, centro, griglia e marcatori temporali;
- preservazione di lock, visibilità, ordine, intervalli e blend.

Il raggruppamento livelli e la selezione multipla non sono necessari per
chiudere la Fase 3.

### 4.5 Undo e redo

- comandi reversibili per ogni modifica persistente di Fase 3;
- coalescing per slider, drag, resize e rotazione;
- limite di memoria e numero di comandi;
- invalidazione del redo dopo una nuova modifica;
- reset della cronologia su nuovo/apri progetto;
- scorciatoie Ctrl+Z, Ctrl+Y e Ctrl+Shift+Z;
- nessuna registrazione in cronologia di playhead, metriche o frame runtime.

### 4.6 Keyframe base

Proprietà minime:

- posizione X/Y;
- scala;
- rotazione;
- opacità;
- intensità del visualizzatore.

Interpolazioni:

- lineare;
- ease in;
- ease out;
- ease in/out;
- hold.

Funzioni:

- aggiungi, sposta, modifica ed elimina keyframe;
- indicazione nella timeline e nell'inspector;
- un keyframe per proprietà e timestamp normalizzato;
- ordinamento stabile e collisione risolta esplicitamente;
- valutazione pura al tempo del frame;
- seek deterministico in entrambe le direzioni;
- stessa valutazione in preview ed export.

Colore, velocità, numero particelle, sensibilità audio, curve personalizzate e
keyframe fra scene sono rinviati ai keyframe avanzati della Fase 4.

### 4.7 Timeline minima necessaria

- zoom orizzontale;
- playhead e waveform preservati;
- clip con inizio/fine modificabili;
- keyframe visibili e selezionabili;
- trascinamento dei keyframe;
- snap disattivabile a frame, marcatori e limiti clip;
- valori numerici accessibili dall'inspector;
- nessuna timeline multi-scena.

Lo snap ai beat è escluso finché l'analisi musicale non dispone di una
metrica di affidabilità verificata.

### 4.8 Preset di progetto

- salvataggio della configurazione visuale senza incorporare codice;
- nome, descrizione, versione schema, autore dichiarato facoltativo, data,
  canvas, livelli, plugin, parametri, keyframe e impostazioni visuali;
- scelta esplicita se includere o escludere riferimenti a cover, audio e
  Preset MilkDrop;
- crea, applica, rinomina, duplica, elimina, importa ed esporta;
- importazione JSON con limiti, validazione, normalizzazione e conferma;
- nessuna esecuzione di contenuto;
- segnalazione e ricollegamento guidato degli asset mancanti;
- import atomico: nessuna modifica al progetto se la validazione fallisce;
- distinzione visibile da Libreria preset e Preset MilkDrop.

### 4.9 Compatibilità, accessibilità e prestazioni

- apertura dei progetti 1.0–5.0 e conservazione dei dati;
- errore gestito per plugin sconosciuto, mantenendo i dati per un futuro
  ripristino;
- etichette, focus visibile e operazioni da tastiera per i nuovi controlli;
- avviso per effetti potenzialmente fotosensibili, se uno dei nuovi plugin li
  introduce;
- rendering preview senza allocazioni per-frame evitabili;
- nessuna regressione misurabile della pipeline projectM e di export;
- Setup e Portable verificati a fine fase, senza cambiare la distribuzione
  projectM/FFmpeg salvo necessità dimostrata.

## 5. Funzioni esplicitamente escluse

- scene multiple e transizioni fra scene;
- keyframe avanzati, curve editor, espressioni e modulazione audio dei
  keyframe;
- plugin binari, npm, script o pacchetti di terze parti;
- marketplace o download di plugin;
- supporto a formati plugin Winamp;
- riscrittura di projectM, libreria MilkDrop, catalogo o transizioni MilkDrop;
- sostituzione del compositor condiviso con filtri FFmpeg;
- rendering GPU nuovo o cambio del codec;
- autosave, crash recovery e cartella log persistente;
- aggiornamenti, installer nuovo, telemetria e processo di release;
- scene/template demo redistribuiti;
- collaborazione, cloud, multiutente;
- editor audio o modifica del file sorgente.

## 6. Dipendenze

### Dipendenze obbligatorie esistenti

- Electron dichiarato `^37.2.0`, risolto nel lockfile a `37.10.3`;
- TypeScript `^5.8.3`;
- Vite `^7.0.5`;
- `@napi-rs/canvas` 1.0.3 per il compositor offline;
- pipeline projectM, OpenH264/FFmpeg e IPC già verificata in Fase 2.

### Nuove dipendenze

Nessuna nuova dipendenza runtime è richiesta dal piano iniziale. Registro,
metadati, validazione, history e interpolazioni sono abbastanza piccoli e
critici da essere implementati come moduli TypeScript tipizzati e testabili.

Una libreria di validazione schema può essere rivalutata soltanto se:

1. riduce effettivamente codice e superficie di errore;
2. funziona senza `eval`;
3. è compatibile con Electron e con il renderer offline;
4. licenza, peso e manutenzione vengono verificati;
5. l'introduzione è approvata separatamente.

## 7. Criteri di completamento

La Fase 3 è completata soltanto quando:

1. esistono dieci plugin Canvas reali e il conteggio non include projectM;
2. ogni plugin è registrato tramite il nuovo contratto, non tramite branch UI
   o record hardcoded paralleli;
3. tutte le istanze dispongono di stato indipendente e rilascio risorse;
4. preset di progetto validi completano import/export e round trip;
5. file preset malformati o ostili non modificano né bloccano l'app;
6. i keyframe minimi sono modificabili e visibili nella timeline;
7. preview ed export valutano lo stesso stato allo stesso timestamp;
8. undo/redo copre tutte le operazioni introdotte e i gesti continui producono
   un solo comando;
9. progetti 1.0–5.0 si aprono senza perdita delle funzioni Fase 2;
10. preset/plugin/asset mancanti producono fallback e messaggi comprensibili;
11. projectM, Preset MilkDrop, Unicode/percorsi lunghi, transizioni, seed,
    salvataggio e parità preview/export non regrediscono;
12. test automatici, manuali, Setup e Portable soddisfano
    `PHASE_3_TEST_PLAN.md`;
13. non rimangono mock, controlli decorativi o risultati dichiarati senza test.

## 8. Criteri di non completamento

La Fase 3 non è completata se:

- il decimo visualizzatore è projectM o un placeholder;
- un plugin funziona solo in preview o solo in export;
- i keyframe sono solo grafica di timeline senza valutazione nel compositor;
- il preset di progetto può eseguire codice o aggirare la validazione;
- undo/redo perde lo stato o crea centinaia di snapshot durante un drag;
- la migrazione sovrascrive dati sconosciuti senza avviso;
- i risultati dipendono dal frame rate o dall'ordine casuale delle chiamate;
- un errore di plugin chiude l'app o interrompe l'audio;
- una regressione Fase 2 rimane aperta.
