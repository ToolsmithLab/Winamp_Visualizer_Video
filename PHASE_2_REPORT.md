# Rapporto finale Fase 2

Data audit correttivo: 29 luglio 2026  
Versione applicazione: 0.2.0  
Ambito: esclusivamente i due difetti bloccanti e le regressioni richieste; nessuna funzione di Fase 3.

## Decisione

La Fase 2 è **completata e verificata sul sistema di audit**. I due difetti bloccanti del 28 luglio sono stati corretti e rimossi dall’elenco dei bloccanti dopo test automatici ed end-to-end reali.

## Correzione ripristino

Durante l’apertura, la selezione del preset corrente usava il percorso della selezione manuale e aggiornava `sequenceStartPresetId`, cronologia e scheduler. È stato introdotto un restore atomico:

- `isRestoringProject` blocca listener, dirty state, sincronizzazione della libreria e rebuild intermedi;
- il preset corrente viene applicato con sorgente `restore`;
- il progetto salvato viene riapplicato come snapshot immutabile dopo audio, cover e libreria;
- lo scheduler viene ricostruito una sola volta, al termine;
- seed, playlist, ordine, anchor, corrente, cronologia, marcatori, lock e transizioni restano distinti e invariati.

Il confronto Portable prima/dopo riapertura e dopo rebuild è identico per 600 secondi.

## Correzione Unicode

Il vecchio host passava un percorso narrow a una catena dipendente dalla code page Windows. La correzione usa:

- validazione JavaScript dei surrogate e codifica `Buffer` UTF-8 reversibile;
- lunghezza del protocollo calcolata sui byte UTF-8;
- `MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS)` nel parser C++;
- `GetFullPathNameW`, `CreateFileW`, `GetFileSizeEx` e `ReadFile`;
- prefisso long-path `\\?\`/`\\?\UNC\`;
- caricamento dei byte reali `.milk` tramite `projectm_load_preset_data`;
- search path texture impostato separatamente;
- manifest host `activeCodePage=UTF-8` e `longPathAware=true`.

La matrice Portable di 14 casi, incluso un percorso di 298 caratteri, passa copia, link, texture, preview, transizione, salvataggio, chiusura, riapertura, relink ed export.

## Stato regressioni

| Area | Esito |
|---|---|
| projectM reale 4.1.6, PCM e framebuffer | Superato |
| 10 preset reali | 10/10 superati |
| Catalogo verificato | 37/37 superati |
| Import e sicurezza ZIP | Superato |
| Link/relink Unicode | 14/14 superati |
| 100 cambi manuali / 100 automatici | Superato |
| Transizioni e determinismo | Superato |
| Salvataggio/riapertura reale | Superato |
| Suite automatica | 60 pass, 0 fail, 1 non eseguibile |
| Portable fuori dal workspace | Superato |
| Soak 10 minuti | Superato, 0 crash/errori |
| Export completo 600 s | 18.000 frame, H.264/AAC |
| Parità 1080×1920/30, 60 s | Superato |
| Setup/Portable | Generati |

## Prestazioni

Il benchmark 1080×1920/30 ha prodotto 1.800 frame in 367,35 s, con 0 frame neri, 0 duplicati e PSNR minimo 36,62 dB. È un profilo offline, non real-time. Il test 1080×1920/60 di 10 s è corretto ma ha richiesto 124,35 s; non viene dichiarato stabile per durata intera.

Nel soak a 600 s working set, memoria privata e handle sono inferiori ai valori iniziali. Non emerge un leak monotono nella prova.

## Build e distribuzione

Gli artefatti correnti includono host, `projectM-4.dll`, runtime MSVC, GLEW, FFmpeg shared LGPL/OpenH264, manifest e licenze. La Portable è stata eseguita da:

`C:\Users\Lorenz\AppData\Local\Temp\AVS_Blocker_Final_20260729_Ω`

Hash:

- Setup: `A1D25524479C2788F751C502A1E64A850083B1C8D359C2AF2378DF5E609C5B7B`;
- Portable: `CEBFCE69F948CA50BEAE6AADD2B6E3C0AF24A9E325732859550C368913CFB9E5`;
- host nativo: `1A5E4A48A51235096700EA631D189E9ADA5B30185DEF56455D6FB658A904AF04`.

## Licenze

La conclusione è tecnica e documentale, non un parere legale. projectM dichiara LGPL-2.1-or-later ed è collegato dinamicamente; il pacchetto catalogo usa la licenza dichiarata del repository ma ciò non prova in modo assoluto la titolarità di ogni contributo storico; FFmpeg/OpenH264 conservano testi e attribuzioni dichiarate. Rimane opportuna una revisione legale prima della distribuzione commerciale.

## Evidenze

Il riepilogo dedicato è `PHASE_2_BLOCKER_FIX_RESULTS.md`. Log, JSON, screenshot, frame e MP4 sono sotto `test-results/phase2-blocker-fixes/`.
