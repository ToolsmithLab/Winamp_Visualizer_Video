# Risultati test Fase 3 — Milestone M4

Data: 29 luglio 2026  
Sistema: Windows x64, Electron 37.10.3 nel pacchetto finale  
projectM: 4.1.6 reale, host C++ separato

## Suite automatica

Esecuzione completa dopo M4:

- 151 test totali;
- 149 superati;
- 0 falliti;
- 2 ignorati/non eseguibili: creazione symlink filesystem negata da Windows
  senza `SeCreateSymbolicLinkPrivilege`;
- durata TAP: 31,67 s (40,6 s includendo build Vite/TypeScript).

Suite focalizzata M4 finale:

- 32 test;
- 31 superati;
- 0 falliti;
- 1 ignorato per lo stesso privilegio symlink;
- durata: 0,93 s.

Copertura strumentata sul run M4 finale:

- linee complessive caricate: 86,44%;
- branch: 76,51%;
- funzioni: 82,85%;
- `assetResolver`: 96,09% linee, 84,00% branch, 85,00% funzioni;
- `mediaRelinkService`: 85,03% linee;
- `projectPresetService`: 86,16% linee, 85,06% branch;
- `projectPreset`: 89,64% linee, 100% funzioni.

Il branch totale include migrazioni e command store caricati come dipendenze,
non soltanto i moduli M4. Nessuna percentuale è stimata.

## Runtime Electron M4

Scenario sviluppo su WAV reale di 60 s:

- terminologia UI distinta: superata;
- 3 Preset MilkDrop reali: caricati;
- creazione, export, delete, import `.avspreset`: superati;
- anteprima non mutante: superata;
- applicazione come un comando, undo/redo: superati;
- audio/cover rimossi e riapertura parziale: superata;
- relink audio SHA uguale: superato;
- cover SHA differente rifiutata senza conferma: superato;
- conferma mismatch e relink: superato;
- save/reopen e sequenza seed: superati;
- MP4 180×320/30 FPS/60 s: completato in 14,25 s.

## Golden M4 1080×1920

Profilo: 1080×1920, 30 FPS, 60 s, 1.800 frame.

- projectM reale: sì;
- Preset MilkDrop: 3;
- transizioni: 2;
- plugin Canvas: 10, 11 istanze;
- cover, artista, titolo, transform, keyframe, opacità, blend, intervalli,
  layer nascosto/riordinato: presenti;
- H.264/AAC: verificati;
- frame neri projectM/composito: 0/0;
- duplicati anomali: 0;
- cambi falliti: 0;
- confronti preview/export: 18;
- PSNR minimo: 35,6097 dB;
- tempo: 606,93 s;
- CPU media processo: 40,27%;
- GPU picco: 14,2%;
- working set picco: 199.077.888 byte;
- memoria privata picco: 212.393.984 byte;
- handle sistema picco: 445; handle attivi Node picco: 13;
- temporanei residui: 0 byte.

Artefatto: `test-results/phase3-m4/golden/m3-1080x1920-30fps-60s/reference.mp4`  
SHA-256: `5438F04C9DC4105F60B5B372316ECC500F7BB3DF3DB83F807FECA25929CCBE37`

La pipeline visuale non è stata modificata da M4; golden M1/M2 restano
byte-stabili nei test e il golden M3 è stato rieseguito integralmente con gli
stessi requisiti visuali.

## Packaging

Setup e Portable x64 sono stati rigenerati con host projectM, DLL, FFmpeg,
licenze e UI M4. Nessun preset personale o asset del golden è incluso.

Portable:

- avviata da cartella `%TEMP%` Unicode esterna al workspace;
- nessuna dipendenza da Node, Visual Studio o repository;
- scenario M4 completo e MP4 60 s superati;
- 10/10 asserzioni runtime superate sull'hash finale;
- export: 16,29 s;
- cartella temporanea di prova rimossa.

Setup:

- installazione silenziosa in cartella `%TEMP%` Unicode;
- app installata avviata;
- projectM 4.1.6 caricato da `resources/native/win-x64`;
- controlli Preset di progetto e Asset presenti;
- disinstallazione e cleanup superati.

Artefatti finali:

- Setup, 141.216.896 byte, SHA-256
  `9D2F0343DDF65A2AF5774779A4FFABCC2A82C845C7C04DD225B78A01B655368C`;
- Portable, 140.986.839 byte, SHA-256
  `B6D809205E1B2C0955E4D6872E0602BA6379AA2DB99DA4359B9A84B0C4FF4A95`.

Report del flusso Portable finale:
`test-results/phase3-m4/portable-hash-final-flow/runtime-report.json`.
Report smoke degli hash finali:
`test-results/phase3-m4/portable-hash-final-smoke.json` e
`test-results/phase3-m4/setup-hash-final-smoke.json`.

## Non eseguibile e limiti

- test symlink reale: non eseguibile senza privilegio Windows; non conteggiato
  come superato;
- 1080×1920/60 FPS a piena durata non qualificato;
- Setup verificato sulla macchina corrente, non su VM Windows pulita;
- revisione legale resta separata dalla verifica tecnica.
