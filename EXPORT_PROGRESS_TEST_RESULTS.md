# Risultati test progresso esportazione

Data: 31 luglio 2026  
Sistema: Windows x64  
projectM: 4.1.6, host separato  
Codec: H.264 OpenH264 + AAC  
Profilo breve: 180×320, 30 FPS, 10 secondi, 300 frame

## Asset reali

Il WAV da 10 secondi deriva dal brano reale dell'utente:

`INDUSTRIAL STRENGTH (MANUFACTURING ELECTRIC) - Extreme Hybrid Wrestling.mp3`

La cover quadrata 640×640 è stata estratta dall'immagine incorporata nel
medesimo MP3. Il test completo usa direttamente il file MP3 originale da
155,43 secondi. I preset `parity-one.milk` e `parity-two.milk` sono stati
importati nella libreria isolata, validati e caricati dall'host projectM reale.

## Confronti obbligatori

| Scenario | Primo frame | Avvio FFmpeg | Velocità | Esito |
| --- | ---: | ---: | ---: | --- |
| immagine + audio | 0,242 s | 0,044 s | 249,16 fps | 300/300, 100% |
| immagine + titolo + artista | 0,179 s | 0,026 s | 283,49 fps | 300/300, 100% |
| immagine + Canvas | 0,178 s | 0,028 s | 247,51 fps | 300/300, 100% |
| immagine + projectM | 0,595 s | 0,432 s | 109,09 fps | 300/300, 100% |
| projectM trasparente | 0,634 s | 0,459 s | 109,08 fps | 300/300, 100% |
| projectM senza immagine | 0,569 s | 0,405 s | 130,02 fps | 300/300, 100% |
| secondo preset MilkDrop | 0,540 s | 0,390 s | 109,06 fps | 300/300, 100% |
| effetto disattivato | 0,181 s | 0,025 s | 281,21 fps | 300/300, 100% |

Tutti i file contengono uno stream video H.264 e uno stream audio AAC e sono
stati decodificati integralmente con FFmpeg senza errori.

## Progetto reale completo

- sorgente: MP3 reale dell'utente;
- cover: artwork incorporato;
- titolo e artista: presenti;
- effetto: projectM con `parity-two`;
- opacità projectM: 0,55;
- durata: 155,43 s;
- frame: 4.663/4.663;
- tempo primo frame: 0,638 s;
- tempo avvio FFmpeg: 0,483 s;
- tempo export: 39,83 s;
- velocità media: 118,91 frame/s;
- progresso finale: 100%;
- output: 12.134.523 byte;
- decodifica completa: superata.

Il profilo 180×320 dimostra il flusso reale completo ma non qualifica le
prestazioni di un export 1080×1920.

## Prima e dopo

- prima: il tempo al primo frame non veniva registrato; la UI inviava sempre
  0% e poteva restare così per l'intero benchmark da 376,89 s;
- dopo, senza projectM: 0,178–0,242 s;
- dopo, con projectM: 0,540–0,638 s;
- il progresso contiene un evento per frame e supera zero al primo frame.

## Annullamento

- annullamento accettato: sì;
- invocato dopo il primo frame projectM: 0,552 s;
- decoder terminato: sì;
- encoder terminato: sì;
- host projectM terminato: sì;
- output parziale rimosso: sì;
- processi residui del progetto: 0.

## Suite automatica

- totali: 265;
- superati: 263;
- falliti: 0;
- ignorati: 2 test symlink senza privilegio Windows;
- suite dedicata blocco export: 10/10.

## Portable

- UI semplice end-to-end: superata;
- projectM e Canvas: superati;
- salvataggio/riapertura: superato;
- export H.264/AAC: superato e decodificato;
- 36/36 controlli registrati con handler;
- SHA-256:
  `F223A6480A59F4A40399C8C47BE2E8A426B11124274B0886D8C057AD755640B5`.

## Setup

- installazione silenziosa isolata: codice 0;
- avvio app installata: superato;
- UI semplice end-to-end: superata;
- export H.264/AAC: superato e decodificato;
- processi residui: 0;
- SHA-256:
  `6E8D15775C1523B2B5CE254E37158D88D8A48371EA05C7867BF07A4F220AD491`.

## Evidenze

- report runtime:
  `test-results/export-stall-runtime/runtime-report.json`;
- report Portable:
  `test-results/export-stall-runtime/portable-final-report.json`;
- report Setup:
  `test-results/export-stall-runtime/setup-final-report.json`;
- log temporali:
  `test-results/export-stall-runtime/profile3/logs/exports/`;
- nove MP4 comparativi:
  `test-results/export-stall-runtime/`.

## Problemi residui

I due test symlink ignorati non riguardano l'export. Il test umano di
usabilità resta separato. Questo audit non qualifica prestazioni 1080×1920/60
FPS né hardware diverso dalla macchina corrente.
