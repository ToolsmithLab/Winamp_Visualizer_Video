# Risultati finali test Fase 3

Data: 30 luglio 2026  
Esito: **non completata**.

## Suite automatica

- totale già verificato sulla build corrente: 167;
- superati: 165;
- falliti: 0;
- saltati/non eseguibili: 2 test symlink Windows;
- durata: 32,51 s oltre alla build;
- copertura percentuale: non raccolta;
- suite M3/M4: 52 totali, 51 pass, 0 fail, 1 skip.

La suite non è stata ripetuta in questo gate perché non sono stati modificati
wrapper, harness, codice applicativo o fixture. La correzione del lancio ha
riguardato solo la rimozione di `ELECTRON_RUN_AS_NODE` dall'ambiente figlio.

## Soak playback

| Misura | Portable | Payload diretto |
| --- | ---: | ---: |
| playback reale | 600,396 s | 600,974 s |
| crash | 0 | 0 |
| frame projectM persi | 0 | 0 |
| latenza media | 15,194 ms | 7,025 ms |
| latenza massima | 18,214 ms | 13,152 ms |
| working set iniziale/finale | 1.185.325.056 / 998.522.880 B | 1.067.126.784 / 1.102.163.968 B |
| private bytes iniziali/finali | 1.124.360.192 / 952.610.816 B | 1.077.207.040 / 1.109.647.360 B |
| heap iniziale/finale | 3.566.856 / 4.659.176 B | 3.911.436 / 4.731.352 B |
| handle iniziali/finali/picco | 2.976 / 2.954 / 2.976 | 3.039 / 2.983 / 3.380 |
| thread iniziali/finali/picco | 159 / 150 / 166 | 171 / 158 / 177 |
| GPU picco | 22,07% | 21,79% |

Working set, private bytes, heap, handle e thread non mostrano crescita
monotona. Il secondo run registra 785,234 s di CPU processo in 600,974 s di
parete, pari al 130,66% di un core logico aggregato.

## Export soak

- durata: 600,000 s;
- 30 FPS, 18.000/18.000 frame;
- H.264 `libopenh264`, AAC LC stereo 48 kHz;
- 19 cambi, 0 falliti;
- 0 frame projectM neri;
- 0 frame compositi neri;
- 0 duplicati applicativi;
- decoder: 0 frame duplicati e 0 frame persi;
- temporanei residui: 0;
- MP4 Portable SHA-256:
  `EB0DEA9AB102A7482263CCBEB2772888FFA75C5268A5A8E6D7BE68580B0F940F`;
- MP4 payload diretto SHA-256:
  `068D083B7FE67900FC126031BCC179340D4289FF1254B6F53D7B26F055795A2A`.

Il run diretto ha impiegato 255.769,583 ms per l'export, con CPU 84,65%,
picco RSS 315.916.288 B, heap 16.090.864 B, external 41.574.895 B e 16
handle attivi.

## Portable

- artifact:
  `Audio Visualizer Studio-Portable-0.2.0-x64.exe`;
- SHA-256:
  `9DAAEC1829297012FAABBF6B64E56F753CAF16C214D340BA1D9281CE0F0D66C3`;
- avvio reale fuori workspace da percorso Unicode con spazi e parentesi;
- projectM 4.1.6, protocollo 2, host/DLL corretti;
- profilo isolato senza dipendenze di sviluppo;
- 14 preset Unicode/percorsi lunghi importati e ricollegati;
- save/reopen e stato completo corrispondenti;
- seed `3237998146` preservato;
- export 60 s: 1.800 frame, 0 neri, 0 duplicati;
- chiusura: 0 processi residui.

## Setup

- artifact SHA-256:
  `E499AEC4B6934A1358973EA9A840E6BD67043F79ABACF49DD1C2E80E9D3C56E0`;
- installazione reale in
  `C:\Users\Lorenz\AppData\Local\Temp\AVS Setup Finale (Ω 20260730)`;
- host, DLL, MSVC runtime, GLEW, FFmpeg/OpenH264 e licenze presenti;
- 10/10 asserzioni runtime M4 superate;
- Preset di progetto, save/reopen, seed, relink e preview verificati;
- export 60 s: 1.800 frame, 0 dup/drop del decoder;
- disinstallazione codice 0 e cartella rimossa;
- VM pulita non disponibile: prova eseguita sulla macchina corrente.

## Fallimento bloccante

Nel secondo soak è comparso un errore `projectm:render`:
`Pacchetto IPC projectM non valido`, con stack nella pipe nativa. Il requisito
richiede zero errori IPC/pipe; il test è quindi fallito anche se l'export è
terminato.
