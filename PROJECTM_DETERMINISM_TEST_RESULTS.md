# Risultati test determinismo projectM

Data: 30 luglio 2026  
Runtime: projectM 4.1.6 reale, protocollo 2, GPU NVIDIA GeForce GTX 1050 Ti.

## Determinismo già verificato

Due processi `projectm-host.exe` indipendenti hanno prodotto:

| Caso | Frame | Differenze | Hash sequenza A/B |
| --- | ---: | ---: | --- |
| silenzio | 1 | 0 | `4f1d2de1…327c8` |
| sinusoide, resize e reset | 180 | 0 | `00baf1ec…9248c` |
| WAV reale, 10 preset, transizioni e texture | 1.800 | 0 | `e4219dd5…0616` |

Il cambio del solo seed produce un output diverso. Il report sorgente è
`test-results/projectm-determinism-fix/native-probe-final-runtime.json`.

Due export indipendenti 1080×1920, 30 FPS, 60 secondi hanno inoltre prodotto:

- 1.800/1.800 framebuffer projectM identici;
- 1.800/1.800 compositi pre-encoding identici;
- frame video e audio PCM decodificati identici;
- MP4 byte-identici, SHA-256
  `A87FE29332BA358DC6BA939BC56B9D927EEC0E79302FECDAEBF445C657EF35EF`.

## Gate runtime del 30 luglio

Sono stati eseguiti due soak completi sulla build definitiva:

- Portable: 600,396 s di playback e successivo export 18.000 frame;
- payload estratto: 600,974 s di playback e successivo export 18.000 frame.

Entrambi hanno mantenuto seed `1511506142`, dieci preset, dieci plugin Canvas,
34 keyframe, Preset di progetto, relink, pause/ripresa, due seek-reset e cambio
preset. I due export hanno completato 18.000/18.000 frame.

Il secondo run ha registrato i contatori interni:

- 19 cambi preset, 0 falliti;
- 0 frame projectM neri;
- 0 frame compositi neri;
- 0 duplicati;
- picco external export: 41.574.895 B.

## Regressione osservata

Lo stderr del secondo soak contiene un errore reale:

```text
Error occurred in handler for 'projectm:render':
Error: Pacchetto IPC projectM non valido.
```

Lo stack termina in `Pipe.onStreamRead`. L'export si è concluso, ma il gate
richiede zero errori IPC/pipe. Non sono stati modificati projectM, protocollo,
golden o fixture per aggirare l'errore.

Prove:

- `test-results/projectm-determinism-fix/soak-final-direct/soak-report.json`;
- `test-results/projectm-determinism-fix/soak-final-direct/soak-summary.json`;
- `test-results/projectm-determinism-fix/soak-final/runtime-evidence/soak-direct.stderr.log`.

## Regressioni già superate e non ripetute

Nessun file wrapper o harness è stato modificato. È stata rimossa soltanto la
variabile ereditata `ELECTRON_RUN_AS_NODE` dal processo di lancio. Pertanto,
come previsto dal piano:

- suite completa precedente: 167 totali, 165 pass, 0 fail, 2 skip symlink;
- M3/M4 mirati: 52 totali, 51 pass, 0 fail, 1 skip;
- golden M1 invariato:
  `99F630237119E33DC1ED16007D15BFD263D36CB9FE70E2A2F276A02466479ED7`;
- golden M2 invariato:
  `EEE59AADB005065C74A04690A435958A9487EF85C4756B0BA9978B46650F43B2`;
- M3/M4 non hanno file golden da rigenerare; fixture e suite sono rimaste
  invariate.

Il determinismo framebuffer non è regredito, ma il gate runtime complessivo
resta fallito per l'errore IPC osservato.
