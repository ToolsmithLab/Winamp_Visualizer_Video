# Correzione framing IPC projectM

Data: 30 luglio 2026

## Writer atomico a livello di pacchetto

`ProjectMPacketWriter` mantiene una coda Promise per connessione. Header e
payload restano buffer distinti, evitando una copia del PCM, ma la richiesta
successiva non può iniziare finché tutti i frammenti della precedente non
sono stati consegnati alla pipe e l’eventuale `drain` non è terminato.

La coda:

- preserva ordine e confini logici;
- gestisce `drain`, `close` ed `error`;
- conta i pacchetti completati;
- rigetta la scrittura una sola volta;
- non lascia listener di backpressure dopo resolve/reject.

## Parser persistente

`ProjectMPacketParser` mantiene per tutta la connessione:

- buffer header da 24 byte e offset;
- payload corrente e offset;
- tipo e request ID correnti;
- contatore pacchetti;
- stato `failed`/`finished`;
- header decodificato per diagnostica.

Ogni `push()` può restituire zero, uno o più pacchetti. Un pacchetto viene
emesso solo quando header e intero payload sono disponibili.

Sono validati:

- magic e protocollo 2;
- tipo risposta;
- request ID non nullo;
- limite payload controllo/frame;
- metadata framebuffer;
- dimensioni massime 8192×8192;
- coerenza fra header e metadata;
- stride e dimensione pixel con aritmetica `BigInt`;
- EOF pulito, header troncato e payload troncato.

## Lifecycle e shutdown

- nuove richieste sono bloccate appena inizia shutdown;
- il comando shutdown è accodato dopo le scritture già iniziate;
- tutte le richieste pendenti hanno un solo timer e un solo settle;
- `failAll()` cancella ogni timer;
- EOF senza byte parziali è pulito;
- EOF con header/payload parziale è `TRUNCATED_PACKET`;
- risposte tardive o request ID sconosciuti sono diagnosticate e non
  risolvono Promise inesistenti;
- host chiuso o pipe fallita rigettano le richieste e terminano il figlio;
- parser e writer vengono ricreati a ogni riavvio host.

## Diagnostica

I log `[projectM IPC]` includono:

- ragione e tipo errore;
- byte header/payload disponibili e attesi;
- header decodificato;
- command/request ID;
- request ID pendenti;
- ultimo response ID valido;
- ultimi otto comandi con sole dimensioni;
- stato host, PID e fase shutdown;
- contatore writer.

PCM, framebuffer e contenuto dei preset non vengono registrati.

## File applicativi modificati

- `src/main/projectm/projectMProtocol.ts`;
- `src/main/projectm/projectMHostService.ts`.

## Test e harness

- `tests/projectm-ipc-framing.test.cjs`;
- `tests/projectm-runtime.test.cjs`;
- `scripts/projectm-ipc-stress.cjs`;
- `scripts/launch-electron-runtime.ps1`.

Il protocollo seed e il codice C++ non sono stati modificati.

