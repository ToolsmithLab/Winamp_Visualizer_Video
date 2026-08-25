# Risultati test banda inferiore export

Data: 31 luglio 2026.

## Test automatici

- test dedicati compositing e copertura: 33/33 superati;
- suite completa: 286 totali, 284 superati, 0 falliti, 2 ignorati per
  privilegio symlink Windows;
- controllo buffer: byte esatti `width × height × 4`;
- controllo alpha: zero pixel finali con alpha diverso da 255;
- controllo scanline: prima riga, ultima riga e ultime dieci righe scritte;
- controllo banda: nessuna fascia uniforme imprevista negli ultimi pixel.

## Export reali a 30 FPS

| Caso | Risoluzione | Esito |
| --- | ---: | --- |
| projectM | 180×320, 9:16 | superato |
| cover | 180×320, 9:16 | superato |
| cover + projectM | 180×320, 9:16 | superato |
| projectM | 240×240, 1:1 | superato |
| projectM | 320×240, 4:3 | superato |
| projectM | 320×180, 16:9 | superato |
| projectM ridimensionato | 180×320 | superato |
| cambio preset | 180×320 | superato |

Tutti gli otto MP4 hanno raggiunto il 100%, sono stati decodificati e non
presentano una fascia uniforme negli ultimi dieci scanline.

## Export a risoluzione reale

- formato: 9:16;
- risoluzione: 720×1280;
- frame rate: 30 FPS;
- durata: 10 secondi;
- frame: 300;
- contenuto: cover + projectM + testi;
- tempo export: 23,133 secondi;
- stride: 2880;
- byte per frame: 3686400;
- ultima riga: scritta, alpha valido;
- ultimi dieci scanline: scritti, non uniformi;
- esito: superato.

Il resize della finestra non modifica il formato del progetto. Il salvataggio
e la riapertura conservano formato, preset e trasformazione projectM.

## Build impacchettata

La verifica è stata ripetuta da `release/win-unpacked`, con profilo isolato:

- avvio projectM 4.1.6: superato;
- import e selezione `ORB - Firelight`: superati;
- export 720×1280/30 FPS, 10 secondi, 300 frame: superato;
- tempo export: 24,141 secondi;
- progresso: 100%;
- MP4 decodificabile: sì;
- ultima riga e ultimi dieci scanline: non uniformi, alpha 255;
- save/reopen e resize finestra: superati.

Il controllo di avvio ha rilevato e corretto anche l'assenza iniziale della
dipendenza transitiva `fd-slicer` nel pacchetto. La build definitiva contiene
`yauzl`, `fd-slicer`, `buffer-crc32`, `pend`, Canvas nativo, projectM e FFmpeg.

- Setup SHA-256:
  `6CD29086B6DA14710D1A66A39D089A81C34823EC05B224F983E96482691CE23C`;
- Portable SHA-256:
  `13FD8593F8EF04D181584F30D077C2AB0B3207F0927CD16745DC8CED664A3ADD`.

## Evidenze

- `test-results/projectm-bottom-band-runtime/runtime-report.json`
- `test-results/projectm-bottom-band-runtime/full-suite.tap`
- `test-results/projectm-bottom-band-full/runtime-report.json`
- `test-results/projectm-bottom-band-full/export-frame-2s.png`
- `test-results/projectm-bottom-band-full/export-9x16-720x1280-cover-projectm.mp4`
- `test-results/projectm-bottom-band-package/runtime-report-10s.json`
- `test-results/projectm-bottom-band-package/final-10s/export-9x16-720x1280-cover-projectm.mp4`
