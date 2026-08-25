# Test runtime projectM

> Risultato intermedio conservato come evidenza storica. Il nuovo audit completo del 28 luglio 2026 è in `PHASE_2_TEST_RESULTS.md` e ne sostituisce conteggi e conclusioni.

Verifica eseguita il 28 luglio 2026 su Windows x64, 12 processori logici,
NVIDIA GeForce GTX 1050 Ti, driver 582.53 e OpenGL 3.3.0.

## Risultato sintetico

| Test | Esito | Evidenza |
|---|---|---|
| Build applicazione pulita | superato | `npm run build`, exit 0 |
| Suite automatica | superato | 19/19 test |
| projectM reale disponibile | superato | versione runtime 4.1.6 |
| Libreria mancante | superato | errore gestito, app non chiusa |
| Preset `.milk` reale | superato | `AVS Audio Wave.milk` caricato |
| PCM→projectM→BGRA | superato | frame non nero/non vuoto |
| Init/close ripetuti | superato | 20/20 cicli, 0 crash |
| Play/pausa/ripresa | superato | tempo audio e frame coerenti |
| Seek | superato | reset motore e nuovo frame |
| Nuovo audio | superato | PCM e posizione azzerati |
| Enable/disable | superato | host chiuso e riavviato con nuovo PID |
| Sviluppo Electron | superato | visual reale sotto gli overlay |
| Portable fuori workspace | superato | DLL e preset risolti da `resources` |
| Setup e Portable | superato | entrambi gli artefatti generati |
| Export MP4 con projectM | non eseguito | non incluso in questa attività |
| 1080 × 1920 a 60 FPS | non eseguito | nessuna dichiarazione di stabilità |

## Suite automatica

Comando:

```powershell
npm test
```

Esito finale: 19 test superati, 0 falliti. La suite avvia
`projectm-host.exe`, controlla versione 4.1.6, invia un'onda PCM reale, riceve
un framebuffer BGRA e verifica pixel non nulli. Copre inoltre protocollo,
missing DLL, backpressure, play/pause/resume/seek, persistenza del livello e 20
cicli reset/chiusura.

## Electron sviluppo e Portable

Le prove E2E hanno caricato via Web Audio una WAV sintetica e comandato la UI
reale. In entrambi gli ambienti sono stati verificati:

- stato Disponibile, versione 4.1.6 e preset corrente;
- play, pausa stabile, ripresa, seek e nuovo caricamento;
- disattivazione con host non in esecuzione;
- riattivazione con PID nuovo;
- framebuffer projectM sotto copertina/testi/overlay.

In sviluppo il primo frame 540 × 960 ha registrato 8,52 ms nativi, 15,15 ms di
latenza, 1.094,73 Mbit/s e 0 drop. Nella Portable finale: 8,33 ms nativi,
18,37 ms, 902,88 Mbit/s e 0 drop; dopo un secondo di riproduzione il frame ha
registrato 2,59 ms nativi e 6,35 ms end-to-end. FPS UI osservati: 44,5 nella
prima finestra di avvio e 58,6 a regime.

Evidenze:

- `test-results/phase2/projectm-electron-preview.png`;
- `test-results/phase2/projectm-portable-final-preview.png`;
- `test-results/phase2/projectm-portable-final-runtime.json`.

## Throughput IPC e risorse

Test sequenziale di 20 secondi a 540 × 960, payload 2.073.600 byte:

- 2.950 frame, 147,5 frame/s effettivi;
- latenza media 6,77 ms, massimo 30,73 ms;
- render nativo medio 3,47 ms;
- banda media misurata 2.585,16 Mbit/s;
- banda minima 539,89 Mbit/s;
- frame scartati: 0 nel test sequenziale.

Il valore supera il fabbisogno teorico 540 × 960 a 60 FPS, ma non dimostra
1080 × 1920 a 60 FPS nel renderer Electron. La policy runtime resta: un solo
frame in volo, nessuna coda e scarto dell'obsoleto.

Durante il carico, con un solo host:

- picco CPU host: 124% di un core logico;
- working set: 117,54 MiB;
- memoria privata: 161,24 MiB;
- handle: 289;
- crash: 0.

Moduli verificati: `projectm-host.exe`, `projectM-4.dll`, `glew32.dll`,
`MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll` e `OPENGL32.dll`.

Evidenze:

- `test-results/phase2/projectm-frame-load-clean.json`;
- `test-results/phase2/projectm-host-load-metrics-clean.json`;
- `test-results/phase2/projectm-loaded-modules.json`.

## Percorsi verificati

Sviluppo:

- `native/bin/win-x64/projectm-host.exe`;
- `native/bin/win-x64/projectM-4.dll`;
- `assets/projectm/presets/AVS Audio Wave.milk`.

Portable:

- `%TEMP%/.../resources/native/win-x64`;
- `%TEMP%/.../resources/assets/projectm/presets`.

La Portable non ha usato Node.js, Visual Studio, repository sorgente o
variabili d'ambiente manuali.

## Errori trovati e risolti

Le prime prove hanno rilevato un access violation prima di `projectm_create`
(GLEW non inizializzato) e `GL_INVALID_OPERATION` nella lettura frame
(framebuffer interno ancora selezionato). Entrambi sono stati corretti e non
sono presenti nei risultati finali. Il primo packaging ha inoltre richiesto il
completamento del download toolchain; le build finali Setup/Portable sono
riuscite.

Un primo avvio della GUI dal terminale isolato ha prodotto il breakpoint
`0x80000003`: il log mostrava il processo GPU Electron privo degli accessi
necessari (`0xC0000135`) e nove restart GPU. Ripetendo lo stesso artefatto fuori
dal sandbox, come normale applicazione desktop, la Portable ha superato
l'intera prova E2E. Non era un crash dell'host projectM.

## Test falliti finali

Nessuno tra i test in scope. Export projectM e profilo 1080 × 1920 a 60 FPS
sono esplicitamente non eseguiti, non fallimenti mascherati.
