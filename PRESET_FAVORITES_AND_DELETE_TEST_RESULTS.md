# Risultati test preferiti, rimozione preset e selezione layer

Data: 31 luglio 2026.

## Test runtime Libreria preset

Ambiente: build di sviluppo Electron 37, profilo isolato, projectM 4.1.6 reale.

| Verifica | Esito |
|---|---:|
| Import singolo | 1/1 |
| Import multiplo | 10/10 |
| Cartella ricorsiva | 6 validi, 1 corrotto segnalato |
| ZIP con texture | 1/1 |
| Cartella esterna collegata | 100/100 |
| Duplicato SHA-256 | rilevato |
| Catalogo prima della rimozione | 119 validi |
| Ricerca `Runtime-050` | 1 risultato corretto |
| Scroll elenco | 118 elementi, ultimo raggiunto |
| Preferito e filtro | superati |
| Rimozione singola con conferma | superata |
| File esterno dopo rimozione | conservato |
| Catalogo dopo riavvio | 118 validi |
| Preferito dopo riavvio | conservato |
| Preset rimosso dopo riavvio | assente |
| Play e framebuffer projectM | superati |
| Export projectM | 45/45 frame, 0 neri, 0 duplicati |

Report:

- `test-results/preset-layer-ui-current/dev2-import-report.json`;
- `test-results/preset-layer-ui-current/dev2-restart-report.json`;
- `test-results/preset-layer-ui-current/library-export2.mp4`.

## Test runtime layer

Il test ha esercitato una cover, dieci effetti Canvas, projectM, titolo e
artista. `Titolo` e `Artista` sono stati selezionati dai rispettivi pulsanti e
trasformati separatamente.

Risultati principali:

- 46/46 controlli registrati e collegati;
- selezione Immagine: superata;
- selezione Effetto: superata;
- selezione Titolo: superata;
- selezione Artista: superata;
- drag/resize/rotazione indipendenti Titolo: superati;
- drag/resize/rotazione indipendenti Artista: superati;
- priorità Effetto sotto testi sovrapposti: superata;
- save/reopen: superato;
- export MP4: superato.

Report e artefatti:

- `test-results/preset-layer-ui-current/simple-layer-report9.json`;
- `test-results/preset-layer-ui-current/simple-layer-ui9.png`;
- `test-results/preset-layer-ui-current/simple-layer-export9.mp4`.

## Test automatici

Suite completa:

- totali: 267;
- superati: 265;
- falliti: 0;
- ignorati: 2, per privilegio symlink Windows non disponibile.

Test mirati successivi sull'aggiunta e rimozione del flag preferito e sulla UI:
39 totali, 38 superati, 0 falliti, 1 ignorato per symlink.

## Limiti

Le interazioni runtime sono state pilotate sulla finestra Electron reale.
Non è stato eseguito un test di usabilità con una persona indipendente. Nessuna
funzione della Fase 4 è stata introdotta.

