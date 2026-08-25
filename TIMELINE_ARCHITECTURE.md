# Architettura timeline minima M3

## Viewport puro

`TimelineViewport` contiene durata, larghezza, zoom e scroll temporale.
`src/engine/timeline/geometry.ts` espone:

- normalizzazione zoom/scroll;
- tempo ↔ pixel;
- clamp temporale;
- quantizzazione al frame;
- snapping;
- hit-test keyframe;
- clamp clip.

Il DOM non contiene formule temporali alternative.

## Interazione

La timeline mantiene waveform, seek, playhead, marker e intervalli e aggiunge
zoom orizzontale, scroll, traccia proprietà, keyframe e maniglie clip.

Priorità snap timeline a pari distanza: marker, clip, frame. La soglia è
convertita da pixel a secondi attraverso il viewport, quindi resta coerente
con lo zoom. Alt disattiva temporaneamente lo snap.

Il drag keyframe conserva proprietà e ID, è clampato alla clip, sostituisce
esplicitamente un keyframe in collisione e produce un solo comando. Escape
annulla l’intera transazione.

## Clip

Start/end rispettano `start < end`, durata minima `1/60 s` e durata progetto.
I keyframe esterni dopo un accorciamento restano serializzati e non vengono
persi. Preview/export li ignorano perché il layer è inattivo fuori clip.

## Accessibilità

I marker sono pulsanti con proprietà, tempo e valore nel nome accessibile.
Enter/Spazio selezionano il layer; frecce muovono il keyframe di un frame;
Delete/Backspace eliminano; inspector, precedente/successivo, zoom e scroll
offrono equivalenti numerici.

