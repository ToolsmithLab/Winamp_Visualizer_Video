# Risultati test Fase 3 — Milestone M2

Data: 29 luglio 2026. Perimetro verificato: T3.05–T3.08. Un test non
eseguibile non è conteggiato come superato.

## Suite automatiche

- suite completa `npm test`: 100 test totali, 99 superati, 0 falliti,
  1 ignorato/non eseguibile (symlink Windows senza privilegio);
- suite M2 mirata: 16/16 superati;
- regressione golden M1: 23/23 superati, hash dei sei plugin invariati;
- build TypeScript/Vite: superata.

La suite M2 copre registro, schema parametri, normalizzazione, lifecycle,
errori in ogni metodo, sospensione/riattivazione, ripristino Canvas, 100 cicli,
golden nuovi, input audio diverso, determinismo, 30/60 FPS, due risoluzioni,
seek, due istanze, round trip e 600 secondi simulati.

## Test Electron inspector

L'harness `scripts/phase3-m2-electron-ui-test.cjs` verifica:

- catalogo ordinato di dieci plugin e aggiunta di tutti;
- focus dopo aggiunta;
- number, boolean, color e select;
- modifica tramite comandi;
- duplicazione Orbiting Particles;
- ordine, lock, visibilità, eliminazione, undo e redo;
- salvataggio e riapertura;
- plugin mancante conservato con messaggio controllato;
- projectM 4.1.6 ancora attivo;
- export MP4 non vuoto.

## Prestazioni plugin

Evidenza: `test-results/phase3-m2/plugin-performance-final.json`.

Il benchmark finale forza `canvas.data()`:

- stack preview 10 plugin, 270×480 e sette blend mode: media 14,27 ms,
  p95 16,28 ms, circa 70 FPS di budget raster;
- stack 10 plugin, 1080×1920, source-over: media ~90 ms/frame;
- stack 10 plugin, sette blend mode: media 90,10 ms, p95 91,51 ms;
- Orbiting Particles: media ~17 ms, p95 ~18 ms a 1080×1920;
- Mirrored Waveform con glow: media ~67 ms a 1080×1920;
- dispose di ogni plugin: inferiore a 1 ms nella prova;
- nessuna istanza residua nei 100 cicli.

Il profiling iniziale aveva rilevato ~10,4 s/frame per Orbiting Particles a
causa del blur per particella. Dopo la correzione lo stesso plugin misura
~17 ms/frame. Le allocazioni native per frame non sono esposte da V8; il report
registra delta RSS/heap/external/arrayBuffers e non presenta questo gap come
test superato.

Il soak finale esegue realmente 18.000 frame, equivalenti a 600 secondi a
30 FPS, con i quattro plugin nuovi insieme: media 3,10 ms, p95 3,70 ms,
322,7 FPS offline alla risoluzione diagnostica 120×200 e dispose 0,33 ms.
Heap, external e handle restano stabili; RSS mostra picchi e successivi rientri,
quindi non è monotona. Il primo soak con readback/allocazione bitmap a ogni
frame è conservato come prova diagnostica non superata, non sostituito.

## Regressione Fase 2

- projectM reale: 4.1.6, libreria/host nativi, OpenGL GTX 1050 Ti;
- 10 preset reali: 10 caricati e audio-reattivi, 9 transizioni riuscite,
  export 1.800 frame/60 s, 0 frame compositi neri, 0 duplicati;
- catalogo: archivio SHA-256
  `ce8edc600042184e42e3dc2ce43befea857cf2dfe8b947cb8ff3268f33e56048`,
  37/37 preset validi, 37 licenze marcate verificate, 0 quarantene;
- migrazioni 1.0–6.0, salvataggio atomico, dirty state e undo/redo inclusi
  nella suite completa;
- import/sicurezza `.milk`, ZIP, traversal e file vietati inclusi nella suite.

La verifica licenze è tecnica/documentale e non costituisce parere legale.

## Golden M2 e preview/export

Il progetto si trova sotto
`test-results/phase3-m2/Golden_Ω/m2-1080x1920-30fps-60s/` e contiene:

- projectM reale, tre Preset MilkDrop e due transizioni;
- dieci ID Canvas e 11 istanze, inclusa una seconda Particle Burst;
- nove plugin simultaneamente visibili;
- cover, artista, titolo, sette blend mode;
- Pulse Shapes nascosto, Audio Grid lockato, ordine e intervalli;
- seed fisso, percorso Unicode e WAV PCM di 60 secondi.

Il report finale registra 1.800 frame, H.264 OpenH264/AAC, frame neri,
duplicati, tempi, memoria/handle/GPU e confronti preview/export ai timestamp
iniziale, 10%, 25%, 50%, 75%, 90%, finale, transizioni e confini intervallo.

Risultato misurato:

- 1.800/1.800 frame, durata 60 s, 0 frame neri, 0 duplicati;
- 2 cambi preset, 0 cambi falliti, 0 frame projectM neri;
- compositing medio 99,75 ms, projectM medio 42,44 ms;
- elapsed 673,60 s, CPU processo 37,87%, picco RSS 198,57 MiB,
  picco 456 handle complessivi e GPU 2,31%;
- 15/15 confronti su indice frame esatto sopra PSNR 28;
- PSNR minimo 35,894 e MAE massimo 1,976.

Il primo estrattore usava `-ss` sul timestamp: i due midpoint a mezzo frame
venivano confrontati con il frame adiacente e risultavano sotto soglia. La
soglia non è stata abbassata; `run-preview-export-parity.cjs` ora registra
l'indice catturato e FFmpeg estrae quel frame con `select=eq(n, indice)`.

## Limiti/non eseguibili

- creazione symlink reale: non eseguibile senza Developer Mode o privilegio;
- coverage strumentata: non disponibile nel runner corrente;
- allocazioni native esatte per frame: non esposte;
- 1080×1920/60 FPS a piena durata: non eseguito e non dichiarato stabile;
- installazione/disinstallazione Setup su VM pulita: non eseguita.

## Packaging e Portable esterna

- Setup: 141.194.796 byte, SHA-256
  `1EBE13A0712226E68D42285817D6E4211F2F4013117E848DE03A91320FE0C1D8`;
- Portable: 140.964.798 byte, SHA-256
  `61B908D06C3759A4D3C700B09D077CB70542DE944A2CAA45A33456974F0003A1`;
- Electron 37.10.3 x64;
- host projectM, `projectM-4.dll`, FFmpeg/OpenH264 e testi licenza presenti
  in `resources`;
- Portable avviata da
  `C:\Users\Lorenz\AppData\Local\Temp\AVS_M2_Portable_Ω_20260729_1832`;
- progetto ed MP4 scritti nello stesso percorso Unicode esterno;
- 12/12 asserzioni UI superate, projectM 4.1.6 disponibile, export 45 frame,
  0 neri, 0 duplicati, 1.189.549 byte;
- chiusura pulita: nessun processo Electron/projectM residuo.
