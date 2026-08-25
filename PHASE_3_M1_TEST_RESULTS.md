# Fase 3 — risultati test Milestone M1

Data: 29 luglio 2026.  
Sistema: Windows x64, Electron 37.10.3, GPU NVIDIA GeForce GTX 1050 Ti.

## Risultato sintetico

| Gruppo | Superati | Falliti | Saltati/non eseguibili |
|---|---:|---:|---:|
| Suite TAP completa | 83 | 0 | 1 |
| Scenari runtime/accettazione aggiuntivi | 7 | 0 | 0 |

Il test saltato è la creazione di un symlink reale, negata da Windows senza
Developer Mode/privilegio. I controlli ZIP-symlink e `lstat` sono superati.
La copertura strumentata non è disponibile nel runner corrente e non viene
stimata: è riportata come non eseguibile, non come superata.

## Baseline e motore

- golden ricalcolati tre volte: identici;
- sei plugin con PCM sintetico e WAV reale: identici alla baseline;
- preview/offline: stesso hash;
- seek avanti/indietro: deterministico;
- due istanze stateful: indipendenti;
- controllo statico engine/shared: nessun import renderer, DOM, Electron o Node;
- build renderer e main: superata.

## Schema, save e history

- fixture 1.0–5.0 migrate a 6.0: superato;
- idempotenza/purezza: superato;
- campi mancanti, tipo errato, JSON corrotto, `NaN`, `Infinity`: rifiutati;
- plugin sconosciuto: dati conservati, nessuna esecuzione;
- versione futura: rifiutata e file invariato;
- frame 5.0 prima/dopo: identico;
- fault injection atomic save: 5/5 superate;
- slider 100 eventi e drag 300 eventi: un comando ciascuno;
- 200 undo e 200 redo, invalidazione redo e limiti memoria: superati;
- dirty revision/save/reset e assenza dati runtime: superati.

## Regressione Fase 2

Runtime Electron sviluppo:

- projectM reale 4.1.6;
- host e DLL locali;
- OpenGL 3.3 su GTX 1050 Ti;
- WAV reale, PCM, framebuffer, play/pausa/ripresa/seek;
- disattivazione/riattivazione e shutdown ordinato;
- nessun processo residuo.

Preset reali:

- 10/10 caricati;
- PCM accettato da tutti;
- 0 errori;
- export 60 s, 1.800 frame, 10 preset, 9 cambi;
- 0 cambi falliti, 0 frame neri, 0 duplicati;
- H.264 e AAC presenti.

Catalogo:

- archivio SHA-256
  `ce8edc600042184e42e3dc2ce43befea857cf2dfe8b947cb8ff3268f33e56048`;
- 37/37 preset validi;
- 37/37 marcati con licenza verificata nel catalogo;
- 0 quarantena;
- verifica tecnica, non parere legale sulla titolarità storica.

Import `.milk`, multiplo/cartella/ZIP, traversal, file vietati, duplicati,
Unicode, link/relink, quarantena, 100 cambi manuali, 100 automatici,
transizioni e determinismo dopo riapertura sono inclusi nella suite TAP verde.

## Parità 1080×1920

Profilo: 1080×1920, 30 FPS, 60 secondi.

- frame: 1.800 esatti;
- frame neri: 0;
- duplicati anomali: 0;
- cambi preset: 2;
- H.264: sì;
- AAC: sì;
- PSNR dei sette confronti: 37,46–40,70 dB;
- tempo: 304.990 ms, circa 5,90 frame renderizzati/s;
- working set massimo: 209.809.408 byte;
- memoria privata massima: 231.706.624 byte;
- handle massimi: 446;
- GPU massima campionata: 2,08%;
- spazio temporaneo residuo: 0.

Il profilo è supportato come export offline, non real-time. 1080×1920 a 60 FPS
non è stato riqualificato e non viene dichiarato stabile.

## Packaging e Portable

Setup:

- dimensione 141.182.746 byte;
- SHA-256
  `73D0F8DE5BA4B4F5B13AAC317EFD6C8FBA7FDC9C2C9065FAA9CA36E253B1FE08`.

Portable:

- dimensione 140.952.691 byte;
- SHA-256
  `95FE22474A0DC3A70DC856AD1B0D5CDC9BD9D14271407DD0D5386169D0DBA50C`.

La Portable è stata copiata e avviata da una cartella temporanea Unicode
esterna al workspace. Il report mostra host e DLL dalla directory estratta
dalla Portable e WAV Unicode esterno. projectM 4.1.6 e GPU reale sono
disponibili. Setup è stato costruito e ispezionato; installazione/disinstallazione
su VM pulita non è stata eseguita.

## Test UI/manuale assistito

Il harness Electron ha superato 11/11 asserzioni: apertura della copia runtime
5.0, migrazione e salvataggio 6.0, modifica proprietà, undo da pulsante, redo
con `Ctrl+Y`, undo con `Ctrl+Z`, redo con `Ctrl+Shift+Z`, save che conserva
history, dirty revision, chiusura/riapertura ed export MP4.

## Evidenze

Le evidenze sono in `test-results/phase3-m1/`, inclusi report JSON, screenshot,
log packaging, MP4 di parità, audit 10 preset e catalogo verificato.

## Limiti residui

- symlink reale non eseguibile per privilegio Windows;
- coverage strumentata non configurata;
- 60 FPS a piena durata non qualificato;
- Setup non installato/disinstallato su VM pulita;
- hardware diverso richiede una nuova qualifica.

