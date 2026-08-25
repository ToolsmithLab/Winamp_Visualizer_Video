# Componenti di terze parti

Aggiornato il 28 luglio 2026.

Questo inventario documenta la conformità tecnica e documentale osservata. Non costituisce un parere legale e non dichiara il prodotto, projectM, i preset, FFmpeg o OpenH264 “legalmente approvati”.

## projectM

| Campo | Valore |
|---|---|
| Versione | 4.1.6 |
| Tag / commit | `v4.1.6` / `3158ee6` |
| Provenienza | release ufficiale projectM |
| Sorgente | `libprojectM-4.1.6.tar.gz` |
| SHA-256 sorgente | `1B9E6D56C59FE24E5416DA4D42E941A34C982811003E43AC88B5ACA8AFA52C87` |
| Licenza dichiarata | LGPL-2.1-or-later |
| Testi inclusi | `licenses/projectM/LICENSE.txt`, `AUTHORS.txt` |
| Linking | dinamico, `projectM-4.dll` separata e sostituibile |
| Modifiche | overlay `avs-projectm-4.1.6-determinism-v1` |
| Sorgenti modificati | `native/projectm-4.1.6-determinism/overlay` |
| API aggiunta | `projectm_create_with_seed(uint64_t)` |
| Protocollo host | v2, seed uint64 little-endian |
| DLL SHA-256 | `E7337EC4FE54C00AF622069945A2911837512B7DCFEDB19032200683453524DF` |
| Modifiche alla libreria | nessuna dichiarata |
| Verifica tecnica | versione, caricamento DLL, 10 preset, PCM e framebuffer verificati |
| Revisione legale definitiva | non ottenuta |

L’applicazione comunica con un host C++ separato; la DLL rimane distinta. I file sorgente e le istruzioni di sostituzione sono identificati nel manifest e in `PROJECTM_INTEGRATION.md`.

## GLEW

| Campo | Valore |
|---|---|
| Componente | `glew32.dll` |
| Uso | caricamento funzioni OpenGL dell’host |
| Testo incluso | `licenses/GLEW/copyright` |
| SHA-256 | `1FE04A7C9F7EDA0857E9B6BFC9D54D106FA1529A0C4C04F2C248A785481C2792` |
| Verifica tecnica | DLL presente e caricata |
| Revisione legale definitiva | non ottenuta |

## FFmpeg

| Campo | Valore |
|---|---|
| Versione | `n7.1.5-10-g2aefd64d48-20260727` |
| Commit | `2aefd64d48` |
| Provenienza binaria | BtbN FFmpeg-Builds, autobuild 2026-07-27 14:00 |
| Variante | `win64-lgpl-shared-7.1` |
| Archivio SHA-256 | `d2a6df844a674c04780478f33224134a29d1b54152f8d8314b82e02eccb02edd` |
| Licenza dichiarata | LGPL-3.0-or-later |
| Linking | DLL condivise |
| Modifiche | nessuna dichiarata |
| Testo incluso | `licenses/ffmpeg/LGPL-3.0.txt` |
| Funzioni usate | decode audio, PCM, encode AAC, encode OpenH264, mux MP4 |
| Verifica tecnica | manifest/hash, build e decodifica export verificati |
| Revisione legale definitiva | non ottenuta |

Il binario `ffmpeg.exe` ha SHA-256 `A7983403100C03FE4F5514644CB69C09AB13DC9A102C3FEBB306E71068A98829`. Le DLL `avcodec-61`, `avdevice-61`, `avfilter-10`, `avformat-61`, `avutil-59`, `swresample-5` e `swscale-8` sono distribuite accanto all’eseguibile e registrate in `native/ffmpeg/win-x64/manifest.json`.

`ffmpeg-static` e `libx264` non fanno parte del packaging corrente.

## OpenH264

| Campo | Valore |
|---|---|
| Uso | encoder H.264 selezionato tramite FFmpeg `libopenh264` |
| Licenza dichiarata | BSD-2-Clause |
| Testo incluso | `licenses/ffmpeg/OpenH264-LICENSE.txt` |
| Verifica tecnica | codec rilevato negli export correnti |
| Revisione legale/patent review | non ottenuta |

La licenza software non esaurisce eventuali aspetti brevettuali o royalty H.264. È necessaria una valutazione separata per lo scenario distributivo concreto.

## Canvas nativo

| Campo | Valore |
|---|---|
| Pacchetto | `@napi-rs/canvas` 1.0.3 |
| Uso | compositor offline |
| Testo incluso | `licenses/canvas/LICENSE.txt` |
| Verifica tecnica | binding x64 incluso tramite `asarUnpack` |
| Revisione legale definitiva | non ottenuta |

## Runtime Microsoft Visual C++

`msvcp140.dll`, `vcruntime140.dll` e `vcruntime140_1.dll` sono inclusi per rendere autonoma la Portable. La redistribuzione e le attribuzioni del runtime richiedono verifica nell’ambito della revisione legale finale.

## Preset

Il catalogo ufficiale corrente contiene il solo pacchetto dei 37 preset di test projectM v4.1.6. Provenienza, hash, licenza principale dichiarata e caricamento sono verificati tecnicamente; la titolarità individuale storica non è certificata. I preset personali con licenza ignota non vengono redistribuiti. Dettagli in `PRESET_LICENSES.md`.

## Stato

La documentazione e il packaging contengono i testi e i manifest sopra indicati. Resta necessaria una revisione legale indipendente dell’intero bundle e delle modalità effettive di distribuzione.
