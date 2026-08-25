# Test controllo preset e transizioni

> Risultato intermedio conservato come evidenza storica. L’audit finale ha rilevato una sequenza diversa dopo riapertura nonostante il seed invariato; vedere `PHASE_2_TEST_RESULTS.md`.

## Architettura verificata

Lo scheduler `buildPresetSequence` è condiviso da preview ed export. Riceve
playlist, preset iniziale, seed, ordine, intervalli e marcatori e produce eventi
assoluti sulla timeline.

Le transizioni non simulano due immagini Canvas: l'host chiama
`projectm_load_preset_file(..., true)` e configura
`projectm_set_soft_cut_duration`. projectM renderizza entrambi i preset e
restituisce il framebuffer già dissolto.

## Matrice

| Test | Risultato |
|---|---|
| precedente/successivo/diretto/casuale/restart | Superato |
| lock/sblocco e preferito | Superato |
| 100 cambi manuali | Superato, stesso PID |
| 100 cambi automatici | Superato |
| ordine sequenziale/casuale | Superato |
| nessuna ripetizione immediata | Superato |
| marcatori timeline | Superato |
| eventi musicali persistiti | Superato |
| transizione attiva/disattivata | Superato |
| durata regolabile | Superato |
| pausa durante transizione | Superato |
| seek durante transizione | Superato |
| preset non caricabile | Fallback superato |
| texture mancante | Nessun crash |
| salvataggio e riapertura | Round trip schema 5.0 superato |
| stesso seed | Sequenza identica per 600 secondi |
| soak 10 minuti | 18.000 frame, 0 crash |
| transizioni nell'MP4 | Superato, H.264 + AAC |

## Prestazioni

Soak ridotto:

- render medio: 2,18 ms;
- cambio medio: 74,27 ms;
- handle: 288 → 286;
- frame neri: 0;
- errori/crash: 0.

Export 180 × 320:

- 300 frame in 1,48 s;
- render medio: 2,94 ms;
- cambio medio: 78,27 ms;
- quattro cambi e soft-cut da 0,75 s;
- 0 frame neri;
- audio AAC e video H.264 decodificabili.

Preview Electron:

- 58,5 FPS osservati;
- 0 frame projectM persi;
- pausa e seek completati senza chiusura dell'host.

## Evidenze

- `tests/preset-transition.test.cjs`;
- `test-results/phase2/preset-transition-soak-10m.json`;
- `test-results/phase2/preset-transition-export.json`;
- `test-results/phase2/preset-transition-export.mp4`;
- `test-results/phase2/preset-transition-electron.json`;
- `test-results/phase2/preset-transition-electron.png`;
- `test-results/phase2/preset-transition-portable.json`;
- `test-results/phase2/preset-transition-portable.png`.

## Interpretazione

Un frame è classificato nero se meno dello 0,05% dei pixel supera il livello
8. Nessuno dei 300 frame ha raggiunto questa condizione.
