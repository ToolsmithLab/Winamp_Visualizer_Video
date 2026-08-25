# Risultati gate runtime finali Fase 3

Data: 30 luglio 2026  
Build: Audio Visualizer Studio 0.2.0, Windows x64.

## Esito

Il bloccante `Pacchetto IPC projectM non valido` è stato corretto e il gate è
stato ripetuto da zero sul codice definitivo.

| Gate | Esito |
| --- | --- |
| projectM 4.1.6 reale / protocollo 2 | Superato |
| framing automatico | 33/33 |
| stress IPC | 100.000/100.000 render |
| playback | 600,750 s |
| export | 18.000/18.000 frame |
| errori IPC/pipe/rejection | 0/0/0 |
| neri/duplicati/cambi falliti | 0/0/0 |
| temporanei/processi residui | 0/0 |
| determinismo 1/180/1.800 | Superato |
| due export indipendenti | Byte-identici |
| suite | 198 pass, 0 fail, 2 skip |
| Portable/Setup | Superati |
| Fase 4 | Non iniziata |

## Causa e correzione

Il writer Node poteva sospendersi su `drain` fra header e payload senza
riservare la pipe al pacchetto corrente. Un comando concorrente poteva
intercalarsi e desincronizzare il reader nativo. È stata introdotta una coda
per connessione che serializza l’intero pacchetto logico. Il parser persistente
ora valida EOF, tipi, request ID, limiti, framebuffer e overflow, e produce
diagnostica senza dati PCM/frame.

Dettagli:

- `PROJECTM_IPC_FRAMING_ANALYSIS.md`;
- `PROJECTM_IPC_FRAMING_FIX.md`;
- `PROJECTM_IPC_FRAMING_TEST_RESULTS.md`.

## Soak definitivo

- 10 preset reali, 10 plugin Canvas visibili, 34 keyframe;
- Preset di progetto applicato e audio ricollegato con hash identico;
- pausa/ripresa, due seek e cambio preset;
- latenza media/massima projectM: 11,662/46,836 ms;
- working set, private bytes, heap, ArrayBuffer, handle e thread non monotoni;
- handle: 3.046 → 2.974; thread: 186 → 165;
- GPU picco: 24,480%;
- export OpenH264/AAC: 600 s, 18.000 frame;
- MP4:
  `EB0DEA9AB102A7482263CCBEB2772888FFA75C5268A5A8E6D7BE68580B0F940F`.

Lo stderr definitivo non contiene il vecchio errore, errori pipe, rejection,
`FATAL` o errori handler.

## Packaging

| Componente | SHA-256 |
| --- | --- |
| Portable | `F0EDC969B2BA10C12BF1A5428FBF37E7038D660123C6B15C4137940C0B40FB43` |
| Setup | `0928214383E34BE8139ACFF60353613A7DBF1DBC49824028C50D61B0ED541627` |
| projectm-host.exe | `B69413DD20D48DA2D8A3EF9C94755CB6F1C4A651D09D9DB3D4AB26C5974CD565` |
| projectM-4.dll | `E7337EC4FE54C00AF622069945A2911837512B7DCFEDB19032200683453524DF` |

Portable avviata da un percorso Unicode e projectM caricato dal payload
estratto. Setup installato/avviato in percorso Unicode e disinstallato con
codice 0. Directory temporanee create dal test eliminate; processi residui 0.

## Nota runner GUI

Tre avvii diagnostici effettuati nel sandbox del terminale hanno mostrato un
`FATAL` del processo GPU (`0xC0000135`, seguito da breakpoint `0x80000003`).
L’avvio GUI autorizzato fuori sandbox è risultato stabile e ha completato il
gate. Questa anomalia appartiene al sandbox del runner e non è stata conteggiata
come crash della build definitiva.

