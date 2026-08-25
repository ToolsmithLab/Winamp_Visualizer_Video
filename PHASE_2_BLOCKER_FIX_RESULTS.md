# Risultati correzione bloccanti Fase 2

Data: 29 luglio 2026

## Esito

Entrambi i difetti bloccanti sono corretti e verificati con test automatici, host projectM reale e Portable fuori dal workspace.

## 1. Sequenza diversa dopo riapertura

### Causa tecnica

`PresetLibraryView.select` veniva richiamato durante `applyOpenedProject` attraverso lo stesso flusso di una selezione manuale. Il callback aggiornava `sequenceStartPresetId`, cronologia e stato libreria; i listener ricostruivano inoltre lo scheduler mentre il progetto era solo parzialmente ripristinato.

### Soluzione

- flag esplicito `isRestoringProject`;
- sorgente di selezione `restore`;
- blocco temporaneo di listener, dirty state, sync libreria e scheduler;
- caricamento audio/cover/libreria e preset corrente senza mutare lo snapshot;
- riapplicazione atomica dello snapshot salvato;
- un solo rebuild al termine.

### Risultati

Otto scenari automatici e una riapertura Portable reale coincidono evento per evento per 600 secondi. `sequenceStartPresetId` e preset corrente restano distinti. Il rebuild esplicito successivo produce la stessa sequenza.

## 2. Percorsi Unicode alterati

### Causa tecnica

La stringa veniva trasmessa come byte narrow e poi consegnata a operazioni file/projectM dipendenti dalla code page locale. Un percorso UTF-8 poteva quindi subire una doppia interpretazione (`Ω` → mojibake).

### Soluzione

- `encodeProjectMUtf8` valida surrogate e round-trip;
- header binario con `payload.byteLength`;
- `MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS)`;
- limite 32.767 caratteri, rifiuto NUL/device path;
- `GetFullPathNameW`, `CreateFileW`, `GetFileSizeEx`, `ReadFile`;
- gestione `\\?\` e UNC;
- lettura wide del preset e passaggio dei suoi byte a `projectm_load_preset_data`;
- search path texture separato;
- manifest UTF-8 e long-path.

### Risultati

14 casi Portable passano copia, link, texture, preview, transizione, salvataggio, chiusura, riapertura, relink ed export. Il percorso massimo è 298 caratteri. L’host riporta per ogni caso percorso identico, byte count UTF-8 corretto e code page 65001.

## File applicativi modificati

- `src/renderer/app.ts`;
- `src/renderer/global.d.ts`;
- `src/main/projectm/projectMProtocol.ts`;
- `src/main/projectm/projectMHostService.ts`;
- `src/shared/ipc.ts`;
- `native/projectm-host/src/main.cpp`;
- `native/projectm-host/CMakeLists.txt`;
- `native/projectm-host/projectm-host.manifest`;
- `native/bin/win-x64/projectm-host.exe`;
- `native/bin/win-x64/manifest.json`.

## Test e strumenti aggiunti/modificati

- `tests/blocker-fixes.test.cjs`;
- `scripts/final-portable-demo-audit.cjs`;
- `scripts/prepare-unicode-blocker-assets.cjs`;
- `scripts/repack-prepackaged-app.cjs`;
- `scripts/run-final-package-build.cjs`;
- `scripts/run-unicode-export-diagnostic.cjs`.

## Risultati automatici

- 61 totali;
- 60 superati;
- 0 falliti;
- 1 non eseguibile;
- durata 28,604 s.

Il test non eseguibile è il symlink filesystem Windows senza privilegio. ZIP-symlink e `lstat` sono superati.

## Risultati manuali/E2E

- build TypeScript/Vite: superata;
- projectM reale 4.1.6: disponibile;
- 10 preset reali: 10/10;
- catalogo: 37/37;
- Portable esterna: avvio, chiusura e riapertura superati;
- soak: 600,11 s, 0 crash/errori;
- export soak: 18.000 frame/600 s;
- Unicode Portable: 14/14 copia, 14/14 link, 14/14 relink, export superato;
- 1080×1920/30/60 s: 1.800 frame, 0 neri, 0 duplicati, 0 cambi falliti;
- 1080×1920/60/10 s: corretto ma non qualificato come stabile.

Due invocazioni dell’audit Unicode sono state inizialmente invalide perché PowerShell aveva diviso al primo spazio il nome dell’MP4 passato come argomento. FFmpeg riceveva un percorso senza estensione. Non erano fallimenti dell’app; i log sono conservati e la prova è stata ripetuta con argomento non ambiguo, superandola.

## Limiti residui

- test symlink filesystem non eseguibile senza privilegio;
- 60 FPS non qualificato su durata intera;
- una sola configurazione hardware;
- Setup non installato/disinstallato su VM pulita;
- artefatti non firmati;
- revisione legale definitiva non ottenuta.

Nessun limite residuo riapre i due difetti oggetto della correzione.

## Evidenze

Directory: `test-results/phase2-blocker-fixes/`

File principali:

- `automatic-tests-final.out.log`;
- `ten-real-presets/ten-real-presets-report.json`;
- `verified-preset-catalog.json`;
- `portable-restore-only.json`;
- `portable-demo-soak.json`;
- `unicode-portable-prepare.json`;
- `unicode-portable-reopen-success.json`;
- `parity-openh264/1080x1920-30fps-60s/report.json`;
- `parity-openh264/1080x1920-60fps-10s/report.json`.

## Hash artefatti

- Setup, 141.174.981 byte: `A1D25524479C2788F751C502A1E64A850083B1C8D359C2AF2378DF5E609C5B7B`;
- Portable, 140.944.923 byte: `CEBFCE69F948CA50BEAE6AADD2B6E3C0AF24A9E325732859550C368913CFB9E5`;
- host projectM, 80.384 byte: `1A5E4A48A51235096700EA631D189E9ADA5B30185DEF56455D6FB658A904AF04`.
