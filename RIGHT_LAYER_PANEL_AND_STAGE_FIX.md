# Pannello Layer destro e stage video

Aggiornato il 31 luglio 2026.

## Correzione

La schermata semplice usa ora cinque righe distinte:

1. barra `Formato progetto` e zoom anteprima;
2. workspace con stage video centrato e pannello `Layer` a destra;
3. waveform;
4. barra Play/Stop/Esporta;
5. suggerimento contestuale.

Lo stage è l'unica area esportabile. Ha rapporto esatto, bordo permanente,
etichetta `AREA VIDEO`, margini su quattro lati e uno sfondo diverso dal
workspace. Waveform e barra di trasporto sono righe esterne al workspace e non
possono coprire il frame.

## Formato progetto

| Formato | Full HD | HD | Preview interna |
| --- | ---: | ---: | ---: |
| 9:16 | 1080×1920 | 720×1280 | 540×960 |
| 1:1 | 1080×1080 | 720×720 | 720×720 |
| 4:3 | 1440×1080 | 960×720 | 720×540 |
| 16:9 | 1920×1080 | 1280×720 | 960×540 |

La selezione aggiorna immediatamente canvas, default dell'export e preview
projectM usando i campi già presenti nello schema 6.0. Il contenuto resta nel
progetto; la cover caricata viene riadattata e centrata, mentre testi ed effetti
mantengono le coordinate normalizzate.

## Dimensionamento e zoom

Un `ResizeObserver` calcola la massima superficie che rispetta rapporto e
margini disponibili. I breakpoint riducono sidebar, stage e pannello, ma
mantengono il pannello a destra.

`Adatta allo schermo`, `100%`, `Zoom −` e `Zoom +` modificano soltanto le
dimensioni CSS dello stage. Non scrivono formato, export, trasformazioni o
coordinate persistenti.

## Cover, layer e guide

`Adatta` usa ora il 100% della superficie utile. Una cover con lo stesso
rapporto dello stage coincide con il frame senza crop e senza nascondere il
bordo CSS.

Il pannello mostra Immagine, Effetto, Titolo e Artista con stato testuale. Il
blocco selezione è attivo per default. Le guide mostrano assi centrali e safe
area soltanto nel renderer di anteprima; il compositor export non le riceve.

## Confini dell'intervento

Non sono stati modificati protocollo IPC, host projectM, sequenze
deterministiche, catalogo preset, schema progetto o motore export. Preview ed
export continuano a usare il modello di composizione condiviso esistente.

La corrispondenza del rapporto e delle coordinate è stata verificata anche con
quattro export MP4 reali di 60 secondi, uno per ciascun formato. Le schermate
preview e i frame estratti sono conservati insieme ai risultati di test.
La Fase 4 non è stata iniziata.
