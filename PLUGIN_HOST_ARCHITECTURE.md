# Architettura host plugin Canvas — Fase 3 M2

Aggiornato il 29 luglio 2026. Il termine “plugin” in questo documento indica
esclusivamente i dieci visualizzatori Canvas fidati compilati con
l'applicazione. Il Motore projectM e i Preset MilkDrop non appartengono al
registro.

## Confini

Il codice condiviso è in `src/engine/plugins` e non importa Electron, DOM,
renderer, Node.js, clock reale o codice di terze parti. Il registro è la sola
fonte per host, validazione e inspector. Non esiste un loader JavaScript
esterno.

Il flusso è:

`ProjectLayer → PluginRegistry → factory create → PluginInstance → SceneCompositor`

Preview Electron e compositor offline invocano lo stesso `SceneCompositor` e
quindi lo stesso `VisualizerHost`.

## Descriptor e istanza

`PluginDescriptor` è immutabile e contiene ID stabile, nome, categoria,
versione, descrizione, default, schema parametri e factory. `PluginInstance`
contiene lo stato runtime di un solo layer e implementa:

1. `initialize`;
2. `render`;
3. `resize`;
4. `reset`;
5. `serialize`;
6. `deserialize`;
7. `dispose`.

Ogni `ProjectLayer.id` possiede una factory instance distinta. Il seed è
derivato dal seed progetto e dall'ID layer; nessuno stato mutabile è condiviso
fra due istanze.

## Lifecycle

L'host crea l'istanza alla prima renderizzazione. Inizializza una sola volta,
chiama `resize` al cambio dimensione e `deserialize` quando cambia la firma
delle impostazioni normalizzate. Seek indietro resetta l'intero host in modo
deterministico.

`dispose` viene eseguito quando:

- un layer viene rimosso durante `reconcile`;
- un layer cambia tipo di plugin;
- viene aperto o creato un progetto;
- viene richiesto reset del runtime;
- preview/compositor offline vengono chiusi.

La prova automatica copre 100 cicli create/render/dispose e tutte le operazioni
del lifecycle.

## Isolamento errori

Ogni chiamata runtime è protetta per istanza. L'host:

- racchiude il render in `CanvasRenderingContext2D.save/restore`;
- conserva il layer persistente;
- segnala stato e messaggio leggibile all'inspector;
- non interrompe gli altri layer, audio o projectM;
- sospende solo l'istanza dopo 3 errori consecutivi;
- permette reset/riattivazione;
- tenta comunque il cleanup se `reset` o `dispose` sollevano eccezioni.

Gli stati `ready`, `error`, `suspended` e `missing` sono esclusivamente runtime
e non entrano nel file progetto o nella history.

## Determinismo

I plugin ricevono timestamp, delta deterministico, snapshot audio e seed. Sono
vietati `Math.random`, `Date.now`, `performance.now`, DOM e stato globale.
Reset, resize e seek ricostruiscono lo stato partendo dagli stessi input.

## Budget

I limiti geometrici sono dichiarati nei descriptor. Il benchmark forza la
rasterizzazione `canvas.data()` e misura media, p95, memoria del ciclo e
dispose. `Orbiting Particles` usa trail geometrici senza shadow blur per
evitare una rasterizzazione per particella; questa scelta ha ridotto lo stack
M2 1080×1920 da circa 10,4 s/frame a circa 90 ms/frame sulla macchina di test.

Il profilo 1080×1920/30 FPS resta un export offline. Non viene dichiarato
real-time e 60 FPS a piena durata non è qualificato.
