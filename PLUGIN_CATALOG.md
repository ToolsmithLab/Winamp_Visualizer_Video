# Catalogo plugin Canvas integrati — Fase 3 M2

Aggiornato il 29 luglio 2026. Il registro contiene esattamente dieci plugin
Canvas fidati, nell'ordine stabile seguente. projectM è un motore separato e
non è presente nel catalogo.

| # | ID persistito | Nome | Categoria | Versione |
|---:|---|---|---|---|
| 1 | `spectrumBars` | Spectrum Bars | spectrum | 1.0.0 |
| 2 | `circularSpectrum` | Circular Spectrum | spectrum | 1.0.0 |
| 3 | `waveformLine` | Waveform Line | waveform | 1.0.0 |
| 4 | `particleBurst` | Particle Burst | particles | 1.0.0 |
| 5 | `pulseShapes` | Pulse Shapes | geometry | 1.0.0 |
| 6 | `dynamicVignette` | Dynamic Vignette | effect | 1.0.0 |
| 7 | `radialRays` | Radial Rays | spectrum | 1.0.0 |
| 8 | `mirroredWaveform` | Mirrored Waveform | waveform | 1.0.0 |
| 9 | `audioGrid` | Audio Grid | geometry | 1.0.0 |
| 10 | `orbitingParticles` | Orbiting Particles | particles | 1.0.0 |

## Sei plugin migrati

Spectrum Bars, Circular Spectrum, Waveform Line, Particle Burst, Pulse Shapes
e Dynamic Vignette conservano ID, default, seed, ordine e raster della baseline
M1. I parametri comuni sono banda, sensibilità, smoothing, intensità e colore.
Particle Burst usa una factory per layer e non un singleton.

## Radial Rays

Raggi radiali pilotati dallo spettro. Parametri: numero raggi (8–256),
lunghezza, spessore, rotazione, sensibilità, colore iniziale/finale, smoothing,
simmetria e rotazione animata. Il limite massimo è 256 raggi.

## Mirrored Waveform

Due forme d'onda speculari pilotate dal waveform PCM. Parametri: orientamento,
spessore, ampiezza, smoothing, separazione, colore, glow limitato e modalità
`fill`/`line`.

## Audio Grid

Griglia audio-reattiva. Parametri: righe e colonne (2–32), spacing,
sensibilità, smoothing, dimensione minima/massima, colore basso/alto, sorgente
`spectrum`/`amplitude`/`bands` e forma `square`/`rounded`/`circle`. Il limite è
32×32 celle.

## Orbiting Particles

Particelle orbitanti guidate da bassi, medi e alti. Parametri: conteggio
(8–256), raggio, velocità, dimensione, dispersione, tre risposte di banda,
colore, trail (0–6) e seed. Il PRNG è un hash deterministico del seed progetto,
ID layer e seed impostazione. Il trail è geometrico e non usa blur costosi.

## Vincoli comuni

Tutti i plugin:

- reagiscono a snapshot audio reali;
- sono deterministici e serializzabili;
- supportano istanze indipendenti, seek, reset e resize;
- vengono renderizzati dallo stesso compositor in preview ed export;
- non usano mock, immagini preregistrate, `Math.random`, DOM o clock reale.
