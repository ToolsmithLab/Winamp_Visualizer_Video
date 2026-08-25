# Rapporto finale Fase 3

Data: 30 luglio 2026

La Fase 3 è completata sul piano tecnico e pronta per revisione umana. Il solo
bloccante runtime, `Pacchetto IPC projectM non valido`, è stato ricondotto alla
mancanza di serializzazione packet-level del writer Node e corretto senza
modificare projectM, seed, determinismo, fixture o golden.

Il parser della pipe mantiene stato persistente per connessione, ricompone
header/payload parziali, consuma pacchetti concatenati, valida protocollo e
framebuffer e distingue EOF pulito da truncation. Shutdown blocca nuove
richieste e settle/timer/listener vengono chiusi una sola volta.

Verifica definitiva:

- 33/33 test framing;
- 100.000/100.000 render stress, 0 errori/rejection/pending;
- 600,750 s playback, 0 crash/errori/dropped;
- 18.000 frame export, 0 neri/duplicati/cambi falliti;
- 0 file temporanei e 0 processi residui;
- determinismo 1/180/1.800 e due export byte-identici;
- suite 200: 198 pass, 0 fail, 2 skip;
- golden M1/M2 invariati;
- catalogo 37/37 e 10 preset reali;
- Portable e Setup definitivi verificati.

Artefatti:

- Portable:
  `F0EDC969B2BA10C12BF1A5428FBF37E7038D660123C6B15C4137940C0B40FB43`;
- Setup:
  `0928214383E34BE8139ACFF60353613A7DBF1DBC49824028C50D61B0ED541627`;
- host:
  `B69413DD20D48DA2D8A3EF9C94755CB6F1C4A651D09D9DB3D4AB26C5974CD565`;
- DLL:
  `E7337EC4FE54C00AF622069945A2911837512B7DCFEDB19032200683453524DF`.

La Fase 4 non è stata iniziata.

## Addendum gestione Cover — 30 luglio 2026

La cover è ora parte del flusso principale e non di una sezione avanzata.
Caricamento, preview immediata, selezione, trasformazioni, quattro modalità di
adattamento, azioni rapide, ordine layer, undo/redo e persistenza sono
implementati.

Il compositing cover usa lo stesso `SceneCompositor` per anteprima ed export.
Un MP4 H.264/AAC con cover, effetto Canvas e testi è stato generato e
decodificato correttamente.

- suite aggiornata: 224 totali, 222 pass, 0 fail, 2 skip;
- test Cover dedicati: 24/24;
- sviluppo, Portable e Setup: workflow runtime superato;
- Setup aggiornato:
  `220C3E4091EDA889CC6F55AB1F7D6B83F63F393E8F4498A26F839FC7CFA52138`;
- Portable aggiornata:
  `6D7B5A2B919D378B2AF0EBC3EB23DF13FD100E767B17601C8F83F78933458EFF`.

Resta da registrare la prova di comprensibilità entro tre minuti con una
persona che non conosce il programma; l'automazione non viene usata come
sostituto di questo gate umano.
