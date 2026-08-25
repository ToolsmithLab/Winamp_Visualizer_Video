# Changelog Fase 2

## Chiusura bloccanti — 29 luglio 2026

### Ripristino deterministico

- aggiunto restore atomico con `isRestoringProject`;
- separata la selezione visuale `restore` dalla selezione manuale;
- impedite mutazioni da listener UI durante il caricamento;
- ricostruito lo scheduler una sola volta a restore completato;
- preservati seed, playlist, ordine, preset iniziale/corrente, lock, cronologia, marcatori e transizioni;
- aggiunti otto test evento per evento su 600 secondi;
- verificata la Portable prima/dopo chiusura, riapertura e rebuild.

### Percorsi Unicode projectM

- aggiunta codifica UTF-8 rigorosa nel main e lunghezza in byte;
- rifiutati surrogate non accoppiati e UTF-8 malformato;
- convertito esplicitamente UTF-8→UTF-16 nell’host;
- adottate API Windows wide e prefisso long-path;
- caricato il contenuto `.milk` reale tramite `projectm_load_preset_data`;
- aggiunto manifest UTF-8/long-path;
- verificati 14 casi Unicode, NFC/NFD, emoji e percorso da 298 caratteri;
- verificati copia, link, texture, preview, transizioni, relink, riapertura ed export.

### Regressioni e packaging

- build TypeScript/Vite superata;
- suite: 61 totali, 60 superati, 0 falliti, 1 non eseguibile;
- 10/10 preset reali e 37/37 catalogo verificati;
- 100 cambi manuali e 100 automatici superati;
- soak Portable di 10 minuti ed export completo di 600 s superati;
- benchmark OpenH264 1080×1920/30 di 60 s superato;
- Setup e Portable rigenerati con il nuovo host.

Nessuna funzione di Fase 3 è stata iniziata.
