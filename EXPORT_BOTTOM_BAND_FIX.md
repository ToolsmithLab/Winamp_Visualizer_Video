# Correzione banda inferiore export projectM

Data verifica: 31 luglio 2026.

## Causa

Le dimensioni richieste a projectM erano corrette, ma lo stato OpenGL del
target non era reso esplicito prima della pulizia. projectM può lasciare
associato un framebuffer interno: la `glClear` eseguita dall'host poteva quindi
non inizializzare il framebuffer 0 successivamente letto con `glReadPixels`.
Inoltre il compositor campionava il bordo esterno del framebuffer projectM
senza protezione; alcuni preset lasciano l'ultima scanline nera o trasparente.

Non è stato rilevato un errore sistematico nelle dimensioni o nello stride:
per ogni formato misurato il framebuffer ha esattamente
`width × height × 4` byte e stride `width × 4`.

## Correzione

- l'host associa esplicitamente il framebuffer 0 prima di ogni pulizia e
  lettura;
- viewport e scissor sono impostati a `(0, 0, outputWidth, outputHeight)`;
- color, depth e stencil mask sono ripristinate prima della pulizia completa;
- il target viene inizializzato con alpha 1 prima di ogni frame;
- il compositor usa un resolver comune per preview ed export;
- la superficie projectM usa un edge bleed di un pixel e viene ridisegnata
  sull'intera destinazione, evitando di campionare la scanline esterna;
- la cover usa lo stesso resolver per Contieni, Riempi, Stira e Originale;
- ogni frame RGBA finale viene rifiutato se byte, stride, righe scritte o alpha
  non sono validi.

## Dimensioni verificate

| Formato | Framebuffer projectM | Stride | Byte |
| --- | ---: | ---: | ---: |
| 9:16 | 270×480 | 1080 | 518400 |
| 1:1 | 360×360 | 1440 | 518400 |
| 4:3 | 480×360 | 1920 | 691200 |
| 16:9 | 480×270 | 1920 | 518400 |

Il test reale di qualità è stato ripetuto a 720×1280, 30 FPS, 300 frame:
stride 2880, 3686400 byte per frame, prima e ultima riga scritte, ultimi dieci
scanline scritti e zero pixel con alpha non valido.

## File principali

- `native/projectm-host/src/main.cpp`
- `src/engine/composition/frameLayout.ts`
- `src/engine/composition/coverLayout.ts`
- `src/engine/composition/sceneCompositor.ts`
- `src/main/export/offlineSceneCompositor.ts`
- `src/main/projectm/projectMExportRenderer.ts`
- `src/main/exportService.ts`

