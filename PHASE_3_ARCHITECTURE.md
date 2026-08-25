# Fase 3 — architettura tecnica

Stato del documento: decisione proposta, 29 luglio 2026.  
Non autorizza modifiche al codice.

## 1. Architettura attuale

### Processo main

`src/main/main.ts` avvia Electron. `src/main/ipc.ts` concentra dialoghi,
lettura media, salvataggio/apertura progetto, export, projectM, Libreria preset
e catalogo. projectM gira in un host nativo separato; l'export usa
`@napi-rs/canvas` e la pipeline FFmpeg/OpenH264 già verificata.

### Preload e IPC

`src/preload/preload.ts` espone una API limitata tramite `contextBridge`.
L'isolamento è corretto come direzione generale. Non esistono API per preset di
progetto, ricollegamento media generico, autosave o log.

### Renderer

`src/renderer/app.ts` contiene circa 1.900 righe: markup, stato effimero,
listener, salvataggio, playback, projectM, preset, livelli, timeline ed export.
`src/renderer/styles.css` contiene circa 1.300 righe. La concentrazione rende
rischioso aggiungere host, history, keyframe e preset direttamente nel file.

`src/renderer/state.ts` offre `replace`, `update` e subscribe tramite
`structuredClone`; non distingue comandi, transazioni, undo/redo o modifiche
persistenti da stato runtime.

### Modello e rendering

`src/shared/project.ts` usa lo schema `5.0`. Layer e plugin sono union chiuse;
le impostazioni dei plugin sono limitate a `ReactiveSettings`. Cover e testo
sono proprietà globali separate dai layer. Non esistono trasformazione
generica, keyframe, preset di progetto o asset manifest.

`src/shared/sceneCompositor.ts` è la base comune di preview ed export, ma
importa `src/renderer/plugins/visualizerHost.ts`: il livello shared dipende dal
renderer. `VisualizerHost` registra sei plugin in un record hardcoded. Il
contratto corrente contiene solo `id`, `render` e `reset?`.

`PreviewRenderer` supporta selezione, movimento di cover/testi,
ridimensionamento della cover e safe area. La timeline mostra waveform,
marcatori e intervalli, ma non modifica graficamente clip o keyframe.

### Persistenza

Il progetto viene scritto direttamente con `writeFile` e normalizzato in
apertura. La normalizzazione porta ogni input alla versione corrente, ma non
dispone di una catena di migrazioni esplicite per versione. Audio o cover
mancanti causano un errore in apertura, senza flusso di ricollegamento. Il
salvataggio non è atomico.

## 2. Principi architetturali

1. Una sola semantica visuale per preview ed export.
2. Valutazione deterministica in funzione di progetto, audio, tempo e seed.
3. projectM resta isolato e non acquisisce dipendenze ABI da Electron.
4. I plugin Canvas sono codice integrato e fidato; i dati importati non sono
   eseguibili.
5. Stato persistente, stato UI e risorse runtime restano distinti.
6. Ogni modifica editoriale passa attraverso un comando reversibile.
7. Le migrazioni sono esplicite, pure, idempotenti e testate.
8. La refactorizzazione è incrementale e protetta da test golden/regressione.

## 3. Architettura target

```text
Renderer UI
  ├─ App shell / controller
  ├─ Layer panel / Inspector / Timeline / Preset project view
  └─ Command dispatcher + History
               │
               ▼
      Project document (persistente)
               │
      migrate → validate → normalize
               │
               ▼
      Frame evaluator(time, audio, seed)
        ├─ keyframe evaluator
        ├─ layer/property resolver
        └─ preset sequence resolver esistente
               │
               ▼
        Shared SceneCompositor
        ├─ Canvas PluginHost
        ├─ projectM framebuffer
        ├─ cover
        └─ text
          │             │
          ▼             ▼
     Preview Canvas  Offline Canvas → encoder
```

Il frame evaluator non consulta DOM, clock reale, `Math.random()` o stato
globale. Preview ed export gli passano timestamp di frame espliciti.

## 4. Moduli proposti

### Engine condiviso

```text
src/engine/
  plugins/
    types.ts
    registry.ts
    host.ts
    validation.ts
  keyframes/
    types.ts
    evaluator.ts
    interpolation.ts
    propertyPaths.ts
  composition/
    sceneCompositor.ts
    frameEvaluator.ts
  project/
    migrations.ts
    validation.ts
    assetResolver.ts
```

Questi moduli non devono importare `renderer`, Electron o Node. Il compositor
può ricevere adapter Canvas compatibili con browser e `@napi-rs/canvas`.

### Renderer

```text
src/renderer/
  app.ts
  appController.ts
  commands/
    command.ts
    commandDispatcher.ts
    history.ts
    projectCommands.ts
  inspector/
    inspectorController.ts
    parameterControls.ts
  layers/
    layerController.ts
  timeline/
    timelineController.ts
    timelineGeometry.ts
    snapping.ts
  preview/
    previewRenderer.ts
    transformController.ts
  projectPresets/
    projectPresetView.ts
```

`app.ts` diventa bootstrap e composizione dei controller. L'estrazione deve
avvenire per comportamento, senza una riscrittura unica.

### Main

```text
src/main/
  project/
    projectFileService.ts
    projectPresetService.ts
    atomicWrite.ts
    mediaRelinkService.ts
```

Il main valida nuovamente ogni payload proveniente dal renderer. I dialoghi e
l'accesso al filesystem restano fuori dal renderer.

## 5. Contratto plugin

Il contratto target separa descriptor immutabile e istanza runtime:

```ts
interface VisualizerPluginDescriptor {
  id: string;
  name: string;
  category: string;
  version: string;
  parameters: readonly PluginParameter[];
  defaultSettings: Readonly<Record<string, PluginValue>>;
  create(context: PluginCreateContext): VisualizerPluginInstance;
}

interface VisualizerPluginInstance {
  initialize(): void;
  render(frame: VisualizerRenderContext): void;
  resize(width: number, height: number): void;
  reset(reason: ResetReason): void;
  serialize(): Record<string, PluginValue>;
  deserialize(settings: Record<string, PluginValue>): void;
  dispose(): void;
}
```

Decisioni:

- `id` e `version` sono persistiti;
- il registro rifiuta ID duplicati;
- una factory crea sempre una istanza per layer;
- anche i plugin stateless rispettano il ciclo di vita;
- l'host cattura l'errore per layer/frame, ripristina lo stato Canvas e rende
  un fallback non invasivo;
- dopo una soglia di errori consecutivi il layer viene sospeso nella sessione,
  senza modificare silenziosamente il progetto;
- l'errore è visibile, ma playback, projectM e altri layer continuano;
- `dispose` viene chiamato su eliminazione layer, cambio progetto e chiusura.

Non è previsto un loader dinamico. Aggiungere codice eseguibile esterno
richiederebbe sandbox, firma, modello permessi e una fase dedicata.

## 6. Parametri e inspector

Tipi ammessi:

- number/range;
- color;
- boolean;
- select.

Ogni parametro dichiara chiave, etichetta, tipo, default, limiti, passo,
animabilità e, per select, opzioni. La validazione tronca numeri fuori limite,
rifiuta valori non finiti e sostituisce select/color invalidi con il default.

Le impostazioni persistite appartengono al layer:

```ts
plugin: {
  id: string;
  version: string;
  settings: Record<string, PluginValue>;
}
```

`reactive` può essere migrato nei settings comuni senza alterare il risultato
dei sei plugin. I dati sconosciuti vengono conservati in lettura per consentire
il recupero di plugin mancanti, ma non passati al renderer senza validazione.

## 7. Modello trasformazioni e keyframe

Ogni layer editoriale animabile deve esporre una trasformazione uniforme:

```ts
transform: {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}
```

Le coordinate restano normalizzate rispetto al canvas. La migrazione traduce
cover e posizioni testo esistenti senza cambiare il frame. Per ridurre il
rischio, i valori legacy possono restare durante una versione di transizione,
ma una sola funzione resolver decide il valore effettivo.

Un keyframe contiene:

```ts
{
  id: string;
  property: AnimatableProperty;
  time: number;
  value: number;
  interpolation: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "hold";
}
```

Regole:

- tempi quantizzati al frame solo durante editing/snap, non durante parsing;
- ordinamento per tempo e poi ID stabile;
- a parità di proprietà/tempo prevale l'ultimo comando esplicito;
- prima del primo keyframe vale il valore base;
- dopo l'ultimo vale l'ultimo keyframe;
- interpolazioni implementate con funzioni pure;
- opacità e scale sono clamped; rotazione è normalizzata in modo coerente;
- il valutatore produce una vista effettiva senza mutare il progetto.

## 8. Comandi e history

Il `CommandDispatcher` è l'unico ingresso per modifiche persistenti introdotte
in Fase 3. Ogni comando espone applicazione, inversione, descrizione e costo
stimato. Esempi:

- `SetPropertyCommand`;
- `TransformLayerCommand`;
- `Add/Delete/DuplicateLayerCommand`;
- `MoveLayerCommand`;
- `Add/Move/DeleteKeyframeCommand`;
- `ApplyProjectPresetCommand`.

I gesti continui aprono una transazione su pointerdown/input e la chiudono su
pointerup/change. La history conserva delta o snapshot circoscritti, non frame,
PCM, bitmap o l'intero progetto per ogni movimento. Limiti proposti: 200
comandi e 32 MiB stimati, eliminando prima i più vecchi.

Salva non svuota la history; nuovo/apri progetto sì. Il dirty state deriva da
un revision ID confrontato con la revisione salvata, non da un booleano
aggiornato manualmente.

## 9. Preset di progetto e sicurezza

Formato proposto: `.avspreset`, JSON UTF-8 versionato.

Il file contiene solo dati visuali. Per impostazione predefinita non incorpora
audio, immagini, `.milk`, texture o binari. I riferimenti facoltativi includono
tipo, percorso relativo se applicabile e SHA-256; non conferiscono diritti di
redistribuzione.

Pipeline:

1. selezione nel main;
2. limite dimensione e lettura UTF-8;
3. parse JSON;
4. verifica schema/versione/tipi/limiti;
5. migrazione in memoria;
6. risoluzione asset senza accesso fuori dalle radici consentite;
7. anteprima delle modifiche;
8. conferma utente;
9. singolo comando atomico applicato al progetto.

Rifiutare percorsi assoluti nei bundle portabili, device path, traversal,
proprietà pericolose (`__proto__`, `constructor`, `prototype`), payload
eccessivi e valori non finiti. Nessun campo viene interpretato come HTML,
JavaScript, comando, URL da eseguire o percorso di libreria.

## 10. Persistenza e migrazioni

Nuovo schema proposto: `6.0`, introdotto solo durante implementazione.

Catena obbligatoria:

```text
1.x → 2.x → 3.x → 4.x → 5.0 → 6.0 → validate → normalize
```

Ogni migrazione è pura, non muta l'input e ha fixture golden. Un progetto con
versione futura viene aperto in sola lettura o rifiutato con messaggio chiaro;
non deve essere risalvato distruttivamente.

Il salvataggio deve diventare atomico: file temporaneo nella stessa directory,
flush/close, sostituzione controllata e backup recuperabile dell'ultima copia.
Questa modifica è inclusa perché protegge il nuovo schema; non equivale ad
autosave.

Per media mancanti, il progetto viene comunque aperto con placeholder e lista
di riferimenti irrisolti. Il ricollegamento verifica tipo e hash, consente una
scelta esplicita in caso di hash diverso e aggiorna il progetto tramite comando.

## 11. Preview ed export

Il flusso condiviso rimane:

```text
timestamp frame
  → audio snapshot
  → preset sequence projectM
  → keyframe evaluation
  → SceneCompositor
  → preview oppure canvas offline
```

I plugin non possono leggere `performance.now()`, DOM, dimensione CSS o
`Math.random()`. Ogni pseudo-casualità usa seed di progetto, ID layer e indice
frame. Il seek resetta lo stato in modo definito; un plugin stateful deve poter
ricostruire il frame tramite replay deterministico o stato derivato dal tempo.

Per evitare divergenze, nessun parametro animato viene calcolato nel solo
inspector o nel solo export. Le selection outline, guide e maniglie sono UI e
non entrano nell'export.

## 12. IPC e confini di fiducia

Nuovi canali minimi:

- seleziona/importa/esporta preset di progetto;
- salva/elimina/elenca preset personali;
- seleziona file per ricollegamento media;
- opzionale verifica hash.

Ogni canale ha request/response tipizzate in `src/shared/ipc.ts`; il main
ricontrolla tipo, dimensioni e percorso. Non viene introdotto un IPC generico
filesystem. projectM e i suoi frame mantengono trasporto, backpressure e
isolamento già verificati.

## 13. Strategia prestazioni

- preindicizzare keyframe per layer/proprietà e invalidare la cache solo a
  cambio revisione;
- riusare array, istanze plugin e geometrie quando dimensioni/settings non
  cambiano;
- vietare clone del progetto e allocazioni proporzionali al numero totale di
  keyframe nel percorso di ogni frame;
- limitare particelle e primitive tramite metadata validati;
- renderizzare nella timeline solo il viewport visibile se le misure
  dimostrano che il DOM completo supera il budget;
- profilare separatamente compositor, singoli plugin, keyframe evaluator e UI;
- mantenere la risoluzione preview indipendente dall'export;
- non introdurre una pipeline semplificata che comprometta la parità.

Budget e soglie sono definiti in `PHASE_3_TEST_PLAN.md`; un'ottimizzazione che
cambia i frame richiede una decisione esplicita e nuovi golden.

## 14. Alternative valutate e scartate

### Inserire tutte le funzioni in `app.ts`

Scartata: aumenta l'accoppiamento già elevato e impedisce test unitari di
history, timeline e preset. Si adotta un'estrazione incrementale in controller.

### Usare un framework UI o uno store esterno

Scartata per la Fase 3: richiederebbe riscrittura del renderer e nuove
dipendenze senza necessità dimostrata. Command dispatcher e controller
TypeScript sono sufficienti.

### Snapshot dell'intero progetto per ogni undo

Scartata: drag e slider moltiplicherebbero clone e memoria. Si usano comandi
delta, transazioni e coalescing.

### Host plugin dinamico per JavaScript di terze parti

Scartato: introdurrebbe esecuzione di codice non fidato, sandbox, firme,
compatibilità e distribuzione. Il registro contiene solo plugin integrati.

### Trattare projectM come uno dei dieci plugin

Scartato: projectM ha host C++ separato, lifecycle, licenza, input audio e
trasporto frame differenti. Rimane un livello composito separato.

### Calcolare i keyframe solo nel renderer

Scartato: l'export divergerebbe. Il valutatore vive nel motore condiviso.

### Ricostruire i visual in FFmpeg

Scartato: violerebbe la parità già ottenuta in Fase 2. FFmpeg resta encoder e
muxer.

### Includere asset binari dentro ogni preset

Scartato come default: aumenta dimensioni, superficie ZIP, duplicati e problemi
di licenza. Il formato base usa riferimenti+hash e relink guidato.

### Includere scene multiple, autosave e release

Scartato dal perimetro: scene/keyframe avanzati appartengono alla Fase 4;
autosave, log e distribuzione alla Fase 5. Potranno riusare i moduli progettati
qui senza bloccare la chiusura del sistema plugin.

## 15. Sequenza di implementazione raccomandata

1. test di caratterizzazione e confini modulari;
2. motore shared e rimozione dipendenza shared→renderer;
3. schema 6.0 e migrazioni;
4. command dispatcher/history;
5. contratto e registro plugin;
6. migrazione dei sei plugin;
7. inspector generato e gestione istanze;
8. quattro plugin nuovi;
9. trasformazioni, timeline e keyframe;
10. preset di progetto e ricollegamento;
11. accessibilità, prestazioni e audit finale.

Questa sequenza evita di costruire UI e keyframe sopra il modello monolitico
corrente e conserva un punto di rollback verificabile dopo ogni milestone.
