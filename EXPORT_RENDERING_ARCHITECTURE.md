# Architettura del rendering export

## Decisione

L'export è un renderer offline frame-by-frame dello stesso compositor usato
dall'anteprima. FFmpeg è esclusivamente encoder e muxer.

## Flusso

```text
audio originale
  ├─ FFmpeg decoder -> PCM f32 stereo 48 kHz
  │                    ├─ projectM host isolato
  │                    └─ analisi FFT deterministica
  │
  └─ FFmpeg encoder audio AAC

projectM RGBA + snapshot audio + progetto/seed/timestamp
  -> SceneCompositor
  -> frame RGBA completo
  -> pipe con backpressure
  -> FFmpeg H.264 yuv420p
  -> mux MP4 con AAC
```

## Componenti

- `src/shared/sceneCompositor.ts`: modello visuale condiviso.
- `src/shared/audioAnalysis.ts`: finestra PCM e FFT deterministica.
- `src/renderer/previewRenderer.ts`: presenta il composito e aggiunge soltanto
  guide/controlli editor non esportabili.
- `src/main/export/offlineSceneCompositor.ts`: backend Canvas Skia
  `@napi-rs/canvas` 1.0.3.
- `src/main/projectm/projectMExportRenderer.ts`: clock, PCM, host projectM,
  sequenza preset, frame e metriche.
- `src/main/exportService.ts`: preflight disco, FFmpeg, cancellazione e pulizia.

## Determinismo

- timestamp frame: `frameIndex / fps`;
- PCM per frame: quantità intera a 48 kHz per 30/60 FPS;
- sequenza preset: `buildPresetSequence` condivisa e seed serializzato;
- particelle: PRNG con seed serializzato;
- intervalli: valutati sul timestamp frame;
- transizioni: soft-cut projectM con gli stessi eventi temporali.

La casualità interna di preset MilkDrop non esposta dall'API projectM non può
essere forzata da un seed applicativo. L'ordine e i tempi dei preset restano
deterministici; non si promette identità bit-a-bit fra due processi projectM
indipendenti che usano casualità interna.

## Memoria e backpressure

Il decoder PCM è limitato a quattro blocchi. La scrittura del frame attende
`drain` prima di proseguire: non esiste una coda di framebuffer. Il buffer RGBA
di conversione projectM è riutilizzato; `ImageData` viene creato dopo il fill
perché il backend nativo copia i pixel nel costruttore.

Il test 30 FPS ha trasferito 14.929.920.000 byte RGBA senza file raw
temporanei. Il picco del processo compositor è stato circa 198 MB RSS; il
processo FFmpeg ha raggiunto circa 1,05 GB di memoria privata.

## Errori e lifecycle

- projectM vive in un host C++ separato;
- un preset fallito mantiene il frame valido e produce warning;
- encoder chiuso o pipe rotta interrompono l'export senza crash applicativo;
- annullamento chiude decoder, encoder e host;
- l'output parziale è rimosso su annullamento o errore;
- spazio insufficiente è controllato prima dell'avvio e intercettato durante
  la codifica.

## Packaging

Setup e Portable includono:

- projectM 4.1.6 e host x64;
- FFmpeg;
- `@napi-rs/canvas` 1.0.3;
- `skia.win32-x64-msvc.node` e `icudtl.dat`;
- licenze e manifest runtime.

I moduli nativi Canvas e FFmpeg sono `asarUnpack`; non servono Node.js,
Visual Studio o installazioni esterne sul computer finale.
