# Analisi del blocco dell'esportazione

Data audit: 31 luglio 2026.

## Causa riprodotta

Il job non era fermo nella maggior parte dei casi osservati. La pipeline stava
componendo i frame e alimentando FFmpeg, ma il callback del servizio inviava
sempre `percent: 0`. La finestra poteva quindi restare su `0%` fino al termine
di un export molto lento.

L'evidenza storica più gravosa è il benchmark 1080×1920/30 FPS da 60 secondi:
1.800 frame completati in 376.891 ms, circa 4,78 frame/s. In quella versione
la UI non distingueva la composizione dal blocco e non registrava il tempo al
primo frame.

La fase effettiva era:

- fasi 6, 8 e 10: compositing, codifica FFmpeg e scrittura dei frame;
- fase 11: aggiornamento progresso errato, sempre a zero.

C'era anche un rischio di blocco reale nelle fasi 3–10. Il job diventava
`activeJob` soltanto dopo l'attesa di inizializzazione di projectM, cover e
processi FFmpeg. Durante quelle attese il pulsante Annulla non aveva un job da
interrompere e mancavano timeout distinti.

## Tracciamento delle undici fasi

| Fase richiesta | Evento nel log |
| --- | --- |
| 1. Validazione progetto | `preparing / Validazione progetto completata` |
| 2. Caricamento audio | `loading-audio / Audio e codec verificati` |
| 3. Inizializzazione projectM | `starting-effects / Inizializzazione projectM` |
| 4. Caricamento preset | `starting-effects / Caricamento Preset MilkDrop` |
| 5. Primo framebuffer | `composing / Generazione primo framebuffer projectM` |
| 6. Compositing | `composing / Inizializzazione compositor` |
| 7. Conversione RGBA | dimensioni e byte RGBA nel primo evento frame |
| 8. Avvio FFmpeg | `encoding / FFmpeg OpenH264 avviato` |
| 9. Apertura output | `outputOpened: true` nel primo evento frame |
| 10. Primo frame | `encoding / Primo frame scritto` |
| 11. Progresso | evento per ogni frame più riepilogo temporale nel JSONL |

Ogni riga JSONL contiene timestamp ISO, millisecondi dal lancio, fase,
messaggio e dati tecnici pertinenti.

## Codec e runtime verificati

- video: H.264 tramite encoder FFmpeg `libopenh264`;
- testo UI: `H.264 OpenH264 + AAC`;
- audio: AAC;
- pixel format finale: `yuv420p`;
- FFmpeg sviluppo:
  `native/ffmpeg/win-x64/ffmpeg.exe`;
- runtime OpenH264: encoder disponibile attraverso
  `native/ffmpeg/win-x64/avcodec-61.dll`;
- projectM: host separato e `projectM-4.dll`, versione 4.1.6.

Il probe iniziale rifiuta il job se `libopenh264` o AAC non compaiono fra gli
encoder disponibili.

## Difetti ulteriori trovati durante l'audit

Il primo tentativo ha riprodotto un `EPIPE: broken pipe, write` nel main
process. Il logger scriveva contemporaneamente su JSONL e `stdout`; una pipe
del processo padre chiusa trasformava una semplice riga diagnostica in
eccezione non gestita. Il logger usa ora soltanto il file persistente e non
dipende da una console.

È stato inoltre rilevato che un preset selezionato direttamente, ma non ancora
presente nella playlist, poteva essere sostituito dal primo elemento della
playlist nell'export. Il sequencer include ora il preset corrente come evento
iniziale senza alterare la playlist salvata.

## Stato della diagnosi

La causa del `0%` è identificata e riprodotta. Le attese non limitate sono
state sostituite da timeout con messaggi specifici; i risultati runtime sono
in `EXPORT_PROGRESS_TEST_RESULTS.md`.
