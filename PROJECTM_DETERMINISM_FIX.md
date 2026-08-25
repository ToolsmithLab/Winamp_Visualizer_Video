# Correzione determinismo projectM

Data: 30 luglio 2026

## Patch nativa

La patch `avs-projectm-4.1.6-determinism-v1`:

- aggiunge uno stato deterministico SplitMix64 inizializzato prima del motore;
- reimposta `rand()` e il MT di `projectm-eval`;
- usa seed derivati in modo stabile per noise texture, preset, transizioni,
  shader di transizione e texture manager;
- ordina deterministicamente le texture scansionate;
- avanza clock motore e transizioni di `1 / FPS` in modalità deterministica;
- conserva clock ed entropia upstream per `projectm_create()`;
- aggiunge `projectm_create_with_seed(uint64_t)`.

I 17 file sorgente modificati completi sono in
`native/projectm-4.1.6-determinism/overlay`. Le istruzioni di applicazione e
ricompilazione sono nel relativo `README.md`.

## Protocollo seed

Il protocollo `projectm-host` è stato portato dalla versione 1 alla versione 2.

- comando: `Initialize` e `Reset`;
- payload: 8 byte;
- tipo: `uint64`;
- byte order: little-endian;
- valori validi: `0`–`2^64-1`;
- sorgente per progetti esistenti: il `randomSeed` uint32 già serializzato,
  promosso senza perdita a uint64;
- preview ed export passano lo stesso `project.projectM.randomSeed`;
- resize, pausa e seek riutilizzano lo stesso seed;
- un cambio seed esplicito provoca un reset esplicito;
- host v1 o DLL priva di `projectm_create_with_seed` producono un errore
  comprensibile e non un rendering silenziosamente non deterministico.

Lo stato runtime espone `protocolVersion` e `deterministicSeed` come stringa
decimale, evitando perdita di precisione JavaScript.

## File applicativi principali

- `native/projectm-host/src/main.cpp`;
- `src/main/projectm/projectMProtocol.ts`;
- `src/main/projectm/projectMHostService.ts`;
- `src/main/projectm/projectMExportRenderer.ts`;
- `src/main/ipc.ts`;
- `src/preload/preload.ts`;
- `src/renderer/app.ts`;
- `src/shared/ipc.ts`.

## Binari finali pre-packaging

- `projectM-4.dll`:
  `E7337EC4FE54C00AF622069945A2911837512B7DCFEDB19032200683453524DF`;
- `projectm-host.exe`:
  `B69413DD20D48DA2D8A3EF9C94755CB6F1C4A651D09D9DB3D4AB26C5974CD565`.

Il manifest `native/bin/win-x64/manifest.json` registra versione, patch,
protocollo e hash. La licenza dichiarata resta LGPL-2.1-or-later; linking e
DLL restano dinamici e sostituibili con una build compatibile che esponga
l'API patchata. Questa è verifica tecnica/documentale, non parere legale.

