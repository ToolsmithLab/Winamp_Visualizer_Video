# Risultati test framing IPC projectM

Data: 30 luglio 2026  
Sistema: Windows x64, projectM 4.1.6, protocollo 2.

## Test automatici framing

Risultato: **33/33 superati, 0 falliti, 0 saltati**.

Copertura:

1. header byte-per-byte;
2. payload frammentato;
3. due e più pacchetti nello stesso chunk;
4. dieci pacchetti concatenati;
5. chunk a metà del secondo pacchetto;
6. EOF pulito;
7. EOF dopo header parziale;
8. EOF dopo payload parziale;
9. magic errato;
10. versione errata;
11. command ID errato;
12. payload oltre limite;
13. bit di segno/overflow simulato;
14. request ID sconosciuto;
15. risposta tardiva dopo dispose;
16. render concorrenti;
17. resize durante render;
18. reset/seek durante render;
19. transizione durante render;
20. shutdown con render pendente;
21. 10.000 pacchetti consecutivi;
22. fuzz deterministico;
23. frame metadata/stride/dimensioni corrotti;
24. backpressure e close;
25. riavvio host.

## Stress IPC reale

Report:
`test-results/projectm-ipc-framing/projectm-ipc-stress-100000-final.json`.

- render completati: 100.000/100.000;
- durata: 180,197 s;
- resize: 13;
- reset-seek: 13;
- pause/ripresa: 39;
- soft transition/cambi preset: 40;
- lock/unlock: 40;
- riavvii host: 3;
- frame nulli: 0;
- errori IPC/pipe: 0;
- rejection non gestite: 0;
- richieste pendenti finali: 0;
- host allegato finale: no;
- RSS finale: 42.160.128 B;
- processi residui: 0.

## Soak finale definitivo

Report:
`test-results/projectm-ipc-framing/soak-final/soak-summary-final.json`.

- playback: 600,750 s;
- projectM: 4.1.6 reale;
- preset: 10;
- plugin Canvas: 10 visibili;
- keyframe: 34;
- Preset di progetto: applicato;
- relink audio: hash corrispondente;
- pausa/ripresa, seek 240 s, seek 120 s, preset-next: superati;
- crash/errori/dropped frame: 0/0/0;
- latenza media/massima: 11,662/46,836 ms;
- working set: 1.070.206.976 → 1.151.578.112 B, picco
  1.221.394.432 B, non monotono;
- private bytes: 1.116.815.360 → 1.108.680.704 B, non monotoni;
- handle: 3.046 → 2.974, non monotoni;
- thread: 186 → 165, non monotoni;
- GPU picco: 24,480%;
- export: 18.000 frame, 600 s;
- neri/duplicati/cambi falliti: 0/0/0;
- temporanei: 0;
- MP4 SHA-256:
  `EB0DEA9AB102A7482263CCBEB2772888FFA75C5268A5A8E6D7BE68580B0F940F`;
- processi residui: 0.

Lo stderr definitivo non contiene `Pacchetto IPC projectM non valido`,
errori pipe, rejection, `FATAL` o errori handler.

## Determinismo e regressione

- probe 1 frame:
  `00B45961B7AD86218679E5E5E7637AA7D88773BA83B8E5D77FFF8544088C6F72`;
- probe 180 frame:
  `D95891F752176D031F977B1015F6AE24BA4330B5E0230025911E546938996918`;
- probe 1.800 frame:
  `FBC209E6D105A39AF078833DA086CFA8E8447F28CEFDF298F99B6FC4AB9302A0`;
- mismatch fra le due esecuzioni di ogni probe: 0;
- due export indipendenti 60 s/1.800 frame:
  `D3105F26EA90D5004DDAB69D22ABCF9E6759891DE46F57E044AE7EFDA8BFFB06`;
- golden M1/M2: invariati;
- M1–M4 mirati: 91 totali, 90 pass, 0 fail, 1 skip symlink;
- catalogo: 37/37 validi;
- preset reali: 10/10 caricati, PCM accettato, transizioni ed export;
- cambi manuali/automatici: 100/100 superati nella suite;
- suite definitiva: 200 totali, 198 pass, 0 fail, 2 skip symlink;
- durata suite: 31,976 s.

## Packaging definitivo

- Portable:
  `F0EDC969B2BA10C12BF1A5428FBF37E7038D660123C6B15C4137940C0B40FB43`;
- Setup:
  `0928214383E34BE8139ACFF60353613A7DBF1DBC49824028C50D61B0ED541627`;
- host:
  `B69413DD20D48DA2D8A3EF9C94755CB6F1C4A651D09D9DB3D4AB26C5974CD565`;
- DLL:
  `E7337EC4FE54C00AF622069945A2911837512B7DCFEDB19032200683453524DF`;
- JS host nell’ASAR:
  `2F8D24E3A1CE67040D2CD9B07F790402EF5FE1A0F6A9829640F21A68E63367DA`;
- JS protocollo nell’ASAR:
  `F1D9107C4D4D61B0BF9F913F4B6449F6B2386E57E40EA5403D285C7C76085707`.

L’ASAR contiene esattamente gli stessi byte JS di `dist`. Portable avviata
da percorso Unicode e host caricato dal payload estratto. Setup installato e
avviato da percorso Unicode, host caricato, disinstallazione codice 0,
directory rimossa. Processi residui finali: 0.

