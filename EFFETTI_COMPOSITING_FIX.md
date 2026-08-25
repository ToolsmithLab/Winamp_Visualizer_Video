# Correzione compositing effetti e UI semplice

Aggiornato il 30 luglio 2026.

## Esito

La pipeline usa ora lo stesso `SceneCompositor` in anteprima ed esportazione e
applica l'ordine visibile seguente:

1. cover;
2. effetto Canvas oppure projectM;
3. titolo;
4. artista.

L'ordine viene normalizzato quando si crea, apre o modifica un progetto nella
UI semplice. Rimane invariato durante Play, save/reopen ed export.

## Cause corrette

- Gli effetti Canvas erano renderizzati direttamente sul canvas finale e
  potevano ereditare uno sfondo o un blend non trasparente.
- Il framebuffer BGRA di projectM veniva trattato come immagine opaca: il nero
  del preset copriva quindi la cover.
- Le trasformazioni dei layer effetto erano registrate nel progetto ma non
  applicate alla superficie visuale.
- Il layer creato dalla UI semplice poteva essere inserito sotto la cover.
- Il menu nativo dei preset rimaneva vincolato allo scroll della sidebar.
- L'host projectM non inizializzava esplicitamente tutti gli stati OpenGL di
  viewport, scissor e pack prima di `glReadPixels`.

## Implementazione

### Canvas

Ogni plugin Canvas viene renderizzato in una superficie RGBA riutilizzabile,
azzerata con `clearRect` a ogni frame. La superficie trasparente viene poi
composta sopra la cover con opacità, blend e trasformazione del layer.

### projectM

projectM 4.1.6 resta nel processo host C++ separato. Il BGRA reale viene
convertito in RGBA con alpha derivato da luminanza e saturazione: il nero
rimane trasparente, mentre linee e forme luminose restano visibili. Il layer
usa `screen`, opacità separata e intensità 0-200%.

L'host imposta viewport e pack state, disabilita lo scissor, pulisce i buffer e
inizializza a zero l'intero buffer di lettura. Le stesse validazioni di
dimensione, stride e lunghezza vengono eseguite in preview ed export.

### Trasformazioni

Canvas e projectM sono selezionabili con click e mostrano una gabbia di
controllo interna al canvas, così tutte le maniglie restano raggiungibili anche
per un effetto full-bleed. Sono verificati drag, resize, Shift, rotazione,
Escape, frecce, Delete, Centra, Adatta, Ripristina e Rimuovi.

### Preset MilkDrop

Il menu è un combobox accessibile renderizzato in un portal `fixed`, apre sopra
o sotto in base allo spazio disponibile, resta nel viewport ed espone scroll,
Home, End, PageUp, PageDown, frecce, Enter ed Escape. Sono stati esercitati 5,
37 e 137 elementi.

## Compatibilità preservata

- schema progetto: `6.0`, invariato;
- protocollo host projectM: `2`, invariato;
- formato preset di progetto e IPC: invariati;
- seed e sequenze projectM: invariati;
- nessuna funzione di Fase 4 introdotta.

La baseline raster Canvas è stata rigenerata perché il passaggio corretto a
superfici alpha cambia intenzionalmente i pixel. Tre esecuzioni producono gli
stessi hash e preview/export tornano byte-identici.

## Verifiche

- suite: 250 test, 248 superati, 0 falliti, 2 ignorati;
- scenario Electron: sviluppo, Portable esterna e Setup installato superati;
- controlli: 31/31 con handler, 0 visibili scollegati;
- projectM: probe doppi da 1, 180 e 1.800 frame, 0 mismatch;
- preset reali: 10/10 caricati, audio-reattivi, transizionati ed esportati;
- export 10 preset: 1.800 frame, 60 secondi, 0 frame neri, 0 duplicati,
  0 cambi falliti;
- MP4 smoke delle tre build: SHA-256 identico
  `ACB9BC5FE9053F9B9C7F940BA77C18DC85E4A01BB4D8B9ED7B7DCAF363CD53FA`.

## Evidenze

- `test-results/simple-ui/overlay-dev-final-projectm.png`;
- `test-results/simple-ui/overlay-portable-final-projectm.png`;
- `test-results/simple-ui/overlay-setup-final-projectm.png`;
- `test-results/simple-ui/overlay-*-final-report.json`;
- `test-results/simple-ui/overlay-projectm-{1,180,1800}-frames.json`;
- `test-results/simple-ui/ten-real-presets/ten-real-presets-report.json`;
- `test-results/effect-ui-full-tests-final.log`.

