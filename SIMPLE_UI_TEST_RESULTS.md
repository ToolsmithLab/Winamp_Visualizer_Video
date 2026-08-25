# Risultati test interfaccia semplice

Aggiornato il 30 luglio 2026.

## Risultato complessivo

- suite completa: 250 test;
- superati: 248;
- falliti: 0;
- ignorati: 2, entrambi per privilegio symlink Windows non disponibile;
- durata: 36,059 secondi;
- audit controlli: 31/31 collegati, 0 visibili senza handler.

## Scenario runtime completo

Lo scenario usa Electron reale, un WAV PCM reale, projectM 4.1.6 e input mouse
e tastiera inviati al canvas. È passato in sviluppo, nella Portable copiata in
`%TEMP%` e nel Setup installato in una directory temporanea.

Sono stati verificati:

- caricamento, drag, resize e rotazione della cover;
- caricamento audio, Play, pausa, ripresa, Stop e seek;
- titolo e artista indipendenti;
- tutti i dieci effetti Canvas;
- ordine cover → effetto → titolo → artista;
- selezione, drag, resize Shift, rotazione, Escape, frecce e Delete effetto;
- opacità e intensità separate;
- Centra, Adatta, Ripristina e Rimuovi;
- projectM reale, PCM, framebuffer, trasparenza del nero e blend `screen`;
- trasformazione e reset del layer projectM;
- menu Preset MilkDrop da 5, 37 e 137 elementi;
- save/reopen;
- export MP4 con cover, effetto e testi.

| Build | Avvio | Durata scenario | Esito |
|---|---|---:|---|
| sviluppo | workspace | 6,355 s | superato |
| Portable | `%TEMP%`, fuori workspace | 40,512 s | superato |
| Setup | installazione isolata in `%TEMP%` | 50,005 s | superato |

I tre MP4 sono byte-identici:
`ACB9BC5FE9053F9B9C7F940BA77C18DC85E4A01BB4D8B9ED7B7DCAF363CD53FA`.

## projectM e preset reali

I probe doppi da 1, 180 e 1.800 frame sono identici, senza mismatch. Dieci
preset reali del repository projectM 4.1.6 sono stati caricati e alimentati con
PCM; tutti reagiscono all'audio, completano la transizione e sono presenti
nell'export da 60 secondi.

L'export contiene 1.800 frame a 30 FPS, 9 cambi preset, 0 frame neri,
0 duplicati, 0 cambi falliti e 0 errori.

## Controllo visuale

Gli screenshot projectM delle tre build mostrano la cover sotto il visual
MilkDrop e titolo/artista sopra. La verifica pixel del canvas non rileva bande
uniformi luminose, ciano o viola nelle prime righe. La cornice ciano visibile
nello screenshot è il focus accessibile del canvas e non appartiene al
framebuffer.

## Artefatti

- `test-results/simple-ui/overlay-dev-final-report.json`;
- `test-results/simple-ui/overlay-portable-final-report.json`;
- `test-results/simple-ui/overlay-setup-final-report.json`;
- screenshot `*-projectm.png`;
- MP4 e progetti `.avsproject` omonimi;
- `test-results/effect-ui-full-tests-final.log`.

## Limite del collaudo

Il flusso è stato esercitato tecnicamente e ispezionato visivamente. Non è
stato ripetuto da una persona indipendente non esperta come studio formale di
usabilità; questo non incide sui gate funzionali qui verificati.

