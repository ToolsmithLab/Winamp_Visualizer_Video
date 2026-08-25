# Changelog

## 0.2.0 - 2026-07-27

### Aggiunto

- modello progetto 2.0 con migrazione automatica dai progetti 1.0;
- sistema livelli con visibilità, blocco, ordine, opacità e modalità di fusione;
- intervalli temporali dei livelli nella timeline;
- selezione e trasformazione diretta di copertina e testi;
- inspector contestuale per livello;
- Circular Spectrum, Waveform Line, Particle Burst e Pulse Shapes;
- Vignetta dinamica audio-reattiva;
- banda audio, sensibilità, smoothing, intensità e colore per visualizzatore;
- timeline multilivello con clip selezionabili;
- export aggiornato per visibilità, intervalli e trasformazioni della Fase 2.

### Verificato

- build TypeScript e Vite;
- migrazione progetto 1.0 → 2.0;
- avvio Electron senza errori runtime;
- export H.264/AAC 1080 × 1920 con durata audio/video coincidente.

## 0.1.0 - 2026-07-27

### Aggiunto

- scaffold Electron + TypeScript + Vite;
- bridge IPC con `contextIsolation`;
- importazione e decodifica MP3/WAV;
- forma d'onda e trasporto audio;
- preview verticale 9:16 con barre FFT audio-reattive;
- caricamento, drag, dimensione e opacità della copertina;
- testi artista e titolo con colori configurabili;
- salvataggio e apertura del formato `.avsproject`;
- export MP4 H.264/AAC via FFmpeg con avanzamento e annullamento;
- configurazione electron-builder per installer e portable;
- documentazione iniziale.
