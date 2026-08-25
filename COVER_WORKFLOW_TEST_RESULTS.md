# Risultati test flusso Cover

Data: 30 luglio 2026

## Esito tecnico

La cover è esposta nel flusso principale della sidebar, viene mostrata e
selezionata immediatamente dopo il caricamento e usa lo stesso
`SceneCompositor` nell'anteprima e nell'esportazione frame-by-frame.

Sono disponibili:

- caricamento con miniatura e nome file;
- visibilità on/off;
- modalità `Contieni`, `Riempi`, `Stira` e `Originale`;
- `Adatta`, `Centra`, `Ripristina` e `Rimuovi`;
- selezione con click sul canvas;
- trascinamento, ridimensionamento, rotazione e annullamento gesto con Escape;
- mantenimento proporzioni con Shift;
- eliminazione con Delete;
- posizione, scala, rotazione, opacità e blend nell'ispettore;
- ordine sopra/sotto rispetto a effetti e testi;
- undo/redo e persistenza nel progetto;
- compositing con effetti Canvas e testi nell'MP4.

Il crop di `Riempi` è applicato solo in fase di disegno: il file sorgente non
viene modificato.

## Test automatici

Suite completa:

- totali: 224;
- superati: 222;
- falliti: 0;
- ignorati: 2 test symlink per privilegio Windows;
- durata: 30,925 secondi.

La suite dedicata `tests/cover-workflow.test.cjs` contiene 24 test e copre:

- immagini quadrate, 9:16 e 16:9;
- tutte le modalità di adattamento;
- caricamento, selezione automatica, preview, mostra/nascondi;
- centra, adatta, ripristina e rimuovi;
- undo/redo e save/reopen;
- cover con effetto e ordine layer;
- export offline con i tre rapporti immagine;
- controlli UI, gesture e messaggi empty state.

## Test runtime Electron

Il test CDP usa eventi puntatore reali sul canvas e non modifica direttamente
le trasformazioni per simulare i gesti.

| Ambiente | Durata | Esito |
| --- | ---: | --- |
| sviluppo | 27,060 s | superato |
| Portable da cartella temporanea Unicode | 26,373 s | superato |
| Setup installato in cartella temporanea Unicode | 26,781 s | superato |

Controlli runtime superati:

- sezione Cover primaria e controlli visibili;
- preview immediata e selezione automatica;
- click per selezionare;
- drag;
- resize con Shift;
- rotazione;
- Escape annulla il gesto;
- tutte le modalità di adattamento;
- campi rapidi;
- ordine layer;
- cover ed effetto insieme;
- rimozione, undo e redo;
- salvataggio e riapertura.

Report:

- `test-results/cover-workflow/cover-pointer-2-report.json`;
- `test-results/cover-workflow/portable-cover-report.json`;
- `test-results/cover-workflow/setup-cover-report.json`.

## Esportazione MP4

Il test runtime automatizzato completo ha generato un MP4 H.264/AAC reale con
cover ruotata, effetto Canvas, artista e titolo:

- report: `test-results/cover-workflow/cover-export-final-report.json`;
- file: `test-results/cover-workflow/cover-export-final.mp4`;
- dimensione: 173.886 byte;
- SHA-256:
  `E73EC0CA5B885ED521BB98E5DF30211F9170A3E16EBCCC0318751C438177FBD1`;
- frame prodotti: 45;
- frame neri: 0;
- duplicati anomali: 0;
- decodifica completa video e audio con FFmpeg: superata;
- frame estratto:
  `test-results/cover-workflow/cover-export-final-frame.png`.

Il frame estratto mostra contemporaneamente cover, visualizzatore e testi.

## Build verificate

- Setup SHA-256:
  `220C3E4091EDA889CC6F55AB1F7D6B83F63F393E8F4498A26F839FC7CFA52138`;
- Portable SHA-256:
  `6D7B5A2B919D378B2AF0EBC3EB23DF13FD100E767B17601C8F83F78933458EFF`.

Entrambe includono host projectM, DLL projectM, FFmpeg e licenze. Setup è
stato installato, avviato e disinstallato; Portable è stata avviata fuori dal
workspace. Non sono rimasti processi dell'applicazione.

## Verifica di usabilità umana

Il percorso automatizzato equivalente richiede meno di 30 secondi, ma non
sostituisce il test richiesto con una persona che non conosce il programma.
Il gate umano dei tre minuti resta quindi da registrare separatamente:

1. caricare un brano;
2. caricare una cover quadrata;
3. centrarla e ridimensionarla;
4. aggiungere un effetto;
5. spostare cover o effetto;
6. premere Play;
7. esportare il video.

La parte tecnica è verificata; la misura di comprensibilità per un nuovo
utente richiede una persona reale e non viene dichiarata superata
automaticamente.
