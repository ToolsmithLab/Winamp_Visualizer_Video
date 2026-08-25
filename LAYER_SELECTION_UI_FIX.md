# Correzione selezione layer nella UI semplice

Aggiornato il 31 luglio 2026.

## Pannello fisso

Il precedente selettore orizzontale sotto l'anteprima è stato sostituito dal
pannello verticale `Layer`, largo 160–184 px e sempre collocato immediatamente
a destra dello stage. Non viene spostato sotto il video nei breakpoint
supportati.

I quattro pulsanti selezionano separatamente `Immagine`, `Effetto`, `Titolo` e
`Artista`. Ogni pulsante espone `ASSENTE`, `NASCOSTO`, `DISPONIBILE` o
`ATTIVO`: lo stato attivo non dipende soltanto dal colore.

## Blocco della selezione

`Blocca selezione sul layer attivo` è abilitato per default. In questo stato il
click sul canvas non cambia layer: drag, resize e rotazione sono indirizzati
soltanto al layer scelto nel pannello, anche quando altri elementi sono
sovrapposti sopra di esso.

Disabilitando il controllo torna disponibile la selezione diretta
dell'elemento superiore sotto il puntatore.

## Trasformazioni

Il layer attivo conserva bordo e maniglie e supporta drag, resize, rotazione,
`Centra`, `Adatta` e `Ripristina`. `Shift` mantiene le proporzioni durante il
resize.

Titolo e Artista restano due layer distinti. Le azioni rapide eliminano
soltanto i keyframe delle proprietà modificate e non cambiano gli altri layer.

## Verifica

Il test Electron reale ha selezionato, trascinato, ridimensionato e ruotato
Immagine, Effetto, Titolo e Artista sovrapposti. Ha inoltre verificato lo stato
`ATTIVO`, il toggle del blocco, save/reopen ed export MP4 in sviluppo, Portable
esterna e installazione Setup temporanea.

Risultati e screenshot sono registrati in
`RIGHT_LAYER_PANEL_AND_STAGE_TEST_RESULTS.md` e
`test-results/right-layer-stage-current/`.
