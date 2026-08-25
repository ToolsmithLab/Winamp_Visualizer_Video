# Architettura command history M1

## Componenti

- `Command<T>`: nome, costo stimato, `undo` e `redo`;
- `CommandDispatcher<T>`: stato corrente, revisioni ed esecuzione;
- `History<T>`: stack undo/redo e limiti;
- `ProjectStore`: API transazionale usata dal renderer;
- `historyController`: pulsanti e scorciatoie UI.

## Delta

`projectMutationCommand` confronta lo stato prima/dopo e genera patch
reversibili. Proprietà e array con identità stabile producono delta puntuali;
array strutturalmente diversi producono uno snapshot limitato a quell'array.
La history non riceve framebuffer, PCM, bitmap o altre risorse runtime.

Limiti M1:

- 200 comandi;
- 32 MiB stimati.

Superato un limite, `History` elimina le voci più vecchie in modo controllato.
Una nuova modifica dopo undo invalida lo stack redo.

## Transazioni

`beginTransaction` congela lo stato iniziale. Gli eventi continui aggiornano
solo lo stato di lavoro. `commitTransaction` crea un singolo delta fra inizio e
fine; `cancelTransaction` ripristina l'inizio senza creare history.

Sono transazionali slider e drag. I test eseguono 100 eventi slider e 300
eventi drag ottenendo un comando ciascuno.

## Estensione M3

Sono transazionali anche move/resize/rotate canvas, frecce ripetute e drag di
keyframe/clip. Ogni gesto registra un solo delta al pointer-up/key-up. Escape
chiama `cancelTransaction`, ripristina trasformazione o tempo iniziale e non
incrementa undo.

Aggiunta, rimozione, duplicazione, modifica valore/interpolazione, collisione
keyframe, reset trasformazione e input numerici sono comandi persistenti.
Selezione, guide, hover, zoom/scroll UI e playhead non entrano nella history.
Il lock viene verificato sia nei controller sia nei callback persistenti.

## Estensione M4

L'anteprima di un Preset di progetto non attraversa il `ProjectStore`: usa una
copia normalizzata nel compositor e, con Annulla, ripristina il progetto
corrente. Non incrementa revision, dirty state o history.

La conferma di applicazione `.avspreset` usa una sola `ProjectStore.update`;
anche relink singolo, relink multiplo, conferma hash differente, ignore e
remove asset sono singoli comandi annullabili. Il batch risolve e valida tutti
i candidati su una copia prima del commit: in caso di errore non viene
registrato alcun comando e lo stato originario resta invariato.

## Revisioni e dirty state

Ogni comando confermato riceve una nuova revisione monotona. Il progetto è
dirty se e solo se `revision !== savedRevision`, salvo una transazione aperta
con modifiche ancora non confermate.

- save: aggiorna `savedRevision`, conserva history;
- undo al saved revision: pulito;
- redo dalla saved revision: dirty;
- nuovo/apri: nuova revisione baseline e history vuota;
- playback, seek, frame, metriche e selezioni effimere: nessun comando.

`acceptSaved` può adottare la forma normalizzata restituita dal main senza
perdere la history.

## UI

Pulsanti `Annulla` e `Ripeti` riflettono `canUndo`/`canRedo`.
`Ctrl+Z`, `Ctrl+Y` e `Ctrl+Shift+Z` sono gestiti solo quando non è attivo un
editor nativo. Escape annulla una transazione continua.

Il test Electron M1 verifica pulsante undo, entrambe le varianti redo, dirty
prima/dopo save, conservazione history e reset dopo riapertura.
