# Risultati test Fase 3 — Milestone M3

Data: 29 luglio 2026. Perimetro T3.09–T3.11.

## Suite

- suite completa: 119 test, 118 superati, 0 falliti, 1 ignorato/non
  eseguibile (symlink Windows senza privilegio);
- suite M3: 19/19;
- M1+M2+M3 mirata: 58/58;
- build Vite/TypeScript: superata;
- coverage strumentata: non disponibile, non conteggiata come superata.

La suite M3 copre rotazioni 0/45/90/180, scala uniforme/non uniforme,
coordinate esterne, 16:9/9:16, zoom preview, maniglie, snap on/off e priorità,
interpolazioni, limiti, collisioni, seek inverso, 30/60 FPS, serializzazione,
transazione singola/Escape, tempo/pixel, zoom/scroll, snap timeline, hit-test
denso, clip, 1.000 e 10.000 keyframe.

## Runtime Electron

`scripts/phase3-m3-electron-ui-test.cjs` ha verificato nell’app reale:

- projectM 4.1.6 disponibile;
- controlli M3 presenti;
- trasformazione numerica;
- drag, resize e rotazione dalle maniglie reali;
- keyframe da inspector e marker timeline;
- zoom timeline;
- lock;
- undo/redo;
- salvataggio e riapertura.

Risultato finale: 12/12 asserzioni. Screenshot:
`test-results/phase3-m3/ui-m3-final.png`.

## Golden

Il golden M3 si trova in
`test-results/phase3-m3/m3-1080x1920-30fps-60s/`.

Contiene projectM reale, tre preset e due transizioni, dieci plugin Canvas
(11 istanze), nove overlay visibili, cover, artista, titolo, sette blend mode,
layer nascosto/lockato, intervalli, trasformazioni ruotate, keyframe per tutte
le proprietà, tutte le interpolazioni, confini e ±1 frame, seed fisso, WAV
PCM 60 s e percorso Unicode nella prova Portable.

Risultato 1080×1920/30 FPS/60 s:

- 1.800/1.800 frame;
- H.264 OpenH264 + AAC;
- 0 frame neri, 0 duplicati, 0 cambi preset falliti;
- 18 confronti su indice frame esplicito;
- PSNR minimo 35,518, MAE massimo 2,125;
- soglia fissata prima del test: PSNR ≥28;
- elapsed 623,15 s;
- compositor medio 98,70 ms, projectM medio 29,83 ms;
- CPU processo 40,87%, GPU picco 23,82%;
- RSS picco 187,30 MiB, handle picco 445.

Golden M1: invariato e superato. Golden M2: invariato e superato.

## Benchmark

Evidenza: `test-results/phase3-m3/performance.json`.

- evaluator 1.000 keyframe: media 0,0034 ms, p95 0,0041 ms;
- timeline/hit-test 1.000 keyframe: media 0,0354 ms, p95 0,0628 ms;
- hit-test trasformazione: p95 0,0032 ms;
- stress 10.000: indice 18,17 ms, evaluator p95 0,0082 ms;
- 10.000 resta dichiarato stress non supportato.

## Packaging

- Setup: 141.204.224 byte, SHA-256
  `03D9B6A2AFF83F19E01A67AB46C8406B1B2B8CFF7402F58265EF445A5C6852BE`;
- Portable: 140.974.245 byte, SHA-256
  `D3B48A16BE7FB9F0FA409B1308D41E31B7FB44F89AC4042A4C7C7194174C905F`;
- Portable avviata da
  `%TEMP%\AVS_M3_Portable_Final_Ω_20260729_1941`;
- 12/12 asserzioni, save/reopen Unicode e projectM 4.1.6;
- host, DLL projectM, FFmpeg/OpenH264 e licenze presenti;
- nessun processo residuo dopo il test.

## Non eseguibili/limiti non bloccanti

- symlink filesystem reale senza Developer Mode;
- coverage strumentata;
- installazione/disinstallazione Setup su VM pulita;
- 1080×1920/60 FPS a piena durata: non qualificato e non dichiarato stabile.

