# Risultati test pannello Layer destro e stage

Data: 31 luglio 2026.

## Build e suite

- TypeScript main/preload/shared/engine: superato.
- Vite renderer di produzione: superato.
- Suite completa: 278 totali, 276 superati, 0 falliti, 2 ignorati.
- Test nuovi/mirati: 54 superati, 0 falliti.
- Controlli UI con handler: 56/56.

I due test ignorati richiedono privilegi Windows per creare symlink e non sono
conteggiati come superati.

## Runtime Electron

| Build | Esito | Durata | Export MP4 | Controlli |
| --- | --- | ---: | --- | ---: |
| sviluppo | superato | 22,334 s | completato | 56/56 |
| Portable esterna | superato | 73,198 s | completato | 56/56 |
| Setup installato | superato | 46,337 s | completato | 56/56 |

Il Setup è stato installato in una directory temporanea esterna al workspace,
testato e disinstallato; directory ed eseguibile installato non sono rimasti.
La Portable è stata copiata e avviata da `%TEMP%`.

## Verifiche

- pannello Layer a destra dello stage: superato;
- margini stage su quattro lati: superato;
- waveform e playbar fuori dal frame: superato;
- resize finestra a 1000×720: superato;
- 9:16, 1:1, 4:3 e 16:9: superati;
- canvas e default export con lo stesso rapporto: superato;
- Immagine, Effetto, Titolo e Artista selezionabili separatamente: superato;
- stato testuale `ATTIVO`: superato;
- blocco selezione on/off: superato;
- drag, resize, rotazione, Centra, Adatta e Ripristina: superati;
- zoom fit/100%/+/− senza variazione delle trasformazioni: superato;
- cover a rapporto coincidente sui quattro formati: superato;
- save/reopen: superato;
- MP4 H.264/AAC: completato nelle tre build.

## Export nei quattro formati

Sono stati eseguiti quattro export reali separati usando lo stesso progetto di
60 secondi, a 30 FPS. Ogni job ha raggiunto il 100% e il file risultante è
stato decodificato integralmente con FFmpeg (exit code 0).

| Formato | Profilo di prova | Durata MP4 | Tempo export | Esito |
| --- | ---: | ---: | ---: | --- |
| 9:16 | 180x320 | 60 s | 11,426 s | superato |
| 1:1 | 240x240 | 60 s | 11,119 s | superato |
| 4:3 | 320x240 | 60 s | 11,350 s | superato |
| 16:9 | 320x180 | 60 s | 11,073 s | superato |

I quattro file contengono video H.264 High, pixel format yuv420p, 30 FPS e
audio AAC-LC 48 kHz stereo. Il test usa risoluzioni ridotte per verificare
rapporto, coordinate, composizione e completamento del job; non costituisce un
benchmark di qualità o prestazioni Full HD.

## Screenshot

Gli artefatti sono in `test-results/right-layer-stage-current/`:

- `stage-ui-stage-9x16.png`;
- `stage-ui-stage-1x1.png`;
- `stage-ui-stage-4x3.png`;
- `stage-ui-stage-16x9.png`;
- `stage-ui-layer-cover.png`;
- `stage-ui-layer-effect.png`;
- `stage-ui-layer-title.png`;
- `stage-ui-layer-artist.png`;
- `stage-ui-window-resized.png`;
- `portable-ui.png`;
- `setup-ui.png`.

Le coppie di confronto dei quattro export si trovano in
`test-results/right-layer-stage-current/format-exports/`:

- `preview-ui-9x16.png` / `export-9x16-verified-frame.png`;
- `preview-ui-1x1.png` / `export-1x1-verified-frame.png`;
- `preview-ui-4x3.png` / `export-4x3-verified-frame.png`;
- `preview-ui-16x9.png` / `export-16x9-verified-frame.png`.

Il report macchina è `format-export-report.json`: 4/4 job superati, tempo
complessivo 63,709 s, percentuale finale 100% per ogni formato.

## Pacchetti

- Setup SHA-256:
  `08B9A659AEAE6935500474A7D76C83964A87E866D45EE9BF59D7A985EFA90901`;
- Portable SHA-256:
  `1D3D7E25B414EC2F91B33872A42E85DE96ECFD6F517DFB5B2B3DDC761879C741`.

## Note

Durante il primo avvio runtime è stato rilevato e corretto il riferimento UI
mancante `#preview-metrics`. Le successive prove reali non hanno registrato
eccezioni renderer. L'audit visuale è stato eseguito sugli screenshot; non
sostituisce una sessione di usabilità con una persona indipendente.

La Fase 4 non è stata iniziata.
