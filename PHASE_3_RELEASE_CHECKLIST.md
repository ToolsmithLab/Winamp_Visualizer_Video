# Checklist release Fase 3

Aggiornata il 30 luglio 2026 dopo l'integrazione del flusso Cover.

- [x] Sezione Cover primaria, preview immediata e selezione automatica.
- [x] Click, drag, resize con Shift, rotazione, Escape e Delete.
- [x] Contieni, Riempi, Stira e Originale condivisi da preview ed export.
- [x] Cover con effetti/testi, ordine layer, undo/redo e save/reopen.
- [x] Suite Cover: 24/24.
- [x] Runtime Cover in sviluppo, Portable e Setup da percorsi Unicode.
- [x] MP4 reale con cover, effetto e testi generato e decodificato.
- [x] projectM 4.1.6 reale, PCM e framebuffer BGRA.
- [x] Parser persistente: header/payload parziali, più pacchetti per chunk e
      pacchetti zero-length.
- [x] Writer serializzato per pacchetto logico, backpressure e un solo frame
      non consumato.
- [x] Chiusura ordinata: stop richieste, drain, EOF, timeout, kill di fallback.
- [x] Suite framing IPC: 33/33.
- [x] Stress IPC reale: 100.000/100.000 render, 0 errori e 0 richieste pendenti.
- [x] Suite completa: 224 totali, 222 pass, 0 fail, 2 skip symlink.
- [x] Milestone M1–M4: 91 totali, 90 pass, 0 fail, 1 skip.
- [x] Protocollo seed v2 `uint64` little-endian invariato.
- [x] Probe deterministici 1/180/1.800 frame: zero differenze.
- [x] Due export indipendenti 1080×1920/30 FPS/60 s byte-identici.
- [x] Golden M1/M2 e fixture invariati.
- [x] Catalogo 37/37 e 10 preset reali verificati.
- [x] 100 cambi manuali e 100 cambi automatici.
- [x] Playback soak definitivo: 600,750 s.
- [x] Export soak: 600 s / 18.000 frame, OpenH264/AAC.
- [x] 0 errori IPC/pipe, crash, frame persi, frame neri o duplicati.
- [x] 0 cambi preset falliti.
- [x] Memoria, handle e thread senza crescita monotona.
- [x] Portable avviata fuori workspace da percorso Unicode.
- [x] Setup installato, avviato e disinstallato da percorso Unicode.
- [x] Host projectM e DLL caricati dalle rispettive risorse distribuite.
- [x] 0 processi Electron/projectM residui.
- [x] Licenze e runtime inclusi nei pacchetti.
- [x] Fase 4 non iniziata.

Limiti non bloccanti:

- [ ] test di usabilità entro tre minuti con una persona che non conosce
      l'applicazione;
- [ ] qualifica completa 1080×1920/60 FPS a piena durata;
- [ ] riproducibilità bit-per-bit tra GPU e driver differenti;
- [ ] validazione su VM Windows completamente pulita;
- [ ] misura `external` del main process durante playback tramite metrica
      esterna dedicata.

Esito: build tecnicamente pronta per la revisione umana della Fase 3.
