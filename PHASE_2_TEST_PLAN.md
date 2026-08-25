# Piano di test finale Fase 2

Data di esecuzione: 28 luglio 2026  
Oggetto: versione 0.2.0 corrente, riesaminata senza riutilizzare esiti dei precedenti audit.

## Regole

- Nessun mock può soddisfare un requisito projectM.
- Un test non eseguibile è distinto da un test superato.
- I benchmark video devono usare la build FFmpeg/OpenH264 distribuita.
- La Portable deve essere copiata e avviata fuori dal workspace.
- La parità richiede lo stesso modello di scena, gli stessi seed, preset, transizioni, layer, opacità, blend e intervalli.
- Le verifiche di licenza sono tecniche e documentali, non un parere legale.

## Ambiente

- Windows 11 Pro build 26200.
- AMD Ryzen 5 2600, 6 core/12 thread.
- NVIDIA GeForce GTX 1050 Ti 4 GB, driver 32.0.15.8253.
- 16.699.568 KiB RAM visibile.
- Electron 37.10.3; Node incorporato in Electron.
- projectM 4.1.6, host C++ x64 separato.
- FFmpeg `n7.1.5-10-g2aefd64d48-20260727`, `lgpl-shared-7.1`, OpenH264/AAC.

## Sequenza di test

### 1. Build pulita e test automatici

1. eliminare soltanto gli output di build dell’app;
2. eseguire `npm run build`;
3. eseguire tutti i file `tests/*.test.cjs` con copertura;
4. registrare totali, pass, fail, skip, durata e copertura;
5. verificare esplicitamente lifecycle projectM, libreria mancante, 20 cicli, PCM, framebuffer, backpressure, import, ZIP, catalogo, libreria, persistenza e sequencer.

Criterio: build senza errori; nessun fallimento. Gli skip restano non superati.

### 2. projectM reale e 10 preset

Per ciascuno dei dieci preset ufficiali di test del tag projectM v4.1.6:

1. verificare SHA-256 e provenienza;
2. inizializzare l’host reale;
3. caricare il `.milk`;
4. inviare PCM stereo;
5. verificare che il framebuffer avanzi e non sia nero;
6. misurare FPS;
7. cambiare preset con transizione;
8. includerlo nell’export.

Criterio: 10/10 caricati e audio-reattivi, nessun mock, nessun errore, nessun frame nero.

### 3. Import e sicurezza

Eseguire:

- singolo `.milk`;
- selezione multipla;
- cartella e sottocartella;
- ZIP con preset;
- casi validi/corrotti, duplicati, texture presenti/mancanti, Unicode e percorsi lunghi;
- traversal, percorso assoluto, device path, symlink, estensioni vietate, file mascherati, limiti numero/dimensione;
- rollback, quarantena, ricollegamento e persistenza.

Criterio: nessun contenuto eseguito; casi pericolosi rifiutati; errori isolati; licenza ignota non causa quarantena.

### 4. Demo Portable end-to-end

1. copiare la Portable in una cartella temporanea esterna;
2. avviare con profilo isolato;
3. caricare il WAV PCM stereo 48 kHz da 600 s;
4. importare singolo, multiplo, cartella ricorsiva e ZIP;
5. caricare 10 preset;
6. eseguire precedente, successivo, diretto, casuale, riavvio e lock/unlock;
7. abilitare automatico e transizioni;
8. aggiungere cover, artista, titolo e almeno tre overlay;
9. salvare, chiudere, riavviare e riaprire;
10. confrontare seed e sequenza attesa;
11. riprodurre 600 s;
12. esportare l’intera durata;
13. decodificare l’MP4 e controllare durata/frame/audio;
14. analizzare metriche, handle, log e crash.

Criterio: tutti i passi senza errore, stessa sequenza dopo riapertura, 600 s/18.000 frame, nessuna dipendenza dal workspace.

### 5. Parità preview/export

Progetto di riferimento:

- projectM reale;
- tre preset e due transizioni;
- cover, artista e titolo;
- tre overlay Canvas;
- opacità e blend diversi;
- intervalli, layer nascosto e layer riordinato;
- seed serializzati.

Profili:

1. 1080×1920, 30 FPS, 60 s;
2. 1080×1920, 60 FPS, 10 s, solo verifica di correttezza.

Confrontare frame a inizio, 25%, cambi/transizioni, 50%, 75% e fine; calcolare MAE, RMSE e PSNR; controllare frame neri e duplicati. Criterio: 0 frame neri, 0 duplicati anomali, H.264/AAC, conteggio esatto e PSNR almeno 35 dB.

### 6. Packaging

1. generare Setup NSIS e Portable x64;
2. verificare `projectm-host.exe`, `projectM-4.dll`, GLEW, runtime MSVC, FFmpeg e DLL condivise, catalogo e testi licenza;
3. verificare l’assenza di `ffmpeg-static` e `libx264`;
4. calcolare SHA-256;
5. ripetere uno smoke test dalla Portable esterna.

Criterio: nessun prerequisito manuale, percorso relativo, avvio esterno riuscito.

### 7. Licenze

Per projectM, catalogo, FFmpeg e OpenH264 registrare separatamente:

- licenza dichiarata;
- provenienza;
- hash;
- testi inclusi;
- verifica tecnica;
- revisione legale ancora necessaria.

Non usare “legalmente approvato” come esito.

## Evidenze attese

Tutti i nuovi output devono essere sotto `test-results/phase2-final-20260728/`, con log persistenti e report JSON. Un requisito fallito mantiene la Fase 2 aperta anche quando gli altri test passano.
