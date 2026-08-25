# Gestione Preset MilkDrop nella UI semplice

Aggiornato il 31 luglio 2026.

## Scopo

La maschera semplice usa direttamente `PresetLibraryService`,
`PresetImportService` e gli IPC già presenti. Non è stata creata una seconda
libreria e projectM non è stato sostituito.

La sezione compare quando l'effetto attivo è `projectM / MilkDrop` e contiene:

- ricerca per nome;
- tendina completa ordinata alfabeticamente;
- filtri `Tutti`, `Preferiti` e `Cartella corrente`;
- indicazione separata del preset selezionato;
- contatore `Preset disponibili: N · M visibili`;
- toggle `Preferito`;
- azione `Elimina preset`;
- import file, cartella, ZIP e collegamento cartella già disponibili.

La tendina non contiene fixture o limiti artificiali. Il test runtime ha
mostrato 119 preset, poi 118 dopo la rimozione intenzionale di un record, e ha
verificato la navigazione fino all'ultimo elemento con scroll.

## Preferiti

Il toggle invoca l'IPC `presetFavorite(id, !favorite)`. Il servizio aggiorna il
record e salva atomicamente `catalog.json`; la UI ricarica subito il catalogo.
Il filtro `Preferiti` usa il campo persistente `favorite`.

L'aggiunta e la persistenza dopo riavvio sono state verificate sulla build di
sviluppo. L'impostazione e la rimozione del flag sono inoltre esercitate nel
test automatico del servizio.

## Rimozione

L'azione opera sul singolo preset e richiede conferma.

- Preset interno: il record viene rimosso e la copia interna viene spostata
  nel cestino recuperabile della libreria.
- Preset di cartella o file esterno: viene rimosso soltanto il record locale;
  il file originale resta sul disco.
- Preset incluso nel programma: l'azione è disabilitata.

Se viene rimosso il preset corrente, la UI seleziona il successivo valido in
ordine alfabetico; se non ne resta alcuno, disattiva l'effetto. Il test runtime
ha verificato conferma, rimozione immediata, file esterno conservato e assenza
del record dopo il riavvio.

## Persistenza

Il catalogo conserva identificatore, nome, hash, origine, percorso, preferito,
stato tecnico, texture e metadati. Una rimozione dal catalogo è persistente:
il record non viene rigenerato automaticamente al riavvio. Un file esterno
potrà essere indicizzato di nuovo soltanto con una nuova importazione o un
nuovo collegamento esplicito.

