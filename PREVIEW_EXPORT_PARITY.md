# Parità fra anteprima ed esportazione

> Documento tecnico intermedio. I benchmark OpenH264 nuovi e il limite di riproducibilità dopo riapertura sono riportati in `PHASE_2_TEST_RESULTS.md`; la Fase 2 complessiva non è chiusa.

Stato al 28 luglio 2026: **verificata per il profilo supportato
1080 × 1920 a 30 FPS**.

## Modello visivo unico

Anteprima ed export usano `SceneCompositor`, con lo stesso:

- framebuffer projectM reale;
- ordine dei livelli e intervalli timeline;
- opacità e trasformazioni;
- copertina, artista e titolo;
- sei overlay Canvas;
- analisi PCM deterministica;
- seed della sequenza preset e delle particelle;
- cambio preset e soft-cut projectM.

I blend mode disponibili nella UI (`source-over`, `screen`, `lighter`,
`multiply`, `overlay`, `lighten`, `darken`) sono esercitati dal test automatico
anche nel backend offline.

FFmpeg non ricostruisce più effetti visuali. Riceve frame RGBA già composti e
si occupa soltanto di H.264, AAC e mux MP4. Nel codice export non sono presenti
`showfreqs`, `showwaves`, `drawtext` o `filter_complex`.

## Sincronizzazione

Il frame `n` usa il timestamp esatto `n / FPS`. Un decoder FFmpeg separato
produce PCM Float32 stereo a 48 kHz in blocchi esatti da 1600 campioni a
30 FPS o 800 a 60 FPS. Lo stesso PCM:

1. alimenta projectM;
2. alimenta l'analisi FFT condivisa degli overlay;
3. determina il contenuto del frame.

L'audio originale è aperto separatamente dall'encoder e codificato AAC.
L'export usa un host projectM dedicato e non modifica playhead, seek o stato
dell'anteprima.

## Evidenza 1080 × 1920 a 30 FPS

Il progetto di riferimento contiene tre preset MilkDrop reali, due
transizioni, copertina trasformata, testi, tre overlay Canvas visibili,
opacità diverse, intervalli, layer nascosti e ordine modificato.

- durata: 60,00 s;
- frame: 1800 esatti;
- video: H.264 High, yuv420p, 30 FPS;
- audio: AAC-LC stereo 48 kHz, 255 kb/s;
- frame neri: 0;
- duplicati consecutivi rilevati: 0;
- differenza audio/video finale: entro un frame;
- PSNR sorgente composita/MP4: 37,28–40,77 dB;
- MAE massimo: 1,66 livelli su 255.

Le coppie PNG, i framebuffer projectM raw, il progetto e il rapporto JSON sono
in `test-results/phase2/parity/1080x1920-30fps-60s`.

## Profilo 60 FPS

La pipeline è stata verificata a 1080 × 1920, 60 FPS per 10 secondi:
600 frame, zero neri, zero duplicati, H.264/AAC e due transizioni. Il tempo
offline è stato 114,74 s. Non essendo stato eseguito un brano intero o un
segmento di 60 secondi, **60 FPS non è dichiarato stabile**.

## Cancellazione e spazio disco

La pipe applica backpressure e mantiene un solo frame in consegna. Non viene
creato un file raw temporaneo. L'annullamento Electron reale termina decoder,
encoder e host, elimina l'MP4 parziale e non lascia processi residui. Prima
dell'avvio viene controllato uno spazio libero conservativo; `ENOSPC` viene
tradotto in un errore comprensibile e l'output incompleto viene eliminato.
