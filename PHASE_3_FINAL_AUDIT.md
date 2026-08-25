# Audit finale Fase 3

Data: 30 luglio 2026  
Decisione: **Fase 3 completata e verificata**. Fase 4 non iniziata.

## Gate finali

- projectM 4.1.6 reale, protocollo 2 e seed uint64 LE: superati;
- parser/writer IPC stream-safe: superati;
- test framing: 33/33;
- stress reale: 100.000 render, 0 errori;
- soak: 600,750 s, 0 crash/errori/dropped;
- export soak: 18.000 frame, 0 neri/duplicati/cambi falliti;
- determinismo 1/180/1.800: zero mismatch;
- due export indipendenti: byte-identici;
- golden M1/M2: invariati;
- suite: 200 totali, 198 pass, 0 fail, 2 skip symlink;
- catalogo: 37/37;
- preset reali: 10/10;
- 100 cambi manuali e 100 automatici: superati;
- Portable Unicode: avvio e host projectM superati;
- Setup Unicode: installazione, avvio, host e disinstallazione superati;
- temporanei e processi residui: 0.

## Chiusura del bloccante

L’errore storico era prodotto dalla scrittura non serializzata a livello di
pacchetto sulla pipe Node→host. La coda `ProjectMPacketWriter` impedisce che
un comando concorrente si inserisca fra header e payload durante backpressure.
Il parser ora distingue EOF pulito, stream chiuso e framing corrotto.

La nuova build non ha riprodotto `Pacchetto IPC projectM non valido` in:

- 100.000 richieste render;
- 600,750 s di playback con seek/reset/transizioni;
- export 18.000 frame;
- suite e test runtime;
- Portable e Setup.

## Limiti non bloccanti

- due test symlink non sono eseguibili senza privilegio Windows;
- `external` del processo main non è esposto dal campione CDP playback;
- 1080×1920 a 60 FPS per l’intera durata non è qualificato;
- riproducibilità bit-per-bit fra GPU/driver diversi non è qualificata;
- non era disponibile una VM Windows pulita.

## Licenze

La conformità registrata resta tecnica e documentale, non un parere legale.
La licenza principale del repository projectM non dimostra in assoluto la
titolarità di ogni contributo storico.

