# Decisione architetturale per projectM

> Documento storico pre-implementazione. Per architettura e stato verificati sul codice corrente vedere `PROJECTM_INTEGRATION.md` e `PHASE_2_REPORT.md`.

Stato: **proposta vincolante per la chiusura della Fase 2**  
Data: 28 luglio 2026  
Decisione: **Opzione B — host C++ separato, collegato dinamicamente a
libprojectM, con IPC versionato**

## Contesto verificato

L'applicazione è Electron 37.10.3 su Windows x64. Il renderer è isolato con
`contextIsolation: true` e `nodeIntegration: false`; il preload espone un bridge
IPC limitato. La preview è un compositing Canvas 2D in
`src/renderer/previewRenderer.ts`. L'audio viene riprodotto e analizzato in
`src/renderer/audioEngine.ts` con Web Audio (`AudioContext`,
`MediaElementAudioSourceNode`, `AnalyserNode`).

L'export è invece costruito nel main process da
`src/main/exportService.ts`: avvia il binario di `ffmpeg-static` e usa filtri
FFmpeg (`showfreqs`/`showwaves`, `overlay`, `drawtext`). Non esegue il renderer
Canvas e non può quindi riprodurre l'intero stack della preview.

Non esistono oggi:

- libprojectM, binding nativi o processi host;
- caricamento o interpretazione di file `.milk`;
- passaggio PCM a projectM;
- framebuffer projectM nella preview o nell'export;
- modello dati, libreria o UI dei preset.

projectM 4.1.6 espone un'API C stabile per creazione/distruzione dell'istanza,
caricamento dei preset, invio PCM e rendering OpenGL. La libreria playlist è
separata. projectM richiede un contesto OpenGL corrente e non fornisce un
frontend né preset da redistribuire.

Fonti tecniche primarie:

- [repository ufficiale projectM](https://github.com/projectM-visualizer/projectm);
- [release ufficiali projectM](https://github.com/projectM-visualizer/projectm/releases);
- [documentazione build CMake](https://github.com/projectM-visualizer/projectm/blob/master/BUILDING-cmake.md);
- [API C projectM 4](https://github.com/projectM-visualizer/projectm/tree/master/src/api/include/projectM-4);
- [licenza projectM](https://github.com/projectM-visualizer/projectm/blob/master/LICENSE.txt).

## Requisiti decisionali

La soluzione deve:

1. usare realmente projectM e interpretare realmente `.milk`;
2. ricevere PCM, non statistiche FFT proprietarie;
3. funzionare su Windows x64 in sviluppo, NSIS e portable;
4. non rendere l'app dipendente dall'ABI nativa di Electron/Node;
5. isolare gli errori di driver, shader e preset;
6. produrre gli stessi frame projectM per preview ed export;
7. lasciare disponibili gli overlay Canvas, la copertina e i testi;
8. consentire la sostituzione delle DLL LGPL;
9. supportare arresto, timeout, log e riavvio controllato;
10. evitare file temporanei per ogni frame.

## Confronto delle opzioni

| Criterio | A — binding Node nativo diretto | B — host C++ separato con IPC | C — renderer separato orientato al solo scambio frame |
|---|---|---|---|
| Complessità iniziale | Media: wrapper N-API e gestione OpenGL sul thread corretto | Alta: host, protocollo, lifecycle, canali audio/frame | Alta: trasporto ad alta banda e sincronizzazione, ma dominio preset spesso resta duplicato in Electron |
| Stabilità | Bassa/media: addon e driver vivono nel processo Electron | Alta: confine di processo, watchdog e riavvio | Media/alta: isolamento presente, ma protocollo frame tende a diventare implicitamente l'API completa |
| Prestazioni | Potenzialmente massime se la texture resta sulla GPU | Buone: OpenGL nel host; una copia CPU del framebuffer nella prima implementazione | Variabili: memoria condivisa è veloce; pipe raw è semplice ma consuma banda; file temporanei sono inaccettabili |
| Compatibilità Windows | Critica per ABI Electron/Node, toolchain MSVC e contesto Chromium ANGLE/OpenGL | Buona: EXE x64 autonomo compilato con MSVC e DLL normali | Buona per host/pipe; memoria condivisa richiede comunque un consumer nativo o copie nel main |
| Packaging | Difficile: rebuild per la versione Electron, ASAR unpack, simboli e runtime addon | Prevedibile: cartella `resources/native/win-x64`, EXE e DLL firmabili | Prevedibile per l'EXE, più complessa se introduce addon per mappare la memoria |
| Rischio crash | Alto: access violation può terminare renderer o main | Basso per l'app: termina il solo host; resta il rischio di perdere la sessione visuale | Basso per l'app, analogo a B |
| Preview | Integrazione potenzialmente diretta, ma il contesto GL di Chromium non è un target C API affidabile | Frame BGRA consegnati al compositore Canvas con backpressure e frame dropping | Buona se il trasporto è ben progettato; senza API di sessione preset/audio diventa fragile |
| Export | Richiede comunque un renderer offline distinto e gestione thread/contesto | Lo stesso host può funzionare in modalità deterministica frame-step e alimentare l'export | Adatta alla produzione frame, ma tende a separare la logica di preview da quella di export |
| LGPL | Possibile con DLL dinamica, ma addon/ASAR rende meno trasparente la sostituzione | Ottima: DLL projectM separata, visibile e sostituibile accanto all'host | Buona se usa DLL dinamica; dipende dall'implementazione concreta |
| Manutenzione | Alta: rebuild a ogni salto Electron/Node e debugging misto JS/C++ | Media: protocollo stabile e host aggiornabile indipendentemente | Medio/alta: il trasporto diventa un'API ad hoc e rischia di duplicare B senza i suoi confini di responsabilità |

### Opzione A — binding Node.js diretto

Il binding caricherebbe `projectM-4.dll` nel main, preload o renderer tramite
N-API. È l'opzione con il percorso potenzialmente più corto verso una texture,
ma non è sufficiente da sola: projectM deve essere chiamato su un thread con un
contesto OpenGL corrente, mentre Electron/Chromium usa un proprio stack grafico
e non offre a un addon generico un contesto OpenGL condivisibile in modo stabile.

Anche scegliendo N-API invece dell'ABI V8, l'addon resta legato a runtime,
architettura, toolchain e regole di packaging Electron. Un access violation,
un preset malformato che espone un bug nativo o un problema del driver può
terminare il processo che ospita l'addon. Per questi motivi A non è scelta.

### Opzione B — host C++ separato

Un eseguibile `projectm-host.exe` possiede:

- contesto OpenGL Core nascosto/offscreen;
- istanza `projectm_handle`;
- istanza playlist opzionale;
- caricamento preset e texture;
- alimentazione PCM;
- avanzamento deterministico per frame;
- framebuffer OpenGL/FBO e lettura BGRA;
- validazione preset, errori, metriche e log.

Electron possiede il progetto, la libreria catalogata, l'interfaccia utente e il
compositore Canvas. Il confine usa un protocollo locale versionato, con comandi
di controllo e pacchetti binari a lunghezza prefissata. Il protocollo, non
l'ABI Node, diventa il contratto stabile.

Questa è la soluzione scelta.

### Opzione C — processo separato con memoria, pipe o file

C descrive soprattutto il mezzo di trasporto del framebuffer, non una
responsabilità applicativa completa. Memoria condivisa, named pipe e file
temporanei hanno caratteristiche diverse:

- memoria condivisa: massime prestazioni, ma JavaScript non può mappare una
  sezione Win32 senza un altro addon nativo; tale addon reintroduce parte del
  rischio A;
- named pipe/raw stream: una copia CPU in più, ma nessun addon e una semantica
  di backpressure chiara;
- file temporaneo per frame: latenza, I/O, cleanup e rischio antivirus troppo
  elevati; viene escluso.

Le pipe saranno usate come **trasporto interno di B**, non come architettura C
autonoma. Se i profili reali dimostreranno che la copia è il collo di bottiglia,
una memoria condivisa a triple buffer potrà essere una successiva ottimizzazione
del protocollo senza cambiare l'architettura.

## Decisione dettagliata

### Versione e API

- pin iniziale: libprojectM **4.1.6**, tag e commit verificati, hash SHA-256
  registrato nel manifest nativo;
- collegamento: DLL condivise, mai statiche;
- interfaccia: API C, non interfaccia C++ non supportata;
- API minime:
  `projectm_create`, `projectm_destroy`,
  `projectm_load_preset_file`, `projectm_pcm_get_max_samples`,
  `projectm_pcm_add_float`, `projectm_set_fps`,
  `projectm_set_window_size`, `projectm_set_texture_search_paths`,
  `projectm_set_preset_duration`, `projectm_set_soft_cut_duration`,
  `projectm_set_preset_locked`, `projectm_opengl_render_frame`;
- playlist: API C di `libprojectM-4-playlist` per elenco, precedente,
  successivo e callback. La scelta casuale riproducibile e la timeline
  automatica restano governate dall'app tramite seed e schedule persistiti.

Il pin è deliberato: un aggiornamento projectM richiederà riesecuzione della
suite dei 10 preset, test di transizione, soak test e verifica licenze.

### Processo e contesto grafico

Il target Windows iniziale è un host MSVC 2022 x64 con:

- CMake;
- OpenGL Core;
- GLEW, dipendenza prevista dal manifest vcpkg projectM su Windows;
- SDL2 per creare e gestire una finestra OpenGL nascosta in modo collaudato
  dagli esempi projectM; SDL2 non è il renderer visuale;
- FBO della risoluzione richiesta e `glReadPixels` in BGRA8.

Il contesto appartiene sempre al thread di rendering del host. Tutte le
operazioni projectM vengono serializzate su quel thread. Nessuna funzione
projectM viene chiamata direttamente da Electron.

### Protocollo IPC

Canali logici:

1. **control**: handshake, configurazione, preset, seek/reset, stato e shutdown;
2. **audio**: blocchi Float32 interleaved stereo con indice campione;
3. **frame**: richiesta/risposta con sessione, frame index, dimensioni, stride,
   formato `BGRA8` ed eventuale errore;
4. **events/log**: preset caricato/fallito, transizione, metriche, warning.

Il framing è binario (`magic`, versione, tipo, lunghezza, request id) e ogni
payload di controllo è JSON UTF-8 validato. Devono esistere:

- handshake con versione protocollo e versione projectM;
- limiti massimi di payload;
- timeout;
- backpressure;
- cancellazione;
- shutdown cooperativo seguito da kill solo in caso di timeout;
- nessuna interpretazione di path o comandi shell;
- nessuna rete aperta dal host.

Per la preview, il renderer richiede frame alla risoluzione effettiva della
preview e mantiene al massimo un frame in volo; se è in ritardo scarta la
consegna, non l'avanzamento logico. Per l'export, ogni frame viene richiesto e
confermato in sequenza: nessun frame può essere perso.

### Audio e clock

projectM deve ricevere PCM reale. I valori `volume`, `bass`, `mid` e `high`
calcolati oggi da `AnalyserNode` non sono un sostituto.

La nuova pipeline decodifica l'audio in PCM Float32 stereo normalizzato e usa
un accumulatore razionale campioni/frame:

`samples(n) = floor((n + 1) * sampleRate / fps) - floor(n * sampleRate / fps)`.

I blocchi vengono spezzati rispettando `projectm_pcm_get_max_samples()`. Il
frame `n` riceve esattamente i campioni del proprio intervallo prima di
`projectm_opengl_render_frame()`.

- preview: l'elemento audio resta il clock udibile; il coordinatore porta la
  sessione projectM al frame logico corrispondente;
- pausa: non avanza né PCM né frame;
- frame UI perso: il host avanza comunque i frame intermedi necessari;
- seek: nuova sessione, stesso preset schedule e pre-roll PCM definito;
- export: sessione nuova da tempo zero, senza clock di parete.

Il seed della selezione casuale, la sequenza effettiva dei preset e i parametri
di transizione vengono salvati. Questo evita che preview ed export scelgano
preset diversi.

### Compositing e parità

projectM diventa un nuovo `LayerKind` dello stack visuale. Non sostituisce gli
overlay Canvas esistenti.

Viene estratto un unico `SceneComposer` TypeScript, privo di dipendenze UI, che
riceve:

- framebuffer projectM;
- `VisualizerProject`;
- analisi audio per gli overlay Canvas;
- frame index e tempo;
- copertina e font già caricati;
- PRNG con seed per ogni effetto stocastico.

La preview usa `SceneComposer` nel renderer visibile. L'export usa lo stesso
bundle in un renderer Electron offscreen dedicato, guidato frame per frame:

1. FFmpeg decodifica l'audio in PCM Float32;
2. il host projectM riceve i campioni e restituisce il frame base;
3. il renderer offscreen esegue lo stesso `SceneComposer`;
4. il frame composito RGBA viene inviato con backpressure a FFmpeg;
5. FFmpeg codifica e muxa l'audio originale/normalizzato.

La correttezza ha priorità sulla velocità nella prima implementazione. Le
copie raw potranno rendere l'export più lento del tempo reale, ma garantiscono
che copertina, testi, blend mode e overlay siano prodotti dallo stesso codice.

### Gestione degli errori

- preset non caricabile: callback di errore, quarantena, nessuna dichiarazione
  di successo;
- crash host: preview mostra errore recuperabile e può creare una nuova
  sessione; export fallisce senza lasciare un MP4 indicato come completo;
- timeout frame: annullamento della sessione;
- driver/OpenGL non compatibile: diagnostica con vendor/renderer/versione e
  blocco esplicito di projectM;
- texture mancanti: warning inventariato; il preset resta valido solo se
  projectM lo carica e la policy del test lo accetta;
- frame incompleto/versione protocollo errata: rifiuto del pacchetto.

## Compatibilità Electron, Node e librerie native

Electron 37 incorpora Node, ma non serve compilare il host contro quel Node.
Il servizio TypeScript usa solo `child_process`, stream e IPC Electron standard.
Questo separa:

- aggiornamenti Electron/V8/Node;
- build MSVC del host;
- aggiornamenti della DLL projectM.

La compatibilità da certificare è quindi:

- app ed EXE entrambi x64;
- Microsoft Visual C++ runtime disponibile o redistribuito secondo licenza;
- DLL projectM/GLEW/SDL2 risolte esclusivamente nella directory nativa
  dell'app;
- contesto OpenGL Core supportato dal driver Windows;
- protocollo IPC della stessa major version.

## Packaging Windows x64

Struttura prevista:

```text
resources/
  native/win-x64/
    projectm-host.exe
    projectM-4.dll
    projectM-4-playlist.dll
    SDL2.dll
    [altre DLL runtime effettivamente richieste]
    manifest.json
  licenses/
    projectM-LGPL-2.1.txt
    projectM-NOTICES.md
    SDL2-LICENSE.txt
    FFmpeg-LICENSE.txt
    FFmpeg-NOTICES.md
```

I binari nativi devono stare in `extraResources`, fuori da `app.asar`.
`projectm-host.exe` viene avviato da `process.resourcesPath` con
`windowsHide: true`, senza dipendere dalla current working directory. NSIS e
portable devono superare gli stessi smoke test da una macchina Windows x64
pulita senza Node, CMake o Visual Studio.

EXE, DLL e installer devono essere firmati. Il manifest deve contenere versione,
architettura e SHA-256; all'avvio il servizio verifica il manifest e l'handshake.

## LGPL projectM

La strategia tecnica è:

1. collegamento dinamico a `projectM-4.dll` e alla DLL playlist;
2. DLL non inglobate in ASAR, non rinominate e sostituibili dall'utente;
3. testo LGPL-2.1 completo e notice nel pacchetto e nell'About;
4. versione, tag, commit, hash e URL del sorgente corrispondente;
5. istruzioni per sostituire la libreria con una build compatibile;
6. disponibilità del sorgente corrispondente e delle patch per ogni modifica;
7. nessun divieto EULA che annulli i diritti concessi dalla LGPL;
8. inventario separato delle licenze di GLEW, SDL2, GLM e projectm-eval;
9. revisione legale prima della distribuzione.

Questa è una strategia ingegneristica, non un parere legale.

## FFmpeg

Il pacchetto attuale `ffmpeg-static` include un build GPL e l'export usa
`libx264`. Prima del rilascio va sostituito o va accettata e implementata una
strategia di distribuzione GPL coerente con l'intera applicazione. La strada
raccomandata è:

- build FFmpeg riproducibile e pinning esatto;
- configurazione LGPL senza componenti GPL, in particolare senza libx264;
- H.264 tramite encoder Windows Media Foundation `h264_mf`, con test software
  e hardware e input NV12;
- inventario `ffmpeg -buildconf`, hash, licenza, sorgente corrispondente e
  notice inclusi;
- fallback esplicito se Media Foundation non è disponibile; nessun fallback
  silenzioso a un binario GPL.

La documentazione ufficiale FFmpeg conferma che i componenti opzionali GPL
rendono GPL l'intero build e segnala esplicitamente libx264; documenta inoltre
gli encoder Media Foundation, incluso `h264_mf`:

- [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html);
- [FFmpeg Codecs — MediaFoundation](https://ffmpeg.org/ffmpeg-codecs.html#MediaFoundation).

Codec, brevetti e requisiti di distribuzione devono comunque essere verificati
legalmente nei paesi target.

## Conseguenze

### Positive

- crash nativi isolati;
- nessun rebuild addon a ogni upgrade Electron;
- DLL LGPL chiaramente separata e sostituibile;
- stesso motore projectM per preview ed export;
- validazione preset eseguibile in sandbox di processo;
- protocollo testabile senza UI.

### Costi

- un sottoprogetto C++/CMake da mantenere;
- una copia CPU del framebuffer e maggiore banda IPC;
- export probabilmente più lento del tempo reale;
- maggiore complessità di sincronizzazione PCM/frame;
- necessità di CI Windows e test su più GPU/driver.

### Rischi residui

- differenze OpenGL fra GPU e driver;
- preset che compilano shader molto costosi o fanno emergere bug upstream;
- consumo memoria durante cambi ripetuti di preset, da coprire con soak test;
- saturazione delle pipe a 1080 × 1920 × 60;
- disponibilità/qualità dell'encoder Media Foundation;
- licenze dei preset e delle texture non ereditabili automaticamente dalla
  licenza del motore.

## Condizioni per rivedere la decisione

La decisione può essere riaperta solo se un prototipo misurato dimostra almeno
una delle condizioni seguenti:

- la pipe non raggiunge 30 FPS alla risoluzione export minima accettata;
- l'export è oltre la soglia prestazionale approvata dal prodotto;
- un driver target non permette il contesto OpenGL nascosto;
- una modifica upstream rende incompatibile l'API C scelta.

In quel caso la prima ottimizzazione sarà una memoria condivisa a triple buffer
con un consumer strettamente isolato, non il caricamento di projectM nel
renderer Electron.
