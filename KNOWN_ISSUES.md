# Problemi noti

Aggiornato il 31 luglio 2026.

## Progresso esportazione

Il precedente stato fisso a `0%` è corretto. Non era possibile distinguere un
job lento da un blocco perché il servizio inviava zero durante tutto il ciclo
frame-by-frame. La UI mostra ora fase, frame, tempo, frame/s ed ETA e il main
process applica timeout distinti a projectM, preset, IPC, framebuffer, FFmpeg,
primo PCM, primo frame e apertura output.

Il logger persistente non scrive più su `stdout`: questo elimina il crash
`EPIPE: broken pipe, write` riprodotto durante l'audit.

Il test completo corrente è stato eseguito a 180×320/30 FPS. Verifica la
pipeline e il comportamento del progresso, non sostituisce la qualifica
prestazionale 1080×1920 descritta più avanti.

## Cover

Il flusso tecnico completo è verificato automaticamente, inclusi i gesti
reali sul canvas, l'export MP4 e le build Portable/Setup. Resta da eseguire
con una persona che non conosce il programma la misura di usabilità richiesta
entro tre minuti; un test automatizzato non può certificare la comprensibilità
umana.

`Riempi` può ritagliare visivamente i bordi per rispettare il rapporto
dell'area, ma non altera il file sorgente. `Stira` può deformare
intenzionalmente l'immagine.

## Interfaccia semplice

Il flusso tecnico end-to-end è superato in sviluppo, Portable esterna e Setup:
56/56 controlli sono collegati e non risultano pulsanti placebo. I dieci
effetti Canvas, projectM, Play, drag, persistenza ed export MP4 sono stati
esercitati sulla build reale.

Il precedente ordine errato degli effetti, lo sfondo nero projectM, le bande
uniformi da framebuffer non inizializzato e il menu Preset MilkDrop tagliato
sono corretti. Canvas e projectM sono ora superfici alpha trasformabili nel
compositor condiviso da preview ed export.

Resta non eseguito il test manuale da parte di una persona indipendente senza
README. Gli eventi mouse automatizzati e l'ispezione dello screenshot
dimostrano il funzionamento, ma non certificano da soli la comprensibilità
umana dell'interfaccia.

Quando più elementi si sovrappongono, il pannello fisso `Layer` a destra
permette di scegliere esplicitamente Immagine, Effetto, Titolo o Artista.
Titolo e Artista sono selezionabili singolarmente. Con `Blocca selezione sul
layer attivo`, abilitato per default, il click sul canvas non cambia layer e
drag, resize e rotazione restano indirizzati alla selezione esplicita.

Lo stage mantiene il rapporto 9:16, 1:1, 4:3 o 16:9, mentre lo zoom è soltanto
editoriale. Waveform e playbar sono esterne al frame. L'audit visuale e i test
runtime sono superati; resta non eseguita una sessione di usabilità con una
persona indipendente.

## Libreria MilkDrop nella UI semplice

Ricerca, filtro Preferiti, filtro Cartella corrente, toggle preferito e
rimozione del singolo preset sono collegati al catalogo persistente reale. Per
le cartelle esterne la rimozione interessa soltanto il catalogo: il file sul
disco non viene cancellato.

## IPC projectM

Il precedente errore `Pacchetto IPC projectM non valido` è stato corretto.
La causa era l'interleaving tra header e payload prodotti da richieste
concorrenti durante la backpressure della pipe Windows. Il writer ora
serializza l'intero pacchetto logico e il parser mantiene stato persistente
fra i chunk.

La correzione è stata verificata con 33 test di framing, 100.000 render reali,
un playback di 600,750 secondi e un export di 18.000 frame. Nessun errore
IPC/pipe è presente nei log definitivi.

## Runner grafico isolato

Gli avvii Electron dentro il runner grafico sandboxato hanno mostrato un
processo GPU terminato con `0xC0000135`, seguito dal breakpoint Chromium
`0x80000003`. Il test definitivo della medesima build, avviata fuori da quel
runner, ha completato playback ed export senza crash. Questo è un limite
dell'ambiente di test isolato, non un errore riprodotto nella build distribuita.

## Prestazioni e determinismo

- Il profilo 1080×1920/60 FPS a piena durata non è qualificato; il profilo
  verificato resta 1080×1920/30 FPS.
- La riproducibilità bit-per-bit fra GPU o driver differenti non è qualificata.
- Il CDP non espone direttamente `process.memoryUsage().external` del main
  process durante playback; working set, private bytes, heap, handle, thread,
  CPU, GPU e latenza sono stati comunque misurati.

## projectM

- La DLL è una build modificata di projectM 4.1.6 e richiede il protocollo host
  v2.
- Una DLL upstream senza `projectm_create_with_seed` viene rifiutata con un
  errore esplicito.

## Test Windows

Due test symlink sono ignorati quando manca il privilegio Windows necessario.
Non equivalgono a test superati. Setup e Portable sono stati provati con
profili isolati sulla macchina corrente, non in una VM Windows pulita.

## Licenze

La verifica di projectM, preset, FFmpeg e OpenH264 è tecnica e documentale e
non costituisce parere legale. La licenza principale del repository projectM
non dimostra in assoluto la titolarità di ogni contributo storico. Gli aspetti
brevettuali H.264 e la distribuzione pubblica richiedono revisione legale.

## Banda inferiore export projectM

La fascia scura causata dal framebuffer 0 non inizializzato in modo esplicito
e dal campionamento della scanline esterna projectM è corretta. Preview ed
export usano lo stesso resolver di layout; viewport, scissor, stride, byte,
alpha e righe finali sono verificati a runtime.

Sono superati gli export 9:16, 1:1, 4:3 e 16:9, inclusi cover, projectM,
combinazione cover/projectM, effetto ridimensionato e cambio preset. Il gate
reale 720×1280/30 FPS non mostra bande inferiori. Non risultano problemi
residui noti relativi a questa correzione.

## Layer Video

La clip video è ora un layer Sfondo reale, selezionabile e trasformabile.
MP4/M4V/MOV H.264 e WebM con codec Chromium compatibile sono verificati prima
del caricamento. MKV non è dichiarato come supportato nella UI semplice.

Il benchmark completo 1080×1920/30 FPS da 4:13 ha richiesto 1.091 secondi
(6,96 frame/s). Il profilo 60 FPS non è qualificato. Nel runner isolato il
dispositivo audio può restituire `AUDIO_RENDERER_ERROR`; Play ora termina
l'attesa dopo 5 secondi e mostra l'errore invece di rimanere sospeso.

La prova manuale con persona indipendente e il profilo 1080×1920/60 FPS
restano non eseguiti.
