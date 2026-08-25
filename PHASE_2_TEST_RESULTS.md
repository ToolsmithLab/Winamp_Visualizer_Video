# Risultati test finali Fase 2

Data: 29 luglio 2026  
Versione: 0.2.0  
Esito: **completata e verificata sul sistema di audit**

## Build e test automatici

La build TypeScript e Vite è stata rigenerata prima dei test. La suite completa corrente ha prodotto:

| Metrica | Risultato |
|---|---:|
| Test totali | 61 |
| Superati | 60 |
| Falliti | 0 |
| Saltati / non eseguibili | 1 |
| Durata | 28,604 s |

Il solo test non eseguibile è la creazione di un symlink filesystem Windows, negata per assenza di `SeCreateSymbolicLinkPrivilege`. Non è conteggiato come superato. Sono passati sia il test ZIP-symlink sia i controlli `lstat`. La copertura non è stata ricalcolata in questa esecuzione correttiva; i valori del precedente audit non vengono attribuiti alla suite da 61 test.

## Blocco 1: ripristino della sequenza

Sono passati otto test automatici di confronto evento per evento su 600 secondi:

- ordine sequenziale;
- ordine casuale;
- playlist modificata;
- preset iniziale diverso dal preset corrente;
- salvataggio dopo selezione manuale;
- salvataggio durante/immediatamente dopo una transizione;
- salvataggio dopo seek;
- salvataggio con lock attivo.

Ogni evento confronta preset ID, timestamp, ordine, stato e durata della transizione, marcatore e indice nella playlist. Il test Portable reale ha poi confermato:

- `sameSeed = true`;
- `completeRestoreMatch = true`;
- `rebuiltSameSequence = true`;
- 21 eventi identici nei primi 600 secondi;
- preset iniziale `preset-0927…` distinto dal corrente `preset-02a6…`;
- 17 elementi di cronologia e 2 marcatori preservati.

## Blocco 2: percorsi Unicode

La matrice contiene 14 casi: `Ω`, accenti italiani, tedesco, francese, polacco, cirillico, greco, giapponese, cinese, emoji, spazi/parentesi/apostrofo/trattini, NFC, NFD e un percorso di 298 caratteri.

Risultati:

- 14/14 importazioni con copia e texture: superate;
- 14/14 collegamenti esterni e texture: superati;
- 14/14 percorsi ricevuti dall’host semanticamente identici: superati;
- 14/14 lunghezze espresse in byte UTF-8: superate;
- code page dichiarata dall’host: 65001;
- 14/14 preview/framebuffer projectM reali: superati;
- transizioni e cambio fra tutti i casi: superati;
- chiusura e riapertura della Portable: superate;
- 14/14 ricollegamenti dopo riapertura: superati;
- export MP4 Unicode dopo riapertura: superato, 10.756.824 byte.

Sono inoltre passati i test di UTF-8 malformato, surrogati UTF-16 non accoppiati, prefisso `\\?\`, separatori Windows e compatibilità ASCII. `Ω` è arrivato come byte UTF-8 `CE A9` e non come sequenza mojibake.

## Regressioni

- 10 preset reali projectM v4.1.6: 10/10 caricati, PCM ricevuto e reazione audio verificata;
- export dei 10 preset: 1.800 frame/60 s, 9 cambi, 0 cambi falliti, 0 frame neri, 0 duplicati;
- catalogo ufficiale: 37/37 preset validi, 0 quarantene, hash archivio verificato;
- import singolo, multiplo, cartella ricorsiva, ZIP, link e relink: superati;
- traversal, device path, file eseguibili, ZIP danneggiato e ZIP-symlink: superati;
- 100 cambi manuali e 100 automatici: superati;
- transizioni, fallback preset corrotto, seek, pausa e determinismo: superati;
- inizializzazione/chiusura projectM per 20 cicli: superata;
- libreria projectM mancante: errore gestito senza chiusura dell’app;
- Setup e Portable: generati;
- Portable: avviata da cartella temporanea esterna con `Ω` nel percorso.

## Soak Portable di 10 minuti

- riproduzione: 600,11 s;
- export successivo: 18.000 frame, 600,00 s, H.264 OpenH264 e AAC;
- crash/errori: 0/0;
- FPS UI medio/minimo/massimo: 59,63 / 36,3 / 60,1;
- CPU app+host: 156,39% di un core, circa 13,03% dei 12 processori logici;
- GPU media/picco campionata: 23,33% / 29,75%;
- working set iniziale/a 600 s/finale: 1.199,69 / 1.049,73 / 974,50 MiB;
- memoria privata iniziale/a 600 s/finale: 1.229,36 / 1.034,76 / 883,40 MiB;
- handle iniziali/a 600 s/finali/picco: 2.962 / 2.943 / 2.910 / 2.986.

Non è stata osservata crescita monotona di memoria o handle. Il risultato non sostituisce soak più lunghi o una matrice hardware.

## Parità preview/export OpenH264

| Metrica | 1080×1920, 30 FPS, 60 s | 1080×1920, 60 FPS, 10 s |
|---|---:|---:|
| Frame | 1.800 | 600 |
| Tempo render | 367,35 s | 124,35 s |
| CPU processo | 41,18% | 43,94% |
| GPU picco | 1,67% | 0,85% |
| RSS picco | 231,12 MB | 214,63 MB |
| Memoria privata picco | 235,86 MB | 238,90 MB |
| Handle picco | 444 | 372 |
| Frame neri / duplicati | 0 / 0 | 0 / 0 |
| Cambi falliti | 0 | 0 |
| PSNR minimo | 36,62 dB | 36,85 dB |

Il profilo supportato resta 1080×1920 a 30 FPS offline. Il test 60 FPS è una verifica breve di correttezza, non qualifica stabilità per un brano intero.

## Artefatti

- Setup SHA-256: `A1D25524479C2788F751C502A1E64A850083B1C8D359C2AF2378DF5E609C5B7B`;
- Portable SHA-256: `CEBFCE69F948CA50BEAE6AADD2B6E3C0AF24A9E325732859550C368913CFB9E5`;
- MP4 soak SHA-256: `5CFBDF0D63C33FF479539CFB9438FACF67FAFED122E688BD42430764223293DD`;
- MP4 1080×1920/30 SHA-256: `BB6FF75DC77A81FEBB4CDD8BAAFC70B076A39EE015D587E284A7A04F8B4ECB77`;
- MP4 Unicode SHA-256: `DBFF58FDD3D4C1F20B8D4A25F00C1B1F58574B55A839980A4CDC565C6DBA1878`.

Le evidenze sono in `test-results/phase2-blocker-fixes/`.
