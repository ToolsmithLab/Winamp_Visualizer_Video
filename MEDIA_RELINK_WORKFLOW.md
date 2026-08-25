# Workflow ricollegamento media

## Apertura resiliente

Un progetto con audio, cover, Preset MilkDrop o texture spostati viene aperto
comunque. Percorso originario, relativo, nome, dimensione e hash restano nel
manifest. L'interfaccia mostra lo stato e usa un placeholder; un salvataggio
non elimina silenziosamente il riferimento mancante.

## Ricollegamento singolo

1. Aprire **Asset del progetto**.
2. Premere **Ricollega** sul riferimento.
3. Scegliere un file del tipo richiesto.
4. Il main verifica file regolare, estensione, magic bytes, dimensione e hash.
5. Con SHA coincidente, confermare l'operazione normale.
6. Con SHA differente, leggere l'avviso e confermare esplicitamente oppure
   annullare.

Annullare il dialogo o l'avviso non modifica percorso, hash, history o dirty.

## Ricerca multipla

**Cerca nella cartella** limita la ricerca alla cartella selezionata.
**Cerca anche sottocartelle** abilita la ricorsione esplicita. Il resolver
confronta nome, dimensione e SHA e propone solo file del tipo reale corretto.
Tutti i risultati vengono applicati come un comando; un errore produce rollback
completo.

## Ignore e remove

Un asset opzionale può essere marcato `ignored` oppure il riferimento può
essere rimosso con conferma. Entrambe le operazioni sono annullabili. Audio o
altro asset marcato essenziale non può essere ignorato/rimosso.

## Progetto spostato

Se progetto e media vengono spostati insieme mantenendo la stessa struttura,
`relativePath` risolve dalla nuova directory. Unicode NFC e percorsi Windows
oltre 260 caratteri sono conservati; non vengono convertiti in ANSI.

## Esportazione

L'export procede con asset opzionali mancanti, ma viene bloccato prima
dell'encoder quando manca un essenziale. Dopo un relink valido preview ed
export leggono lo stesso percorso aggiornato nel progetto.

