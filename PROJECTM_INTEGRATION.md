# Integrazione projectM

Stato verificato il 28 luglio 2026. Questa pagina descrive il codice corrente, non l’architettura prevista in documenti precedenti.

## Versione fissata

- projectM: **4.1.6**
- tag: `v4.1.6`
- commit: `3158ee6`
- archivio sorgente: `libprojectM-4.1.6.tar.gz`
- SHA-256 sorgente: `1B9E6D56C59FE24E5416DA4D42E941A34C982811003E43AC88B5ACA8AFA52C87`
- piattaforma distribuita: Windows x64
- build: Release, libreria condivisa, interfaccia C, MSVC 19.44.35228.0

## Architettura reale

Electron non carica una binding nativa in-process. `projectm-host.exe` è un processo C++ separato che carica dinamicamente `projectM-4.dll`, crea un contesto OpenGL nascosto e comunica con il main process mediante protocollo binario versionato su stdin/stdout.

Componenti principali:

- `native/projectm-host/src/main.cpp`: lifecycle, caricamento dinamico, OpenGL, PCM, preset e lettura framebuffer;
- `src/main/projectm/projectMProtocol.ts`: framing IPC, magic, versione e limiti payload;
- `src/main/projectm/projectMHostService.ts`: processo figlio, richieste, timeout, stato, backpressure e isolamento errori;
- `src/main/projectm/projectMRuntime.ts`: risoluzione percorsi e verifica runtime;
- `src/main/projectm/projectMExportRenderer.ts`: rendering offline deterministico e invio a FFmpeg;
- `src/renderer/app.ts`: gestione preview e composizione del livello projectM con gli overlay.

Un crash dell’host non termina direttamente Electron. Il servizio rileva uscita/errore, aggiorna lo stato e può riavviare il processo. Il lifecycle chiude richieste, pipe, contesto OpenGL e handle del processo.

## Audio

Il renderer produce analisi audio per gli overlay e invia campioni PCM float interleaved al main process. Ogni richiesta `Step` contiene:

- larghezza e altezza;
- numero di step;
- canali;
- numero di frame PCM;
- campioni `float32` interleaved.

L’host usa `projectm_pcm_add_float`, dividendo il buffer secondo `projectm_pcm_get_max_samples`; quindi richiama `projectm_opengl_render_frame`. I test reali hanno verificato campioni accettati, incremento del frame e hash framebuffer audio-reattivo.

In export, FFmpeg decodifica l’audio sorgente a PCM float stereo; il renderer legge esattamente `sampleRate / fps` frame PCM per ogni frame video. I timestamp sono `frameIndex / fps`.

## Framebuffer e preview

L’host esegue `glReadPixels` in BGRA8, ribalta verticalmente le righe e restituisce metadati, tempi e pixel. Il renderer presenta projectM come livello dello stesso stack visuale; cover, testi e overlay Canvas restano sopra o sotto secondo l’ordine salvato.

La preview della demo ha usato 540×960 mentre l’export può usare 1080×1920. Questa separazione riduce la banda durante l’interazione.

## Trasporto, backpressure e memoria

- al massimo una richiesta render è in volo;
- se arriva una richiesta mentre il frame precedente non è consumato, il frame diventa obsoleto ed è scartato;
- `droppedFrames` è registrato;
- il protocollo rifiuta payload oltre 128 MiB;
- le scritture rispettano `drain`;
- il reader offline sospende/riprende stdout in base ai byte accodati;
- buffer PCM e frame sono riutilizzati dove previsto dal percorso offline.

La telemetria include latenza, banda IPC, tempo render, frame persi e memoria. Nella demo a 540×960 è stata osservata una misura istantanea di circa 1.008 Mbit/s sul primo frame e 0 frame scartati nel soak; non va interpretata come garanzia di 1080×1920 a 60 FPS.

## Export

L’export è frame-by-frame e usa `SceneCompositor`, lo stesso modello visuale della preview. projectM viene avanzato con PCM e tempo deterministico, quindi il framebuffer BGRA entra nel compositor con overlay, cover, testi, trasformazioni, opacità, blend, intervalli e ordine dei layer. FFmpeg riceve RGBA raw, codifica con OpenH264, codifica AAC e muxa MP4; non sostituisce gli effetti con `showfreqs`.

Il benchmark corrente:

- 1080×1920, 30 FPS, 60 s: 1.800 frame, 0 neri, 0 duplicati, 376,89 s;
- 1080×1920, 60 FPS, 10 s: 600 frame, 0 neri, 0 duplicati, 130,85 s.

Il profilo supportato è 30 FPS. Il risultato 60 FPS è soltanto una prova di correttezza breve.

## Runtime Windows e packaging

`resources/native/win-x64/` contiene:

- `projectm-host.exe`;
- `projectM-4.dll`;
- `glew32.dll`;
- `msvcp140.dll`;
- `vcruntime140.dll`;
- `vcruntime140_1.dll`;
- `manifest.json`.

Hash input principali:

- host: `971A77BD994235933F2F231F8468F10E23D04BA9295E0645BDF3B093D53D8D51`;
- DLL projectM: `7D06DDF3D4C4764F69E38B7DC7D4C1DB5043A67C94F6A35F2C9E2C16E93063F3`;
- GLEW: `1FE04A7C9F7EDA0857E9B6BFC9D54D106FA1529A0C4C04F2C248A785481C2792`.

Non sono richiesti Visual Studio, Node.js, repository, installazione separata o variabili d’ambiente. La DLL resta un file distinto e sostituibile, nel rispetto dell’impostazione di linking dinamico LGPL.

## Gestione errori

L’interfaccia mostra disponibilità, versione, stato, preset corrente, attiva/disattiva e messaggio d’errore. Libreria o host mancanti producono stato “non disponibile” senza chiudere l’app. Preset corrotti sono segnalati e possono essere messi in quarantena per motivi tecnici.

## Limiti aperti

1. i percorsi esterni con caratteri Unicode non ASCII possono essere alterati al confine con l’host C++;
2. la sequenza preset dopo riapertura non è riproducibile nonostante il seed invariato;
3. 1080×1920 a 60 FPS non è qualificato come profilo stabile;
4. l’audit è stato eseguito su una sola configurazione hardware Windows.

## Licenza

La licenza dichiarata di projectM 4.1.6 è LGPL-2.1-or-later. `licenses/projectM/LICENSE.txt` e `AUTHORS.txt`, sorgente, hash, versione, linking e assenza di modifiche dichiarate sono registrati. Si tratta di conformità tecnica/documentale; non è stato ottenuto un parere legale definitivo.
