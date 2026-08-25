# Build Windows x64

Aggiornato il 28 luglio 2026.

## Requisiti per compilare

- Windows x64;
- Node.js e npm soltanto sulla macchina di build;
- dipendenze npm installate;
- runtime nativi già preparati in `native/bin/win-x64` e `native/ffmpeg/win-x64`.

L’utente finale non deve installare Visual Studio, Node.js, projectM, FFmpeg o impostare variabili d’ambiente.

## Comandi

```powershell
npm run build
npm test
npm run dist
```

`npm run dist` genera:

- Setup NSIS x64;
- Portable x64.

La build finale usa Electron 37.10.3 ed electron-builder 26.15.3, versioni risolte dal lockfile corrente.

## Risorse incluse

`package.json` copia in `resources`:

- `native/bin/win-x64` → `native/win-x64`;
- `native/ffmpeg/win-x64` → `native/ffmpeg/win-x64`;
- `assets/preset-catalog`;
- `assets/projectm`;
- `licenses`;
- `THIRD_PARTY_LICENSES.md`;
- `PRESET_LICENSES.md`.

`@napi-rs/canvas` e il binding `win32-x64-msvc` sono estratti da ASAR.

## Runtime projectM

File obbligatori:

- `projectm-host.exe`;
- `projectM-4.dll`;
- `glew32.dll`;
- `msvcp140.dll`;
- `vcruntime140.dll`;
- `vcruntime140_1.dll`;
- `manifest.json`.

Versione: projectM 4.1.6 con overlay
`native/projectm-4.1.6-determinism/overlay`. La DLL è caricata tramite percorso
relativo alle risorse e resta sostituibile con una build ABI compatibile che
esponga `projectm_create_with_seed(uint64_t)`. Il protocollo host v2 serializza
il seed in 8 byte little-endian.

## Runtime FFmpeg/OpenH264

Versione: `n7.1.5-10-g2aefd64d48-20260727`  
Variante: BtbN `win64-lgpl-shared-7.1`  
Archivio SHA-256: `d2a6df844a674c04780478f33224134a29d1b54152f8d8314b82e02eccb02edd`

File obbligatori:

- `ffmpeg.exe`;
- `avcodec-61.dll`;
- `avdevice-61.dll`;
- `avfilter-10.dll`;
- `avformat-61.dll`;
- `avutil-59.dll`;
- `swresample-5.dll`;
- `swscale-8.dll`;
- `manifest.json`.

L’export seleziona `libopenh264` per H.264 e l’encoder AAC di FFmpeg. `ffmpeg-static` e `libx264` non devono comparire negli artefatti.

## Licenze incluse

- projectM: `licenses/projectM/LICENSE.txt`, `AUTHORS.txt`;
- GLEW: `licenses/GLEW/copyright`;
- FFmpeg: `licenses/ffmpeg/LGPL-3.0.txt`;
- OpenH264: `licenses/ffmpeg/OpenH264-LICENSE.txt`;
- Canvas: `licenses/canvas/LICENSE.txt`;
- preset: `PRESET_LICENSES.md` e licenza del preset incluso.

La presenza dei testi dimostra la preparazione documentale, non un parere legale definitivo.

## Verifica artefatti

Dopo la build:

1. aprire gli archivi/app estratti senza usare file del workspace;
2. controllare tutti i runtime sopra elencati;
3. cercare e rifiutare `ffmpeg-static`, `libx264`, mock e placeholder;
4. calcolare SHA-256 di Setup e Portable;
5. avviare la Portable da una cartella temporanea;
6. inizializzare projectM, caricare un `.milk`, inviare PCM ed esportare un MP4;
7. decodificare completamente l’MP4 con la copia FFmpeg inclusa.

## Artefatti audit finale

Rigenerati il 28 luglio 2026 dai binari compilati verificati e con i documenti di licenza finali sincronizzati:

| Artefatto | Byte | SHA-256 |
|---|---:|---|
| `Audio Visualizer Studio-Setup-0.2.0-x64.exe` | 141.168.765 | `02E4862B3E40B72DED3371E4259FA1E0FB56DC57B0FD20B378C8EFDA760722A5` |
| `Audio Visualizer Studio-Portable-0.2.0-x64.exe` | 140.938.766 | `B634BA8A9960203E699576193F5F0DEB9BE0797A5EA0205A2F10F710824424F8` |

Il contenuto `app.asar` è stato confrontato con la build corrente per `main.js`, `ipc.js` e renderer: hash identici. Tutte le risorse obbligatorie erano presenti; nessun file corrispondente a `ffmpeg-static`, `libx264`, mock o placeholder è stato trovato. Gli hash dei due documenti di licenza nel pacchetto coincidono con le sorgenti.

## Avvio esterno verificato

La Portable è stata copiata in:

`C:\Users\Lorenz\AppData\Local\Temp\AVSPhase2PortableExternal_20260728`

Ha avviato projectM 4.1.6 dal proprio `resources`, importato preset, riprodotto 10 minuti ed esportato 600 secondi senza dipendere dal workspace. Il test ha tuttavia evidenziato i difetti bloccanti di seed/riapertura e percorso Unicode descritti in `KNOWN_ISSUES.md`.

La Portable finale con SHA-256 `B634BA8A9960203E699576193F5F0DEB9BE0797A5EA0205A2F10F710824424F8` è stata inoltre ricopiata in `AVSPhase2FinalArtifactSmoke_20260728` e avviata con profilo isolato: wrapper, main process, GPU process, network service e renderer risultavano attivi dopo 15 secondi. I processi di prova sono stati quindi chiusi.

## Limiti di release

- artefatti non firmati Authenticode;
- Setup costruito/ispezionato ma non installato su VM pulita;
- 60 FPS non qualificato come profilo stabile;
- revisione legale finale ancora necessaria.
