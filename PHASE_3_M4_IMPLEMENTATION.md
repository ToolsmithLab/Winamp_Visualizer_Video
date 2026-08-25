# Fase 3 — Milestone M4: implementazione

Data verifica: 29 luglio 2026  
Perimetro: T3.12 e T3.13  
Non inclusi: T3.14/M5, Fase 4, scene, autosave, plugin esterni, marketplace,
cloud, collaborazione, aggiornamenti automatici o timeline avanzata.

## T3.12 — Preset di progetto

È stato introdotto il formato dati `.avspreset` 1.0, separato dai Preset
MilkDrop. `projectPresetService` mantiene una libreria personale persistente in
`userData/project-presets`, con file normalizzati e indice locale.

Operazioni reali:

- crea con nome, descrizione, autore dichiarato e scelte asset;
- elenco, ricerca, ordinamento e dettagli;
- anteprima reale attraverso lo stesso compositor, senza mutare store/history;
- conferma/annulla;
- applicazione atomica;
- rinomina, duplica, elimina;
- importa/esporta;
- rilevamento plugin mancante e conferma di applicazione parziale.

Il validatore condiviso applica limiti prima della normalizzazione e il main
ripete i controlli filesystem. L'interfaccia costruisce ogni dato importato con
`textContent`.

## T3.13 — Asset

Lo schema progetto 6.0 mantiene un manifest esteso ma retrocompatibile.
Salvataggio e apertura sincronizzano audio, cover, Preset MilkDrop e texture.
L'apertura non fallisce per un media spostato; mostra riferimenti irrisolti e
consente relink singolo o multiplo.

SHA coincidente viene applicato. SHA differente richiede conferma esplicita.
Il batch è un solo comando e usa clone/rollback. Asset opzionali possono essere
ignorati o rimossi; gli essenziali bloccano l'export prima dell'encoder.

## Sicurezza

- UTF-8 fatal e massimo 2 MiB per `.avspreset`;
- JSON schema/limiti/tipi/date/hash;
- blocco prototype pollution, runtime e binari;
- blocco traversal, assoluti nel preset, UNC/device/URL/NUL;
- file reali verificati tramite magic bytes;
- symlink/reparse point respinti con `lstat` e `realpath`;
- ricerca esplicita limitata a 10.000 file/profondità 32;
- nessuna esecuzione derivata dall'input.

## Compatibilità

Schema progetto invariato a 6.0; progetti precedenti ottengono default per i
nuovi campi manifest. projectM resta un layer nativo separato dai plugin Canvas.
I riferimenti plugin sconosciuti sono conservati, non istanziati.

## File applicativi

Creati:

- `src/shared/projectPreset.ts`;
- `src/engine/project/assetResolver.ts`;
- `src/main/project/projectPresetService.ts`;
- `src/main/project/mediaRelinkService.ts`;
- `src/renderer/projectPresets/projectPresetView.ts`;
- `src/renderer/projectAssets/assetRelinkView.ts`.

Modificati:

- `src/shared/project.ts`, `src/shared/ipc.ts`;
- `src/main/ipc.ts`;
- `src/preload/preload.ts`;
- `src/renderer/app.ts`, `src/renderer/global.d.ts`,
  `src/renderer/styles.css`.

Test/harness creati:

- `tests/phase3-m4.test.cjs`;
- `scripts/phase3-m4-electron-ui-test.cjs`;
- `scripts/phase3-m4-package-smoke.cjs`.

