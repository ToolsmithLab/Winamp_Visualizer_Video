# Ridisegno dell'interfaccia semplice

Aggiornato il 30 luglio 2026.

## Obiettivo

La schermata principale è stata ridotta al solo flusso necessario per creare
un video: immagine, brano, titolo, artista, un effetto, intensità, riproduzione
ed esportazione. La Fase 4 non è stata iniziata.

## Struttura

L'interfaccia usa tre aree:

1. colonna sinistra con sei sezioni numerate;
2. anteprima centrale, selezionabile e trasformabile;
3. barra inferiore con waveform, Play/Pausa, Stop, posizione, durata, seek ed
   Esporta video.

La colonna sinistra contiene soltanto:

- `Immagine`: scelta, miniatura, nome, Adatta/Riempi/Dimensione originale e
  rimozione;
- `Brano`: scelta, nome e durata;
- `Titolo`: testo, dimensione, colore e opacità;
- `Artista`: testo, dimensione, colore e opacità;
- `Effetto`: un'unica scelta fra nessuno, dieci effetti Canvas o
  projectM/MilkDrop; per projectM compare soltanto la scelta del preset;
- `Intensità effetto`: slider immediato 0–200%.

## Comportamento

- Un'immagine valida compare e viene selezionata subito. Il resize mantiene le
  proporzioni per impostazione predefinita; drag, maniglie e rotazione
  modificano il medesimo layer usato dall'export.
- Titolo e artista compaiono durante la digitazione. Dimensione, colore e
  opacità sono indipendenti e persistono nel progetto. Lo svuotamento del campo
  nasconde il relativo layer.
- L'elemento già selezionato resta manipolabile anche quando è sovrapposto a un
  altro layer. Il click sul vuoto deseleziona.
- Il menu effetto sostituisce l'effetto precedente senza un pulsante
  `Aggiungi`. I dieci effetti Canvas e projectM ricevono lo stesso snapshot
  audio usato prima del ridisegno.
- Play resta disabilitato finché non esiste audio decodificato. Gli errori
  vengono mostrati nella barra di stato invece di fallire silenziosamente.
- L'export semplice espone rapporto 9:16, 16:9 o 1:1, risoluzione, 30 FPS,
  destinazione scelta dal dialogo nativo e il pulsante finale `Esporta`.

## Compatibilità

Il ridisegno riusa il compositor, il motore audio, l'host projectM 4.1.6,
l'IPC e la pipeline export esistenti. Lo schema progetto resta 6.0; sono stati
aggiunti in modo compatibile i campi testuali `titleColor` e `artistColor`, con
fallback al precedente `text.color` quando si apre un progetto meno recente.
Il protocollo projectM resta v2.

## Elementi esclusi dalla schermata principale

Inspector tecnico, lista layer complessa, ID, history, asset manifest, relink,
preset di progetto, keyframe, timeline avanzata, interpolazioni, clip,
snapping, descriptor, registry, controlli IPC e controlli host projectM non
sono più visibili. Non esiste una sezione `Avanzate`.

Il codice sottostante resta disponibile per la compatibilità dei progetti e
per i test delle fasi precedenti, ma non è affiancato al nuovo flusso.

