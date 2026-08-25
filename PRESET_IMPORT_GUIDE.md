# Guida importazione Preset MilkDrop

Verifica aggiornata: 28 luglio 2026.

## Libreria personale e catalogo ufficiale

Sono due ambiti separati:

1. **Libreria personale dell’utente**: accetta preset `.milk` tecnicamente validi e sicuri anche quando autore, fonte o licenza non sono verificabili.
2. **Catalogo ufficiale**: accetta soltanto pacchetti con provenienza e licenza dichiarata esplicite, hash verificato e compatibilità projectM controllata.

Un preset personale senza dati sufficienti è marcato `Licenza non verificata`. Può essere visualizzato, aggiunto a playlist, usato nelle transizioni e nei video esportati. Non viene messo in quarantena per la sola licenza sconosciuta, non viene incluso in Setup/Portable/catalogo e non viene redistribuito. L’interfaccia ricorda che l’utente è responsabile dei diritti d’uso.

## Formati e modalità

“Importa preset” supporta:

- un file `.milk`;
- selezione multipla di `.milk`;
- cartella e sottocartelle;
- archivio ZIP con preset e texture;
- copia nella libreria interna;
- collegamento a cartella esterna.

La demo finale ha importato 1 preset singolo, 2 in selezione multipla, 4 da cartella ricorsiva e 3 da ZIP.

## Procedura

1. Aprire **Libreria preset**.
2. Selezionare **Importa preset** e la sorgente.
3. Scegliere copia interna o collegamento esterno.
4. Controllare il report con importati, duplicati, rifiutati, quarantena e texture mancanti.
5. Selezionare un elemento valido e avviare l’anteprima con **Motore projectM**.

La copia interna è attualmente la modalità più affidabile. I percorsi collegati che contengono caratteri Unicode non ASCII hanno un problema noto al confine con l’host C++.

## Sicurezza

Prima dell’inserimento in libreria:

- i percorsi sono normalizzati;
- traversal, percorsi assoluti, UNC/device path e segmenti sospetti sono rifiutati;
- symlink e reparse point sono rifiutati;
- EXE, DLL, BAT, CMD, PS1, JS e altri file eseguibili sono rifiutati;
- il tipo reale viene controllato e nessun contenuto è eseguito;
- numero, dimensione singola e dimensione totale sono limitati;
- gli ZIP sono estratti in directory temporanea isolata;
- errori causano pulizia e rollback;
- ogni file ammesso riceve SHA-256;
- i duplicati sono rilevati per hash;
- preset e texture vengono inventariati;
- preset corrotti o che causano errore tecnico possono essere messi in quarantena.

Il test automatico della creazione di un symlink filesystem reale non è stato eseguito perché Windows non ha concesso il privilegio `CreateSymbolicLink`. I test su symlink ZIP e i controlli `lstat` sono passati.

## Metadati

Per ogni preset la libreria conserva:

- nome;
- autore soltanto se dichiarato;
- percorso e origine;
- data importazione;
- SHA-256;
- stato tecnico;
- licenza e stato verifica;
- texture e texture mancanti;
- compatibilità;
- preferito;
- quarantena e motivo.

Ricerca, filtri, ordinamento, preferiti, eliminazione, apertura percorso, modifica metadati, anteprima, miniatura quando disponibile e report errori sono esposti dall’interfaccia.

Non vengono inventati autore, licenza o fonte.

## Persistenza

Nel progetto sono salvati:

- identificatore, percorso, hash e preset selezionato;
- preferiti e stato libreria;
- impostazioni projectM;
- playlist, ordine, seed, lock, cronologia, marcatori e cambio automatico;
- texture note;
- cartelle esterne collegate.

Il ricollegamento cerca un file sostitutivo e ne verifica l’hash prima di aggiornare il riferimento. I test automatici di persistenza e ricollegamento sono passati.

## Duplicati

Un contenuto con SHA-256 già presente non viene ricopiato come nuovo preset. Il report indica il record esistente. Nomi uguali con contenuto diverso restano record distinti.

## Texture

Le texture ammesse sono inventariate con hash e percorso relativo. I riferimenti mancanti sono mostrati come “texture mancanti”; non causano esecuzione di contenuti o chiusura dell’app. Una texture vietata o con percorso non sicuro blocca l’import.

## Quarantena

La quarantena si applica esclusivamente a problemi tecnici o di sicurezza, per esempio:

- sintassi/preset illeggibile;
- crash o errore ripetibile di projectM;
- payload pericoloso;
- integrità non valida.

“Licenza non verificata” non è un motivo di quarantena.

## Test finale

Sono stati verificati: `.milk` valido e corrotto, multiplo, ricorsione, ZIP valido/danneggiato/traversal/eseguibili, duplicati, texture presenti/mancanti, Unicode, percorsi lunghi, hash, metadati, persistenza, ricollegamento e quarantena.

Dieci preset reali sono stati caricati con projectM 4.1.6 da percorsi ASCII. Una prova con `Sottocartella Ω` ha fallito perché il percorso è stato alterato nell’host; il problema è riportato in `KNOWN_ISSUES.md`.
