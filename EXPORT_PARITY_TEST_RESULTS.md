# Risultati test parità export

> Risultato intermedio superato dal nuovo benchmark FFmpeg/OpenH264. I conteggi correnti sono 50 test automatici, 49 superati e 1 non eseguibile; vedere `PHASE_2_TEST_RESULTS.md`.

Data: 28 luglio 2026  
Sistema: Windows 11 x64, 12 processori logici  
GPU projectM: NVIDIA GeForce GTX 1050 Ti, OpenGL 3.3  
projectM: 4.1.6

## Profilo supportato

| Misura | 1080 × 1920, 30 FPS, 60 s |
|---|---:|
| Frame esatti | 1800 |
| Tempo offline | 344,79 s |
| Fattore vs realtime | 5,75× |
| Output MP4 | 93.591.227 byte |
| Codec | H.264 High + AAC-LC |
| Durata container | 60,00 s |
| Termine audio decodificato | 59,98 s |
| Frame neri | 0 |
| Duplicati consecutivi | 0 |
| Cambi / transizioni | 2 / 2 |
| Errori preset | 0 |
| projectM medio | 36,84 ms/frame |
| Compositor medio | 31,67 ms/frame |
| RSS peak processo renderer | 198.418.432 byte |
| Working set peak singolo processo | 820.043.776 byte |
| Memoria privata peak singolo processo | 1.048.616.960 byte |
| Handle peak singolo processo | 406 |
| GPU peak campionato | 2,16% |
| RGBA trasferito | 14.929.920.000 byte |
| Temporanei raw | 0 byte |

Il valore GPU è un campionamento periodico indicativo, non telemetria continua.

## Confronti visivi

Sono stati confrontati i frame pre-encode del compositor con i frame decodificati
dall'MP4 agli stessi timestamp.

| Timestamp | Contesto | PSNR |
|---:|---|---:|
| 0,000 s | iniziale | ≥ 37,28 dB |
| 15,000 s | 25% | ≥ 37,28 dB |
| 20,000 s | prima transizione | ≥ 37,28 dB |
| 30,000 s | 50% | ≥ 37,28 dB |
| 40,000 s | seconda transizione | ≥ 37,28 dB |
| 45,000 s | 75% | ≥ 37,28 dB |
| 59,967 s | finale | ≥ 37,28 dB |

Intervallo complessivo: 37,28–40,77 dB; MAE massimo 1,66/255. Ogni timestamp
include anche un PNG raw projectM per dimostrare che il motore non è
sostituito o nascosto.

## Profilo 60 FPS non qualificato

| Misura | 1080 × 1920, 60 FPS, 10 s |
|---|---:|
| Frame | 600 |
| Tempo offline | 114,74 s |
| Output | 19.011.419 byte |
| Frame neri / duplicati | 0 / 0 |
| PSNR | 37,01–40,65 dB |
| projectM medio | 26,86 ms/frame |
| Compositor medio | 31,28 ms/frame |

La correttezza della pipeline 60 FPS è dimostrata, ma durata e prestazioni non
sono sufficienti per dichiararla stabile su brani interi.

## Altri test

- suite finale: 50 test, 49 superati, 0 falliti, 1 non eseguibile per privilegio symlink;
- cancellazione Electron: superata, output parziale rimosso;
- spazio insufficiente: preflight e messaggio testati;
- Portable finale: projectM 4.1.6, PCM, preview, pausa, seek, cambio preset,
  reload libreria e binari relativi superati;
- Setup e Portable: backend Canvas nativo e runtime x64 inclusi.

Rapporti macchina:

- `test-results/phase2/parity/1080x1920-30fps-60s/report.json`;
- `test-results/phase2/parity/1080x1920-60fps-10s/report.json`;
- `test-results/phase2/parity/cancel-test.json`;
- `test-results/phase2/parity/portable-final.json`.
