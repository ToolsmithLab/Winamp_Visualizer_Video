# Analisi framing IPC projectM

Data: 30 luglio 2026  
Ambito: solo errore runtime `Pacchetto IPC projectM non valido`.

## Causa radice

Il protocollo usa due pipe Windows anonime, quindi due stream di byte senza
confini di messaggio. Il formato v2 è:

```text
header LE di 24 byte
payload di payloadLength byte
```

`ProjectMHostService.request()` scriveva header e payload con chiamate
distinte. Quando `stdin.write(header)` entrava in backpressure, il metodo
attendeva `drain` prima di accodare il payload, ma non possedeva un lock di
pacchetto. Un reset, resize, cambio preset o shutdown concorrente poteva
quindi accodare il proprio header nel mezzo del pacchetto precedente.

Il reader C++ `readExact()` ricompone correttamente letture parziali, ma non
può ricostruire un ordine già corrotto dal writer. Dopo aver consumato una
lunghezza appartenente al primo header, interpretava byte PCM o un secondo
header come payload; la lettura successiva non iniziava più su
`kInputMagic`. Il ramo nativo di rifiuto produce esattamente:

```text
Pacchetto IPC projectM non valido.
```

Questo identifica una desincronizzazione Node→host, non un errore del preset,
del seed o del framebuffer.

## Evidenza sul percorso completo

- pipe Windows: stream-based; nessuna atomicità fra due `write()`;
- buffering/backpressure: era presente un `await drain` fra header e payload;
- header: 24 byte, uint little-endian, magic `PMIN`/`PMOT`, protocollo 2;
- payload: massimo 16 MiB in ingresso e 128 MiB in uscita;
- host C++: `readExact()` e `writeExact()` gestiscono correttamente partial
  read/write;
- output C++: un solo thread scrive header, metadata e pixel in ordine;
- parser Node precedente: conservava header/payload parziali e consumava più
  pacchetti per chunk, ma non gestiva EOF, tipi sconosciuti, request ID nullo,
  coerenza/overflow framebuffer o diagnostica strutturata;
- race: `render()` limita i render a uno in volo, ma reset, resize,
  transizione, lock e shutdown possono essere concorrenti;
- shutdown precedente: accettava nuove richieste mentre iniziava la chiusura;
- endian e seed: corretti e non modificati; seed v2 resta uint64 LE;
- buffer framebuffer: non è riutilizzato dal writer Node→host e non è la
  causa;
- errore storico: il vecchio log non conteneva il dump dell’header, quindi
  non consente di identificare quale specifica coppia di comandi si sia
  intersecata. Il difetto strutturale che rendeva possibile l’intersezione è
  invece determinato e rimosso.

## Esclusioni

Non sono stati modificati projectM 4.1.6, la patch deterministica, il seed,
gli algoritmi di selezione, i golden o le fixture. Il sorgente C++ è stato
ispezionato ma non modificato perché reader e writer nativi erano già
sequenziali e completi.

## File analizzati

- `src/main/projectm/projectMHostService.ts`;
- `src/main/projectm/projectMProtocol.ts`;
- `native/projectm-host/src/main.cpp`;
- `test-results/projectm-determinism-fix/soak-final/runtime-evidence/soak-direct.stderr.log`.

