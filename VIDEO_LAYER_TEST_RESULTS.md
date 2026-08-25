# Risultati test layer Video

Data esecuzione: 1 agosto 2026.

## Suite automatica

- totale repository: 346;
- superati: 344;
- falliti: 0;
- ignorati: 2 test symlink Windows privi del privilegio necessario;
- suite dedicata layer Video: 42/42;
- runtime Electron dedicato: 18 scenari superati, 1 controllo hardware audio
  ignorato per `AUDIO_RENDERER_ERROR`;
- build TypeScript main/renderer e Vite: superata.

Un test ignorato non è conteggiato come superato.

## Formati e decoder reali

- MP4 H.264 con AAC: caricato;
- MP4 H.264 muto: caricato, messaggio audio corretto;
- MOV H.264: caricato;
- WebM VP8: caricato;
- MP4 MPEG-4 Part 2: rifiutato con suggerimento H.264;
- primo frame: `readyState 4`, 1 frame presentato prima del Play.

## UI, playback e persistenza

- pulsante dinamico `Video`: presente, abilitato e selezionato;
- Immagine e Video: esclusivi;
- drag, scala X/Y, rotazione e maniglie: verificati;
- lock selezione: verificato;
- Play/pausa/ripresa/seek/Stop: verificati su clip reale 320×180;
- Loop, Freeze e Black: verificati;
- sorgente clip/esterna e waveform: verificate;
- save/reopen: percorso, codec, modalità e trasformazione conservati;
- percorso Unicode: round trip superato.

## Composizione ed export

Export reali decodificabili:

- Video + audio clip;
- Video + audio esterno;
- Video + Canvas;
- Video + projectM.

Tutti contengono un solo stream video e un solo stream audio.

## Caso reale 1080×1920

Fixture:

- clip MP4 H.264 1080×1920, 30 FPS, 8 secondi;
- WAV stereo 48 kHz, 4:13;
- formato progetto 9:16;
- modalità `Mantieni ultimo frame`;
- Canvas Spectrum Bars, titolo e artista;
- trasformazione Video persistita.

Risultati:

- primo frame immediato: sì;
- frame verificati a 1, 2, 4 e 7,2 secondi;
- seek a 1:20: ultimo frame 7,999 secondi visibile;
- Stop: frame 0;
- export: 7.590/7.590 frame;
- risoluzione: 1080×1920;
- FPS: 30;
- codec: H.264 OpenH264 + AAC;
- durata: 00:04:13.00;
- stream: 1 video + 1 audio;
- frame neri rilevati: 0;
- duplicati anomali rilevati: 0;
- tempo al primo frame export: 0,638 s;
- tempo totale export: 1.091,191 s;
- velocità media: 6,960 frame/s;
- dimensione MP4: 25.536.907 byte;
- frame decodificati e hashati a 0, 1, 80 e 252 secondi.
- confronto preview/export a 1 secondo e 540×960:
  MAE 10,500 e RMSE 21,704, entro la soglia 28 prevista per differenze
  H.264/color conversion;

Evidenze:

- `test-results/video-layer-real-case/runtime-results.json`;
- `test-results/video-layer-real-case/caso-reale-1080x1920.mp4`;
- `test-results/video-layer-real-case/preview-export-compare.json`;
- `test-results/video-layer-real-case/preview-1s.png`;
- `test-results/video-layer-real-case/export-1s-540x960.png`;
- `test-results/audio-source/runtime-results.json`.

## Packaging

- Portable autoestraente: 19 scenari runtime, 0 fallimenti;
- contenuto Portable estratto fuori dal sorgente: 19 scenari, 0 fallimenti;
- Setup installato in cartella isolata: 19 scenari, 0 fallimenti;
- export Video + audio clip, audio esterno, Canvas e projectM eseguiti in
  entrambi i pacchetti;
- disinstallazione Setup: completata;
- processi residui: 0.

Artefatti:

- Setup SHA-256:
  `AE7CA768D9AF348E6DA34F478C8BD191FD6E8AD2C49111081DC6CA7649C498F7`;
- Portable SHA-256:
  `73A13447B06F4A5B8F117FE50E0A08C229556FD9A5F282D831ED609A3DB8DDAA`.

## Residui

- il profilo 1080×1920/60 FPS non è qualificato;
- una sessione manuale con persona indipendente non è stata eseguita;
- il runner isolato non dispone sempre di un renderer audio hardware, ma il
  decoder, il clock, la waveform e gli export reali sono verificati.
