# Winamp-Style Music Visualizer & MP4 Generator

## 1. Obiettivo del progetto

Realizzare un'applicazione desktop per Windows che permetta di:

1. caricare un file audio MP3 o WAV;
2. analizzarne automaticamente ritmo, volume e spettro di frequenze;
3. applicare visualizzazioni musicali reattive in stile Winamp/MilkDrop;
4. aggiungere una copertina, testi e altri elementi grafici;
5. montare il tutto in formato prevalentemente verticale 9:16;
6. esportare un video MP4 della stessa durata del brano.

Il programma deve essere pensato soprattutto per creare contenuti destinati a:

- TikTok;
- Instagram Reels;
- YouTube Shorts;
- Spotify Canvas o altri formati promozionali verticali.

Il nome provvisorio del progetto è:

**Audio Visualizer Studio**

Il nome deve essere facilmente modificabile in seguito.

---

## 2. Principio generale

Il programma non deve limitarsi a riprodurre un'animazione con velocità fissa.

Gli effetti devono reagire realmente alla musica attraverso:

- volume generale;
- battiti rilevati;
- transienti;
- basse frequenze;
- medie frequenze;
- alte frequenze;
- variazioni di energia;
- eventuali sezioni musicali individuate automaticamente.

Ogni effetto deve poter reagire a una o più bande di frequenza.

Esempio:

- il basso controlla la dimensione di un cerchio;
- il kick genera impulsi o flash;
- le frequenze medie controllano linee o forme;
- le frequenze alte controllano particelle, glitch o scintille.

---

## 3. Piattaforma e architettura consigliata

### 3.1 Piattaforma principale

- Windows 10 e Windows 11;
- applicazione desktop;
- funzionamento offline;
- nessun account obbligatorio;
- nessun caricamento dei file su server esterni.

### 3.2 Stack consigliato

Prima scelta:

- Electron;
- TypeScript;
- HTML5;
- CSS;
- Canvas 2D;
- WebGL;
- Web Audio API;
- FFmpeg.

Alternativa futura:

- Tauri per ridurre dimensioni e consumo di memoria.

Per la prima versione usare Electron, perché consente uno sviluppo più rapido e una migliore integrazione con librerie JavaScript e FFmpeg.

### 3.3 Struttura tecnica

Separare il progetto in moduli:

- interfaccia utente;
- gestione progetto;
- caricamento file;
- analisi audio;
- motore visuale;
- sistema di effetti overlay;
- integrazione projectM;
- gestione libreria preset MilkDrop;
- gestione timeline;
- composizione scena;
- esportazione video;
- gestione preset;
- salvataggio configurazioni.

---

## 4. Formati supportati

### 4.1 Audio

Supportare almeno:

- MP3;
- WAV;
- FLAC, se l'integrazione non complica la prima versione;
- AAC o M4A in una fase successiva.

### 4.2 Immagini

Supportare:

- PNG;
- JPG/JPEG;
- WEBP.

Le immagini PNG con trasparenza devono mantenere il canale alpha.

### 4.3 Esportazione

Formato principale:

- MP4;
- video H.264;
- audio AAC;
- 1080 × 1920;
- 30 FPS;
- 60 FPS opzionale.

Altri formati video:

- 1080 × 1080;
- 1080 × 1350;
- 1920 × 1080;
- risoluzione personalizzata.

---

## 5. Creazione e gestione del progetto

All'avvio mostrare:

- Nuovo progetto;
- Apri progetto;
- Progetti recenti;
- Impostazioni.

Ogni progetto deve poter essere salvato in un file dedicato, ad esempio:

`nomeprogetto.avsproject`

Il file progetto deve contenere:

- percorso del file audio;
- percorso delle immagini;
- formato video;
- effetti overlay attivi;
- preset MilkDrop e relativi intervalli;
- parametri degli effetti;
- testi inseriti;
- posizione e dimensione degli elementi;
- keyframe;
- preset utilizzato;
- impostazioni di esportazione.

Usare JSON o una struttura serializzata facilmente leggibile.

Gestire il caso in cui un file audio o un'immagine vengano spostati o eliminati.

Mostrare un avviso e permettere di ricollegare il file mancante.

---

## 6. Interfaccia principale

L'interfaccia deve avere tema scuro, moderno, leggibile e professionale.

### 6.1 Colonna sinistra

Pannello principale con sezioni:

- Media;
- Visualizzatori;
- Effetti;
- Preset;
- Testo;
- Livelli;
- Progetto.

### 6.2 Area centrale

Anteprima video verticale.

Funzioni:

- selezione degli elementi;
- trascinamento;
- ridimensionamento;
- rotazione;
- allineamento;
- guide centrali;
- griglia;
- area sicura TikTok/Instagram;
- zoom della preview.

### 6.3 Colonna destra

Inspector contestuale.

Mostrare i parametri dell'elemento selezionato:

- posizione X/Y;
- larghezza;
- altezza;
- scala;
- rotazione;
- opacità;
- modalità fusione;
- colore;
- reazione musicale;
- animazione;
- keyframe.

### 6.4 Timeline inferiore

La timeline deve mostrare:

- forma d'onda audio;
- cursore temporale;
- durata totale;
- marcatori;
- livelli grafici;
- testi;
- copertina;
- effetti overlay;
- keyframe;
- cambi di preset;
- inizio e fine delle clip.

Controlli:

- play;
- pausa;
- stop;
- torna all'inizio;
- loop selezione;
- zoom timeline;
- aggancio ai battiti;
- aggiunta marcatore.

---

## 7. Analisi audio

Alla selezione del file audio, avviare una fase di analisi.

Calcolare e memorizzare:

- durata;
- sample rate;
- numero di canali;
- livello medio;
- picchi;
- forma d'onda;
- BPM stimati;
- beat grid;
- transienti;
- energia delle basse frequenze;
- energia delle medie frequenze;
- energia delle alte frequenze;
- spettro FFT;
- eventuali cambi di sezione.

### 7.1 Bande predefinite

Prevedere almeno queste bande:

- Sub: 20–60 Hz;
- Bass: 60–150 Hz;
- Low Mid: 150–500 Hz;
- Mid: 500–2000 Hz;
- High Mid: 2000–6000 Hz;
- High: 6000–20000 Hz.

### 7.2 Parametri di reazione

Ogni effetto overlay deve avere:

- sorgente audio;
- banda di frequenza;
- sensibilità;
- smoothing;
- soglia minima;
- soglia massima;
- intensità;
- tempo di attacco;
- tempo di rilascio;
- inversione del segnale;
- risposta lineare o esponenziale.

### 7.3 Beat detection

Il sistema deve rilevare:

- beat principali;
- transienti forti;
- kick probabili;
- snare probabili, se possibile;
- variazioni ritmiche rilevanti.

Il beat detection non deve essere obbligatoriamente perfetto, ma deve produrre una sincronizzazione visivamente credibile.

Aggiungere la possibilità di correggere manualmente:

- BPM;
- posizione del primo battito;
- griglia ritmica;
- moltiplicatore o divisore BPM.

---

## 8. Motore MilkDrop tramite projectM

La visualizzazione principale non deve essere ricreata da zero con semplici animazioni generiche.

Integrare **libprojectM** come motore principale compatibile con MilkDrop. projectM deve essere usato come libreria condivisa, rispettando i termini della licenza LGPL-2.1 e mantenendo separati il codice dell'applicazione, la libreria e gli avvisi di terze parti.

### 8.1 Terminologia obbligatoria

Nell'interfaccia usare questi termini:

- **Motore visuale**: projectM;
- **Preset MilkDrop**: file visuale `.milk`;
- **Pacchetto preset**: insieme installabile di preset e relative risorse;
- **Effetto overlay**: effetto proprietario sovrapposto al rendering projectM;
- **Preset progetto**: configurazione completa della scena, distinta dai preset MilkDrop.

Non chiamare i file `.milk` “plugin”, perché non sono componenti eseguibili dell'applicazione.

### 8.2 Funzioni del motore projectM

Implementare:

- caricamento di preset `.milk` compatibili;
- riproduzione del preset selezionato;
- precedente, successivo e casuale;
- blocco del preset corrente;
- cambio automatico regolabile;
- transizione fluida tra preset;
- durata della transizione regolabile;
- cambio casuale senza ripetizioni immediate;
- cambio sui marcatori della timeline;
- sequenza di preset assegnabile a intervalli del brano;
- anteprima a qualità ridotta;
- rendering finale alla risoluzione e agli FPS di esportazione;
- gestione di texture e risorse associate;
- intercettazione degli errori senza chiudere il programma.

### 8.3 Libreria preset integrata

Il programma deve includere un **Catalogo preset verificati**.

Un pacchetto può essere distribuito o scaricato automaticamente solo quando possiede:

- fonte ufficiale o repository identificabile;
- licenza esplicita e leggibile;
- autore o progetto di provenienza, quando dichiarato;
- versione del pacchetto;
- URL della fonte;
- hash SHA-256 dell'archivio;
- data di verifica;
- elenco delle risorse incluse;
- compatibilità dichiarata con la versione di projectM usata.

Ogni pacchetto deve avere un manifest simile a:

```json
{
  "id": "preset-pack-id",
  "name": "Nome pacchetto",
  "version": "1.0.0",
  "sourceUrl": "https://...",
  "downloadUrl": "https://...",
  "license": "IDENTIFICATIVO-SPDX-O-TESTO-ESPLICITO",
  "licenseUrl": "https://...",
  "authors": ["Autore o progetto"],
  "sha256": "...",
  "verifiedAt": "YYYY-MM-DD",
  "projectMCompatibility": ">=4.x"
}
```

Il catalogo non deve scaricare automaticamente raccolte trovate casualmente sul Web. Se la licenza del pacchetto o dei singoli preset non è chiara, il pacchetto non deve comparire tra quelli installabili.

### 8.4 Gestore download preset

Aggiungere una schermata **Gestisci preset** con:

- pacchetti disponibili;
- pacchetti installati;
- dimensione del download;
- autore o progetto;
- licenza;
- collegamento alla fonte;
- versione;
- pulsante Installa;
- Aggiorna;
- Disinstalla;
- Verifica integrità;
- Mostra cartella;
- Leggi licenza.

Prima dell'installazione mostrare la licenza e richiedere una conferma esplicita.

Il download deve:

1. usare HTTPS;
2. salvare l'archivio in una directory temporanea;
3. verificare l'hash SHA-256;
4. impedire path traversal durante l'estrazione;
5. accettare soltanto estensioni consentite;
6. installare in una cartella separata per pacchetto e versione;
7. aggiornare il database locale dei preset.

### 8.5 Importazione manuale

L'utente deve poter importare:

- un singolo file `.milk`;
- più file `.milk`;
- una cartella;
- un archivio ZIP contenente preset e texture.

Metodi:

- pulsante **Importa preset**;
- trascinamento nella finestra;
- selezione di una cartella esterna da usare senza copiarla;
- copia nella libreria personale del programma.

Durante l'importazione:

- analizzare l'archivio in modo sicuro;
- mostrare il numero di preset trovati;
- rilevare duplicati tramite hash;
- segnalare file non supportati;
- verificare le texture mancanti;
- provare ogni preset in un processo isolato o protetto;
- mettere in quarantena quelli che causano errori;
- non caricare DLL, EXE, script esterni o altri file eseguibili.

Mostrare questo avviso:

> I preset importati manualmente provengono da fonti scelte dall'utente. Il programma non ne certifica licenza, titolarità o sicurezza. L'utente deve verificare di avere il diritto di usarli e distribuirne il risultato.

L'importazione manuale deve rimanere possibile anche quando i metadati di licenza non sono disponibili, ma tali preset devono essere etichettati **Licenza non verificata** e non devono essere redistribuiti dall'applicazione.

### 8.6 Browser dei preset

Il browser deve mostrare:

- nome del preset;
- autore ricavato dal nome o dai metadati, quando disponibile;
- pacchetto di provenienza;
- licenza del pacchetto;
- miniatura generata localmente;
- stato: verificato, personale, licenza non verificata, incompatibile o quarantena;
- preferito;
- valutazione personale;
- data dell'ultimo utilizzo.

Funzioni:

- ricerca;
- filtri;
- ordinamento;
- preferiti;
- cronologia;
- raccolte personali;
- playlist di preset;
- anteprima su un intervallo del brano;
- esclusione dalla modalità casuale.

### 8.7 Playlist e cambi automatici

Permettere di creare playlist di preset e scegliere:

- ordine fisso;
- ordine casuale;
- durata minima e massima;
- cambio ogni N secondi;
- cambio ogni N battute;
- cambio sui transienti forti;
- cambio sui marcatori inseriti dall'utente;
- dissolvenza tra preset;
- nessuna ripetizione finché la playlist non è terminata.

La sequenza effettivamente usata deve essere salvata nel progetto per garantire che una nuova esportazione produca lo stesso video. Non affidarsi a casualità non deterministica. Salvare il seed casuale.

### 8.8 Effetti overlay proprietari

Gli effetti proprietari non sostituiscono projectM. Vengono renderizzati come livelli sopra o sotto il motore MilkDrop.

Implementare inizialmente:

1. Spectrum Bars;
2. Circular Spectrum;
3. Waveform Line;
4. Particle Burst;
5. Lightning;
6. Glitch;
7. Pulse Shapes;
8. Vignette dinamica;
9. Flash controllato;
10. Grain/CRT leggero.

Ogni overlay deve avere:

- identificativo;
- nome;
- categoria;
- parametri configurabili;
- sorgente audio;
- banda di frequenza;
- metodo di rendering;
- stato serializzabile;
- supporto ai keyframe;
- modalità di fusione;
- anteprima.

### 8.9 Sicurezza fotosensibile

Gli effetti flash e strobo devono essere disattivati per impostazione predefinita.

Quando vengono attivati:

- mostrare un avviso;
- limitare la frequenza predefinita;
- offrire un controllo “Riduci lampeggi”;
- analizzare l'esportazione e segnalare sequenze potenzialmente intense;
- consentire di esportare una variante senza flash.

### 8.10 Licenze e attribuzioni

Generare e distribuire:

- `THIRD_PARTY_LICENSES.md`;
- elenco dei pacchetti preset installati;
- versione di projectM;
- testo della LGPL-2.1;
- istruzioni per ottenere o sostituire la libreria projectM quando richiesto dalla licenza;
- attribuzioni e licenze dei pacchetti redistribuiti.

Non usare “Winamp” o “MilkDrop” come nome commerciale del programma. È ammessa una descrizione tecnica prudente come “compatibile con preset MilkDrop”, subordinata a verifica finale di marchi e licenze.

## 9. Livelli e composizione

Il programma deve usare una struttura a livelli simile a un editor grafico.

Ogni elemento deve poter essere:

- spostato sopra o sotto gli altri;
- mostrato o nascosto;
- bloccato;
- duplicato;
- eliminato;
- rinominato;
- raggruppato;
- reso parzialmente trasparente.

Tipi di livello:

- sfondo colore;
- sfondo immagine;
- copertina;
- visualizzatore;
- effetto;
- testo;
- forma;
- overlay;
- vignettatura;
- logo.

Modalità di fusione iniziali:

- normale;
- screen;
- multiply;
- add;
- overlay;
- lighten;
- darken.

---

## 10. Gestione della copertina

L'utente deve poter caricare una o più immagini.

Funzioni:

- trascinamento libero;
- ridimensionamento;
- rotazione;
- ritaglio;
- mantenimento proporzioni;
- posizione numerica;
- allineamento automatico;
- opacità;
- bordo;
- raggio angoli;
- maschera circolare;
- ombra;
- glow;
- riflesso opzionale;
- animazione ingresso;
- animazione uscita;
- pulsazione audio-reattiva;
- rotazione lenta;
- oscillazione.

Posizioni rapide:

- centro;
- alto;
- basso;
- alto sinistra;
- alto destra;
- basso sinistra;
- basso destra.

La copertina deve poter essere mantenuta completamente statica.

---

## 11. Testo

Aggiungere campi rapidi:

- Artista;
- Titolo brano;
- Album/EP;
- Testo libero.

Funzioni testo:

- selezione font;
- caricamento font locale, se tecnicamente possibile;
- dimensione;
- peso;
- corsivo;
- maiuscolo;
- allineamento;
- colore;
- opacità;
- bordo;
- ombra;
- glow;
- spaziatura lettere;
- spaziatura righe;
- larghezza massima;
- sfondo del testo;
- posizione;
- rotazione.

Animazioni:

- fade in;
- fade out;
- scorrimento;
- zoom;
- comparsa lettera per lettera;
- glitch;
- pulsazione;
- vibrazione;
- movimento verticale;
- movimento orizzontale.

Il testo deve poter comparire:

- per tutta la durata;
- solo all'inizio;
- solo in un intervallo scelto;
- in punti specifici della timeline.

---

## 12. Preset

Creare un sistema di preset salvabili e modificabili.

Preset iniziali:

- Dark Metal;
- Industrial;
- Electronic;
- Cyberpunk;
- Psychedelic;
- Lo-Fi;
- Cinematic;
- Minimal;
- Aggressive;
- Ambient.

Ogni preset può contenere:

- sfondo;
- effetti overlay attivi;
- preset MilkDrop e relativi intervalli;
- parametri;
- palette;
- impostazioni di reazione audio;
- posizioni degli elementi;
- transizioni;
- testo preconfigurato;
- modalità fusione.

L'utente deve poter:

- salvare un preset personale;
- rinominare il preset;
- duplicarlo;
- esportarlo;
- importarlo;
- ripristinare i preset originali.

---

## 13. Scene e cambi automatici

Prevedere un sistema di scene.

Una scena rappresenta una configurazione grafica valida per un intervallo temporale.

Esempio:

- scena 1: intro;
- scena 2: strofa;
- scena 3: ritornello;
- scena 4: breakdown;
- scena 5: finale.

Ogni scena può avere:

- plugin diversi;
- parametri diversi;
- sfondo diverso;
- posizione diversa della copertina;
- testi diversi;
- intensità diversa.

Transizioni:

- taglio;
- dissolvenza;
- flash;
- glitch;
- zoom;
- sfocatura;
- rotazione;
- distorsione.

La prima versione può supportare una scena unica, ma l'architettura deve essere già predisposta alle scene multiple.

---

## 14. Keyframe

Implementare keyframe per almeno:

- posizione;
- scala;
- rotazione;
- opacità;
- intensità effetto;
- colore;
- velocità;
- quantità particelle;
- sensibilità audio.

Interpolazioni:

- lineare;
- ease in;
- ease out;
- ease in/out;
- hold.

I keyframe devono essere visibili nella timeline.

---

## 15. Anteprima

L'anteprima deve essere fluida e sincronizzata con l'audio.

Prevedere:

- qualità bassa;
- qualità media;
- qualità alta;
- riduzione della risoluzione in anteprima;
- FPS ridotti in caso di hardware lento;
- indicatore FPS;
- avviso in caso di sovraccarico.

L'anteprima non deve modificare la qualità finale dell'esportazione.

---

## 16. Esportazione video

L'esportazione deve avvenire con FFmpeg.

### 16.1 Flusso previsto

1. generazione dei frame grafici;
2. codifica video;
3. sincronizzazione con audio originale;
4. mux finale MP4;
5. verifica durata;
6. salvataggio file.

### 16.2 Impostazioni esportazione

- cartella destinazione;
- nome file;
- risoluzione;
- FPS;
- bitrate video;
- qualità;
- codec;
- bitrate audio;
- intervallo da esportare;
- intero brano o anteprima.

Preset:

- Bozza rapida;
- Social standard;
- Alta qualità;
- Massima qualità.

### 16.3 Preset Social standard

- MP4;
- H.264;
- 1080 × 1920;
- 30 FPS;
- bitrate video tra 12 e 20 Mbps;
- AAC 320 kbps, se supportato;
- durata identica al file audio.

### 16.4 Requisiti importanti

- nessun ritardo tra audio e video;
- nessun taglio anticipato del brano;
- nessun fotogramma nero aggiuntivo alla fine;
- durata video uguale alla durata audio entro una tolleranza minima;
- barra di avanzamento;
- possibilità di annullare;
- log degli errori;
- messaggio finale con percorso del file.

---

## 17. Sicurezza ed effetti stroboscopici

Gli effetti stroboscopici devono essere disattivati per impostazione predefinita.

Quando vengono attivati mostrare un avviso:

> Gli effetti luminosi rapidi possono causare disturbi a persone fotosensibili.

Prevedere:

- limite massimo della frequenza flash;
- modalità ridotta;
- controllo intensità;
- possibilità di sostituire flash netti con pulsazioni morbide.

---

## 18. Prestazioni

Il programma deve funzionare su PC di fascia media.

Ottimizzazioni:

- rendering GPU quando disponibile;
- riduzione risoluzione preview;
- caching analisi audio;
- caching waveform;
- riduzione particelle automatica;
- caricamento lazy dei plugin;
- rilascio memoria dei progetti chiusi;
- uso controllato dei processi FFmpeg.

Aggiungere una modalità compatibilità per PC meno potenti.

---

## 19. Gestione errori

Gestire almeno:

- file audio non valido;
- formato non supportato;
- immagine corrotta;
- FFmpeg non disponibile;
- cartella non scrivibile;
- spazio su disco insufficiente;
- progetto danneggiato;
- plugin non disponibile;
- esportazione interrotta;
- memoria insufficiente;
- file sorgente spostato.

Gli errori devono essere mostrati in linguaggio comprensibile.

Salvare un log tecnico separato.

---

## 20. Struttura cartelle consigliata

```text
src/
  main/
    main.ts
    ipc.ts
    ffmpeg.ts
    fileSystem.ts
  renderer/
    app.ts
    ui/
    timeline/
    preview/
    project/
    audio/
    export/
  engine/
    audioAnalyzer/
    renderer/
    pluginHost/
    sceneManager/
    keyframes/
  plugins/
    spectrumBars/
    circularSpectrum/
    waveformLine/
    particleBurst/
    lightning/
    tunnel/
    plasma/
    kaleidoscope/
    glitch/
    pulseShapes/
  shared/
    types/
    constants/
    utils/
assets/
  icons/
  presets/
  fonts/
  thumbnails/
ffmpeg/
```

---

## 21. Struttura plugin proposta

Esempio concettuale TypeScript:

```ts
interface VisualizerPlugin {
  id: string;
  name: string;
  category: string;
  version: string;
  defaultSettings: Record<string, unknown>;

  initialize(context: PluginContext): Promise<void> | void;
  update(audioData: AudioFrameData, time: number): void;
  render(target: RenderTarget): void;
  resize(width: number, height: number): void;
  serialize(): Record<string, unknown>;
  deserialize(settings: Record<string, unknown>): void;
  dispose(): void;
}
```

Ogni plugin deve dichiarare i propri parametri con metadati per consentire la generazione automatica dei controlli nell'interfaccia.

Esempio:

```ts
interface PluginParameter {
  key: string;
  label: string;
  type: "number" | "range" | "color" | "boolean" | "select";
  min?: number;
  max?: number;
  step?: number;
  defaultValue: unknown;
  options?: Array<{ label: string; value: string }>;
}
```

---

## 22. Modello dati audio

Esempio:

```ts
interface AudioFrameData {
  time: number;
  volume: number;
  peak: number;
  bass: number;
  mid: number;
  high: number;
  sub: number;
  lowMid: number;
  highMid: number;
  fft: Float32Array;
  waveform: Float32Array;
  beat: boolean;
  transient: boolean;
}
```

---

## 23. Modello progetto

Esempio concettuale:

```ts
interface VisualizerProject {
  version: string;
  name: string;
  audioFile: string;
  canvas: {
    width: number;
    height: number;
    fps: number;
    backgroundColor: string;
  };
  layers: ProjectLayer[];
  scenes: Scene[];
  markers: TimelineMarker[];
  exportSettings: ExportSettings;
}
```

---

## 24. Fasi di sviluppo

### Fase 1: Prototipo funzionante

Obiettivo: ottenere un MP4 verticale con audio e un visualizzatore sincronizzato.

Implementare:

- progetto Electron;
- apertura MP3/WAV;
- riproduzione audio;
- analisi FFT;
- preview 9:16;
- un visualizzatore a barre;
- caricamento copertina;
- testo artista e titolo;
- esportazione MP4;
- salvataggio progetto base.

### Fase 2: Editor visuale

Implementare:

- livelli;
- trascinamento elementi;
- ridimensionamento;
- inspector;
- timeline;
- waveform;
- parametri audio-reattivi;
- cinque plugin aggiuntivi.

### Fase 3: Sistema plugin completo

Implementare:

- plugin host;
- 10 plugin;
- preset;
- import/export preset;
- modalità fusione;
- keyframe base.

### Fase 4: Scene ed esportazione avanzata

Implementare:

- scene multiple;
- transizioni;
- keyframe avanzati;
- preset export;
- rendering ottimizzato;
- 60 FPS;
- gestione errori completa.

### Fase 5: Distribuzione

Implementare:

- installer Windows;
- versione portabile;
- aggiornamenti manuali;
- cartella log;
- documentazione;
- progetto demo;
- preset demo.

---

## 25. MVP obbligatorio

La prima versione utilizzabile deve contenere almeno:

- importazione MP3 e WAV;
- analisi audio;
- forma d'onda;
- visualizzazione 9:16;
- copertina trascinabile;
- testo artista;
- testo titolo;
- 10 plugin visuali;
- parametri colore;
- parametri intensità;
- scelta della banda audio;
- timeline semplice;
- salvataggio progetto;
- anteprima sincronizzata;
- esportazione MP4 H.264;
- audio originale incluso;
- durata identica al brano;
- installer Windows;
- versione portabile.

---

## 26. Requisiti grafici

Tema:

- scuro;
- elegante;
- moderno;
- non eccessivamente complesso;
- pannelli leggibili;
- controlli ordinati;
- accenti colorati configurabili.

Non usare un'interfaccia dall'aspetto antiquato.

Evitare:

- pulsanti troppo grandi;
- pannelli pieni di bordi;
- colori casuali;
- icone poco chiare;
- testi minuscoli;
- finestre modali inutili.

L'anteprima deve essere sempre l'elemento dominante.

---

## 27. Requisiti UX

- autosalvataggio opzionale;
- undo e redo;
- scorciatoie da tastiera;
- tooltip;
- valori ripristinabili;
- doppio clic per rinominare livelli;
- drag and drop dei file;
- conferma prima di chiudere un progetto modificato;
- indicatori chiari durante analisi ed esportazione.

Scorciatoie minime:

- Ctrl+N: nuovo progetto;
- Ctrl+O: apri;
- Ctrl+S: salva;
- Ctrl+Shift+S: salva con nome;
- Ctrl+Z: annulla;
- Ctrl+Y: ripeti;
- Space: play/pausa;
- Delete: elimina elemento;
- Ctrl+D: duplica;
- Home: torna all'inizio.

---

## 28. Criteri di accettazione

Il progetto è considerato funzionante quando:

1. un utente può caricare un MP3 o WAV;
2. il programma genera una forma d'onda;
3. il visualizzatore reagisce realmente al brano;
4. la copertina può essere spostata e ridimensionata;
5. artista e titolo possono essere inseriti;
6. il video può essere visualizzato in anteprima;
7. il progetto può essere salvato e riaperto;
8. il video può essere esportato in MP4;
9. l'audio esportato resta sincronizzato;
10. la durata del video coincide con quella del brano;
11. il file finale viene riprodotto correttamente nei comuni player;
12. l'applicazione viene distribuita come installer e versione portabile.

---

## 29. Istruzioni operative per Codex

Sviluppare il progetto in modo incrementale.

Non tentare di implementare tutte le funzioni in un unico passaggio.

Procedura richiesta:

1. creare la struttura del repository;
2. configurare Electron e TypeScript;
3. realizzare un prototipo minimo funzionante;
4. verificare riproduzione e analisi audio;
5. implementare il primo visualizzatore;
6. implementare l'esportazione video;
7. aggiungere copertina e testo;
8. introdurre salvataggio progetto;
9. implementare la timeline;
10. aggiungere progressivamente i plugin.

Dopo ogni fase:

- eseguire il build;
- correggere gli errori TypeScript;
- verificare l'avvio;
- eseguire un test manuale;
- aggiornare README e changelog;
- non rimuovere funzioni già funzionanti.

Codex deve produrre codice reale e funzionante, non pseudocodice.

Usare tipi TypeScript chiari.

Evitare file monolitici.

Ogni modulo deve avere responsabilità limitate.

Prima di modificare componenti centrali, verificare le dipendenze e mantenere la compatibilità con i progetti salvati.

---

## 30. Prima richiesta da dare a Codex

Usare questa specifica come documento principale.

Richiesta iniziale consigliata:

> Leggi integralmente il file `Winamp_Visualizer_Video_Generator_Spec.md`. Crea il progetto Electron + TypeScript descritto, ma implementa inizialmente solo la Fase 1. Devi produrre un'applicazione realmente avviabile su Windows che carichi MP3/WAV, riproduca l'audio, mostri un visualizzatore a barre audio-reattivo in una preview 9:16, permetta di aggiungere una copertina e i testi artista/titolo, salvi un progetto base ed esporti un MP4 H.264 con audio sincronizzato. Prima crea una checklist tecnica, poi implementa i file, installa le dipendenze necessarie, esegui build e test, correggi gli errori e aggiorna il README con le istruzioni per esecuzione e compilazione. Non implementare ancora le fasi successive e non sostituire funzioni richieste con mock.

---

## 31. Nota finale

La priorità è ottenere prima un'applicazione stabile che generi correttamente un video sincronizzato.

Gli effetti spettacolari devono essere aggiunti soltanto dopo avere verificato:

- precisione della durata;
- sincronizzazione audio/video;
- stabilità della preview;
- corretto salvataggio del progetto;
- affidabilità dell'esportazione.

Un visualizzatore semplice ma sincronizzato e stabile è più utile di cinquanta effetti che producono un MP4 rotto.
