# Risultati test importazione Preset MilkDrop

> Risultato intermedio conservato come evidenza storica. Il nuovo audit completo è in `PHASE_2_TEST_RESULTS.md` e segnala anche il difetto dei percorsi Unicode esterni.

Data: 28 luglio 2026  
Piattaforma: Windows x64  
projectM: 4.1.6 reale, host C++ isolato

## Risultato automatico

Comando:

```powershell
npm test
```

Esito: **37 test totali, 36 superati, 0 falliti, 1 saltato**.

Il test saltato tenta di creare un symlink filesystem e l'account Windows non
dispone del privilegio richiesto. Il test ZIP-symlink è superato e la
validazione di produzione rifiuta esplicitamente ogni percorso per cui
`lstat().isSymbolicLink()` è vero.

## Matrice verificata

| Scenario | Esito |
|---|---|
| `.milk` valido | Superato, validazione e framebuffer projectM reali |
| `.milk` corrotto | Superato, errore isolato e record non valido |
| selezione multipla | Superato |
| cartella ricorsiva | Superato |
| ZIP con preset e texture | Superato |
| ZIP danneggiato | Superato, staging ripulito |
| ZIP con traversal | Superato, nessuna scrittura esterna |
| ZIP con eseguibile | Superato, import rifiutato |
| ZIP con symlink Unix | Superato, import rifiutato |
| duplicati SHA-256 | Superato |
| texture mancante | Superato, avviso persistente |
| nomi Unicode | Superato |
| percorsi lunghi | Superato |
| metadati e licenza | Superato, licenza non verificata di default |
| preferiti/catalogo dopo reload | Superato |
| ricollegamento | Superato, richiesto hash identico |
| quarantena e nuova validazione | Superato |

## Verifica Electron in sviluppo

È stato importato `tests/fixtures/preset-import/valid.milk` in un profilo
isolato e selezionato dalla Libreria preset.

- projectM disponibile e in esecuzione: sì;
- versione: 4.1.6;
- preset corrente: `valid.milk`;
- renderer OpenGL: NVIDIA GeForce GTX 1050 Ti, OpenGL 3.3;
- framebuffer visuale reale: visibile;
- preferito dopo reload: conservato;
- errori o crash: nessuno.

Evidenze:

- `test-results/phase2/preset-library-runtime-final4.json`;
- `test-results/phase2/preset-library-runtime-final4.png`.

## Verifica Portable

La Portable rigenerata è stata avviata con un secondo profilo isolato. Il
runtime è stato risolto esclusivamente dalla directory temporanea estratta dal
launcher:

- host: `resources/native/win-x64/projectm-host.exe`;
- libreria: `resources/native/win-x64/projectM-4.dll`;
- projectM 4.1.6 disponibile;
- preset importato caricato e visualizzato;
- preferito conservato dopo reload;
- dipendenza ZIP `yauzl` presente in `resources/app.asar`;
- errori e crash: nessuno.

Evidenze:

- `test-results/phase2/preset-library-portable-final.json`;
- `test-results/phase2/preset-library-portable-final.png`.

Il primo tentativo del runner è stato rifiutato perché l'ambiente di
automazione ereditava `ELECTRON_RUN_AS_NODE`. La variabile è stata rimossa dal
processo di test e non è richiesta né impostata dall'applicazione distribuita.

## Fixture

- `valid.milk`: preset minimo valido con metadati espliciti;
- `corrupt.milk`: intestazione/contenuto non valido;
- `missing-texture.milk`: riferimento a texture assente;
- `unicode/Visualità Ω.milk`: nome Unicode;
- ZIP di test costruiti dinamicamente con `yazl` per validità, corruzione,
  traversal, file vietati e symlink.

## Limiti dichiarati

Questa verifica riguarda importazione e Libreria preset. Non dimostra ancora
10 preset redistribuibili, cambio casuale/automatico, transizioni né parità
projectM nell'export MP4.
