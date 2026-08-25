# Analisi decoder anteprima video

Data: 1 agosto 2026.

## Percorso effettivo

1. il main process valida un file locale regolare e non symlink;
2. FFmpeg ispeziona stream, contenitore, codec, durata, dimensioni e FPS;
3. la matrice di compatibilità decide se Chromium può decodificare la
   combinazione;
4. il preload legge il file e restituisce byte e MIME;
5. il renderer crea un Blob e un object URL locale;
6. un `HTMLVideoElement` muted e `playsInline` carica il media;
7. vengono attesi `loadedmetadata` e `loadeddata`, con timeout di 12 secondi;
8. `requestVideoFrameCallback` verifica il primo fotogramma, con timeout di
   8 secondi;
9. il frame video viene passato direttamente al compositor Canvas 2D;
10. le callback successive invalidano la superficie durante Play.

Il resolver legge `videoWidth/videoHeight`, non gli attributi HTML
`width/height` che possono essere zero su un elemento non montato. Questa
distinzione evita che la sorgente venga interpretata come una texture 1×1.

Non è presente un'immagine statica sostitutiva.

## Matrice verificata

| Contenitore | Codec video | Esito preview |
|---|---|---|
| MP4 | H.264 | supportato |
| M4V | H.264 | supportato |
| MOV | H.264 | supportato |
| WebM | VP8/VP9/AV1 | supportato |
| MP4 | MPEG-4 Part 2 | rifiutato con diagnostica |
| MKV | variabile | non dichiarato nella UI semplice |

L'esito riguarda la build Chromium/Electron corrente. Il contenitore da solo
non garantisce compatibilità.

## Sincronizzazione

Il timestamp di riferimento è `AudioEngine.currentTime`. Con Loop il tempo
video è il modulo della durata. Con Freeze è limitato a
`duration - 0.001`. Con Black il video viene nascosto e il compositor riempie
intenzionalmente l'area trasformata di nero. Seek marca il canvas dirty al
relativo evento `seeked`.

## Errori e cleanup

Gli errori includono MIME, contenitore, codec e fase (`loadeddata` o primo
frame). La rimozione esegue pausa, annulla la frame callback, rimuove `src`,
chiama `load()` e revoca l'object URL.
