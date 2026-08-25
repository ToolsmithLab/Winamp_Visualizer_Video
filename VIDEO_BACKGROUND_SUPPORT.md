# Supporto Sfondo immagine e video

La UI semplice dispone di un solo layer `Sfondo`. Può contenere un'immagine
oppure una clip video, mai entrambe contemporaneamente.

## Immagine

Formati: PNG, JPEG e WebP. Sono disponibili Adatta, Riempi, Dimensione
originale, posizione, scala, rotazione e opacità.

## Video

La UI propone MP4, M4V, MOV e WebM con codec compatibile. La compatibilità
viene verificata sullo stream reale prima di confermare il caricamento.

Il primo frame appare prima del Play. Il pulsante Layer diventa `Video` e
consente selezione, drag, resize, rotazione, Centra, Adatta e Ripristina.

Se si usa audio esterno, la clip può essere ripetuta, fermata sull'ultimo
frame oppure sostituita intenzionalmente da nero dopo la fine. Preview ed
export utilizzano gli stessi calcoli di fit, crop, offset e trasformazione.

Per dettagli tecnici e risultati:

- `VIDEO_LAYER_INTEGRATION_FIX.md`;
- `VIDEO_PREVIEW_DECODER_ANALYSIS.md`;
- `VIDEO_LAYER_TEST_RESULTS.md`.
