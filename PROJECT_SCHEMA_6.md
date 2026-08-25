# Schema progetto 6.0

Versione corrente: `6.0`.

Audit M5: schema e formato `.avspreset` restano versionati separatamente.
L’applicazione di un Preset di progetto che non include asset conserva gli
elementi del manifest corrente per le categorie escluse; solo le categorie
esplicitamente incluse vengono sostituite. Il comportamento è coperto da un
test di regressione e non modifica il numero di versione dello schema.

## Modello persistente

Ogni progetto conserva dati editoriali e riproducibili:

- canvas ed export profile;
- riferimenti a audio e cover;
- artista e titolo;
- impostazioni projectM, Preset MilkDrop, playlist, transizioni e seed;
- layer ordinati, intervalli, opacità e blend mode;
- trasformazione comune `{x, y, scaleX, scaleY, rotation}`;
- `keyframes`, operativo dalla M3;
- riferimento plugin `{id, version, settings, unknownData}`;
- manifest `assets`.

## Manifest asset M4

Ogni `ProjectAssetReference` conserva `id`, `type`, `path`, `originalPath`,
`relativePath`, `fileName`, `size`, `hash`, `status` e `required`. I tipi
supportati sono audio, cover, Preset MilkDrop e texture; gli stati sono
`available`, `missing`, `hash-mismatch`, `inaccessible`, `unsupported`,
`relinked` e `ignored`.

Il salvataggio sincronizza il manifest con il modello, mentre l'apertura prova
prima il percorso corrente e poi quello relativo alla nuova posizione del
progetto. Un riferimento mancante viene preservato: il progetto si apre con
placeholder/stato esplicito e può essere ricollegato. Gli asset essenziali
irrisolti bloccano l'export prima dell'encoder; quelli opzionali possono essere
ignorati o rimossi con un comando annullabile.

Il formato `.avspreset` 1.0 è un documento separato e non modifica la versione
6.0 del progetto.

I campi legacy `pluginId` e `reactive` restano leggibili durante la
compatibilità. `resolveLayerTransform` è l'unico resolver delle coordinate
effettive; la migrazione inizializza la trasformazione in modo da non cambiare
il raster.

## Trasformazioni e keyframe nella M3

Le nuove modifiche scrivono solo `ProjectLayer.transform`; i campi posizione
storici di cover/testo non sono più aggiornati parallelamente.

Proprietà keyframe ammesse: `x`, `y`, `scale`, `rotation`, `opacity`,
`intensity`. Ogni valore è numerico e finito. L’ordine canonico è tempo/ID e
la collisione proprietà+timestamp produce un solo keyframe effettivo. La scala
animata è uniforme; senza una traccia scale restano validi `scaleX/scaleY`
base non uniformi.

`keyframes` fuori dall’intervallo clip sono preservati. Zoom, scroll,
selezione, guide e playhead sono stato UI/runtime e non vengono serializzati.
Lo schema resta 6.0 perché i campi erano già predisposti in M1.

## Plugin Canvas nella M2

Il riferimento persistente usa un ID tecnico stabile e non il nome localizzato.
Gli ID riconosciuti sono:

`spectrumBars`, `circularSpectrum`, `waveformLine`, `particleBurst`,
`pulseShapes`, `dynamicVignette`, `radialRays`, `mirroredWaveform`,
`audioGrid`, `orbitingParticles`.

projectM non è un plugin Canvas e continua a usare la sezione `projectM` e il
layer `kind: "projectM"`. Le impostazioni di un plugin noto vengono
normalizzate dal suo descriptor: valori non finiti, tipo errato, colori/select
invalidi e chiavi sconosciute non entrano nel runtime. Il lifecycle, lo stato
errore, frame, PCM e contatori non sono serializzati.

Due layer con lo stesso `plugin.id` conservano settings e ID layer distinti e
ricevono seed runtime distinti. La duplicazione è quindi riproducibile ma non
condivide stato mutabile.

## Dati non persistenti

La validazione rifiuta valori non serializzabili e dati runtime, inclusi PCM,
framebuffer, bitmap, metriche, contatori errore, playhead, PID, handle e
istanze. `NaN` e `Infinity` sono invalidi.

## Migrazioni

| Da | A | Responsabilità |
|---|---|---|
| 1.0 | 2.0 | Normalizzazione delle sezioni storiche iniziali |
| 2.0 | 3.0 | Aggiunta dei campi introdotti dalla terza revisione |
| 3.0 | 4.0 | Compatibilità livelli e impostazioni projectM |
| 4.0 | 5.0 | Modello completo della Fase 2 |
| 5.0 | 6.0 | Plugin generico, transform, keyframes e assets |

`migrateProjectDocument` non modifica l'input, è idempotente e applica ogni
passo esplicito. Le fixture 1.0–5.0 arrivano tutte a 6.0 senza perdita di layer,
ordine, intervalli, blend, cover, testi, projectM, preset, seed o transizioni.
Il confronto raster della fixture 5.0 prima/dopo è identico.

Un plugin sconosciuto conserva `id`, versione, settings e `unknownData`, ma non
viene istanziato. Una versione maggiore di 6.0 è rifiutata con un messaggio
comprensibile e non viene sovrascritta.

## Salvataggio

Il main process:

1. valida e serializza;
2. crea un temporaneo esclusivo nella directory destinazione;
3. scrive, esegue `fsync` e chiude;
4. sincronizza e sostituisce il backup `.bak` se esiste un originale;
5. rinomina il temporaneo sulla destinazione;
6. sincronizza il file finale e rimuove i temporanei.

Le fault injection coprono JSON invalido, errore scrittura, disco pieno,
interruzione e rename. In ogni caso verificato il contenuto originale resta
integro; il backup recuperabile è mantenuto quando applicabile.

## Compatibilità

L'apertura migra in memoria. Il salvataggio esplicito produce 6.0; non avviene
un risalvataggio silenzioso. Nuovo e apertura impostano una nuova baseline di
revisioni e history vuota.
