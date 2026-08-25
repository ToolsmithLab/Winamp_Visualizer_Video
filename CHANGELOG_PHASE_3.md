# Changelog Fase 3

## Pannello Layer destro e stage video — 31 luglio 2026

### Corretto

- spostato il selettore layer dalla fascia sotto l'anteprima a un pannello
  verticale fisso immediatamente a destra dello stage;
- aggiunti stati `ASSENTE`, `NASCOSTO`, `DISPONIBILE` e `ATTIVO`;
- aggiunto il blocco selezione sul layer attivo, abilitato per default;
- aggiunta la scelta iniziale 9:16, 1:1, 4:3 e 16:9, sincronizzata con il
  default dell'export;
- delimitato lo stage con bordo, margini, workspace neutro e guide
  editor-only;
- separate waveform e barra Play/Stop/Esporta in righe esterne allo stage;
- aggiunti zoom fit, 100%, meno e più senza modificare coordinate o output;
- corretta la cover a rapporto coincidente affinché riempia esattamente lo
  stage.

### Test e packaging

- suite: 278 totali, 276 pass, 0 fail, 2 skip;
- audit UI: 56/56 controlli collegati;
- screenshot verificati per quattro formati, quattro layer attivi e finestra
  ridimensionata;
- sviluppo, Portable esterna e Setup installato: scenario completo ed export
  MP4 superati;
- Setup SHA-256:
  `08B9A659AEAE6935500474A7D76C83964A87E866D45EE9BF59D7A985EFA90901`;
- Portable SHA-256:
  `1D3D7E25B414EC2F91B33872A42E85DE96ECFD6F517DFB5B2B3DDC761879C741`.

La Fase 4 non è stata iniziata.

## Correzione banda inferiore export projectM — 31 luglio 2026

### Corretto

- associazione esplicita del framebuffer OpenGL 0 prima di clear e readback;
- viewport e scissor esatti sulla dimensione output;
- inizializzazione completa del target con alpha opaco;
- resolver unico di fit, crop, scala, offset e bounds per preview ed export;
- edge bleed di un pixel sul framebuffer projectM con destinazione full-frame;
- validazione di byte, stride, prima/ultima riga, ultime dieci righe e alpha;
- diagnostica delle dimensioni progetto, export, framebuffer e trasformazioni.

### Test

- 33/33 test dedicati;
- suite completa: 286 totali, 284 superati, 0 falliti, 2 ignorati;
- otto export reali per 9:16, 1:1, 4:3 e 16:9;
- export reale 720×1280/30 FPS con cover, projectM e testi;
- export 720×1280/30 FPS ripetuto dalla build impacchettata;
- nessuna banda inferiore, riga non inizializzata o pixel alpha non valido.

### Packaging

- Setup e Portable ricostruiti con il nuovo host projectM;
- moduli runtime mappati esplicitamente senza richiedere Node/npm globale;
- aggiunta la dipendenza transitiva `fd-slicer` richiesta da `yauzl`;
- avvio impacchettato, projectM ed export reale verificati;
- Setup SHA-256:
  `6CD29086B6DA14710D1A66A39D089A81C34823EC05B224F983E96482691CE23C`;
- Portable SHA-256:
  `13FD8593F8EF04D181584F30D077C2AB0B3207F0927CD16745DC8CED664A3ADD`.

## Gestione preset e selezione layer — 31 luglio 2026

### Corretto

- collegata la UI semplice al catalogo MilkDrop reale per ricerca, filtri,
  conteggio, preferiti e rimozione del singolo preset;
- aggiunta conferma distinta per preset interno ed esterno;
- mantenuto il file originale quando si rimuove un preset collegato;
- selezionato automaticamente il preset successivo dopo una rimozione;
- aggiunto il pannello `Seleziona layer` con Immagine, Effetto, Titolo e
  Artista separati;
- corretta la priorità del layer scelto nel pannello quando elementi testuali
  o visuali sono sovrapposti;
- aggiunte azioni Centra, Adatta e Ripristina sul solo layer attivo.

### Test

- suite completa: 267 totali, 265 pass, 0 fail, 2 skip;
- import runtime: 1 file, 10 file, cartella ricorsiva, ZIP e 100 preset
  collegati;
- preferito e rimozione persistenti dopo riavvio;
- 46/46 controlli UI con handler;
- Titolo e Artista selezionati, trascinati, ridimensionati e ruotati
  separatamente;
- Play, save/reopen ed export MP4 completati.

La Fase 4 non è stata iniziata.

## Correzione blocco esportazione — 31 luglio 2026

### Corretto

- sostituito il progresso fisso a zero con fase, frame, percentuale, tempo,
  frame/s ed ETA reali;
- registrato il job prima delle attese, rendendo annullabili projectM e
  l'avvio FFmpeg;
- aggiunti timeout distinti per motore, preset, IPC, framebuffer, decoder,
  encoder, primo frame e output;
- aggiunti probe e visualizzazione di H.264 OpenH264, AAC, risoluzione, FPS,
  durata e percorsi runtime;
- validato dimensioni, stride e byte del framebuffer projectM;
- reso persistente il log JSONL per fase e rimosso l'output console che poteva
  causare `EPIPE`;
- corretto l'export del preset selezionato direttamente ma non ancora incluso
  nella playlist;
- completato il cleanup di host, FFmpeg, parziali e finestra dopo Annulla.

### Test

- suite: 265 totali, 263 pass, 0 fail, 2 skip;
- otto export comparativi da 10 s e 300 frame: tutti al 100%;
- primo frame: 0,178–0,242 s senza projectM, 0,540–0,638 s con projectM;
- progetto reale completo: 4.663 frame, 155,43 s, 39,83 s di export;
- nove MP4 decodificati integralmente;
- annullamento: output rimosso e 0 processi residui;
- Portable e Setup: UI semplice ed export superati.

### Packaging

- Setup SHA-256:
  `6E8D15775C1523B2B5CE254E37158D88D8A48371EA05C7867BF07A4F220AD491`;
- Portable SHA-256:
  `F223A6480A59F4A40399C8C47BE2E8A426B11124274B0886D8C057AD755640B5`.

## Correzione UI ed effetti — 30 luglio 2026

### Corretto

- fissato l'ordine cover → effetto → titolo → artista;
- introdotte superfici alpha riutilizzabili per tutti gli effetti Canvas;
- convertito il framebuffer BGRA projectM in overlay RGBA luminance-to-alpha;
- applicati trasformazione, opacità, blend e intensità a Canvas e projectM;
- aggiunte selezione, drag, resize Shift, rotazione, Escape, frecce e Delete;
- aggiunti Centra, Adatta, Ripristina e Rimuovi effetto;
- reso raggiungibile il box di trasformazione degli effetti full-bleed;
- inizializzati viewport, scissor, pack state e buffer nell'host projectM;
- sostituito il menu preset nativo con un combobox accessibile non tagliato;
- stabilizzati Play, pausa, ripresa, seek e cambio effetto durante Play.

### Test

- suite completa: 250 totali, 248 pass, 0 fail, 2 skip;
- audit: 31/31 controlli con handler;
- sviluppo, Portable esterna e Setup installato: scenario completo superato;
- 10/10 preset reali caricati, audio-reattivi, transizionati ed esportati;
- probe projectM da 1, 180 e 1.800 frame senza mismatch;
- export da 60 secondi: 1.800 frame, 0 neri, 0 duplicati, 0 errori;
- MP4 smoke delle tre build byte-identici.

### Packaging

- Setup SHA-256:
  `D56A1E99EAED401492988A79F61683F23FF6324C38B4227DC47A5EE380B69347`;
- Portable SHA-256:
  `7E5EF86E34F780C4EAD73B524594C81D7A3EFF86448FA31A83B70F75D7AB4B94`.

## Ridisegno completo UI semplice — 30 luglio 2026

### Modificato

- sostituita la schermata principale con colonna a sei sezioni, anteprima
  centrale e playbar minima;
- rimossi dalla superficie inspector, layer tecnici, timeline avanzata,
  keyframe, manifest, relink, registry e controlli IPC/host;
- ridotta l'immagine a Adatta, Riempi e Dimensione originale;
- introdotto un unico menu effetto con dieci Canvas, projectM e Nessun effetto;
- reso immediato il cambio effetto anche durante Play;
- resi indipendenti e persistenti dimensione, colore e opacità di titolo e
  artista;
- migliorata la manipolazione di layer testuali sovrapposti;
- ridotto l'export a formato, risoluzione, 30 FPS, destinazione ed Esporta.

### Test

- suite completa corrente: 250 totali, 248 pass, 0 fail, 2 skip;
- suite UI/compositing dedicata: 26/26;
- audit corrente: 31/31 controlli con handler, 0 controlli visibili scollegati;
- sviluppo, Portable esterna e Setup: scenario reale superato;
- MP4 delle tre build byte-identici e decodificati integralmente;
- test manuale con persona indipendente senza README ancora da eseguire.

### Packaging

- Setup SHA-256:
  `D56A1E99EAED401492988A79F61683F23FF6324C38B4227DC47A5EE380B69347`;
- Portable SHA-256:
  `7E5EF86E34F780C4EAD73B524594C81D7A3EFF86448FA31A83B70F75D7AB4B94`.

## Gestione cover semplificata — 30 luglio 2026

### Aggiunto

- sezione `Cover` nel flusso principale con caricamento, miniatura, nome file,
  visibilità e azioni rapide;
- adattamenti `Contieni`, `Riempi`, `Stira` e `Originale` non distruttivi;
- selezione automatica e immediata dopo il caricamento;
- selezione con click, drag, resize con Shift, rotazione, Escape e Delete;
- campi rapidi per trasformazione, opacità, blend e ordine layer;
- empty state guidato prima e dopo il caricamento dell'audio;
- comandi cover riutilizzabili e calcolo layout condiviso da preview ed export.

### Test

- 24/24 test automatici dedicati;
- suite completa al momento del workflow Cover: 224 totali, 222 pass,
  0 fail, 2 skip;
- interazioni puntatore reali verificate in sviluppo, Portable e Setup;
- MP4 H.264/AAC con cover, effetto e testi generato e decodificato;
- test umano con utente non esperto ancora da registrare.

## Correzione framing IPC projectM — 30 luglio 2026

### Corretto

- eliminato l'interleaving fra header e payload di richieste concorrenti;
- introdotto un writer FIFO per pacchetti logici con backpressure;
- rafforzato il parser persistente per chunk parziali e multipli;
- aggiunte validazioni di magic, versione, tipo, request ID, dimensioni,
  stride, payload e overflow;
- aggiunta gestione esplicita di EOF troncato e pacchetti tardivi;
- reso ordinato lo shutdown del processo host, con rifiuto delle nuove
  richieste e cleanup deterministico;
- aggiunta diagnostica del framing senza registrare PCM o framebuffer.

### Test

- 33/33 test dedicati al framing IPC;
- 100.000/100.000 render reali, 0 errori, 0 richieste pendenti;
- suite completa precedente: 200 totali, 198 pass, 0 fail, 2 skip;
- playback reale di 600,750 secondi;
- export 1080×1920/30 FPS di 600 secondi e 18.000 frame;
- 0 crash, errori IPC/pipe, frame persi, neri o duplicati;
- memoria, handle e thread senza crescita monotona;
- golden, fixture, seed e protocollo deterministico invariati.

### Packaging

- rigenerati Setup e Portable Windows x64;
- verificati host projectM, DLL, runtime e licenze dentro entrambi i pacchetti;
- verificato avvio fuori workspace da percorso Unicode;
- verificati installazione, avvio, disinstallazione e assenza di processi
  residui.

## Milestone

- M1: architettura, schema, salvataggio e baseline Canvas.
- M2: registro unico e dieci plugin Canvas deterministici.
- M3: trasformazioni, keyframe e timeline.
- M4: Preset di progetto, manifest asset e relink sicuro.
- M5: audit finale, determinismo projectM e gate runtime.

La Fase 4 non è stata iniziata.

## Layer Sfondo video completo — 1 agosto 2026

### Corretto

- sostituito nella UI semplice il concetto rigido Immagine con Sfondo
  dinamico Immagine/Video;
- collegata la clip al layer selezionabile, alle maniglie e a tutte le
  trasformazioni;
- mostrato il primo frame prima del Play tramite decoder Chromium reale;
- aggiunta rilevazione FFmpeg di contenitore, codec, audio, durata, dimensioni
  e FPS;
- rifiutati codec preview incompatibili con errore esplicito;
- rese esclusive immagine e clip;
- allineati Play, pausa, seek, Stop, Loop, ultimo frame e nero intenzionale;
- unificati layout e compositing di preview ed export;
- rimossi scale e crop separati dal decoder clip di export;
- corretto il resolver `HTMLVideoElement`: usa le dimensioni video intrinseche
  invece di trattare la sorgente come 1×1;
- aggiunto timeout di avvio audio per evitare Play sospeso.

### Test

- suite completa: 346 totali, 344 pass, 0 fail, 2 skip symlink;
- suite dedicata Video: 42/42;
- runtime Electron: 18 scenari;
- export reali Video + Canvas e Video + projectM;
- caso 1080×1920/30 FPS da 4:13: 7.590 frame, 0 neri, 0 duplicati,
  H.264 OpenH264 + AAC, 1 audio, completato in 1.091 secondi.
- Portable e Setup: 19 scenari runtime ciascuno, 0 fallimenti e 0 processi
  residui dopo il cleanup.

La Fase 4 non è stata iniziata.
