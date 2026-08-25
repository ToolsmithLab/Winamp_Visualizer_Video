# Audit dei controlli visibili

Aggiornato il 30 luglio 2026.

L'audit runtime registra 31 controlli interattivi, 31 handler collegati e
0 controlli visibili privi di handler.

| # | Controllo | Modifica osservabile |
|---:|---|---|
| 1 | Scegli immagine | carica e seleziona la cover |
| 2 | Adattamento immagine | cambia il fit non distruttivo |
| 3 | Rimuovi immagine | elimina il riferimento cover |
| 4 | Scegli brano | decodifica audio, durata e waveform |
| 5-8 | Titolo | testo, dimensione, colore e opacità |
| 9-12 | Artista | testo, dimensione, colore e opacità |
| 13 | Scegli effetto | sostituisce l'effetto visibile |
| 14 | Preset MilkDrop | combobox custom accessibile |
| 15 | Lista preset | selezione diretta con mouse/tastiera |
| 16 | Intensità | reattività Canvas/projectM 0-200% |
| 17 | Opacità effetto | alpha del layer 0-100% |
| 18 | Centra effetto | posizione 0,5/0,5 |
| 19 | Adatta effetto | scala 1/1 |
| 20 | Ripristina effetto | posa, alpha e intensità di default |
| 21 | Rimuovi effetto | seleziona Nessun effetto |
| 22 | Play/Pausa | riproduzione affidabile |
| 23 | Stop | arresto e tempo zero |
| 24 | Posizione temporale | seek sincronizzato |
| 25 | Esporta video | apre il dialogo semplice |
| 26 | Formato export | 9:16, 16:9 o 1:1 |
| 27 | Risoluzione export | Full HD o HD |
| 28 | Annulla export | chiude il dialogo |
| 29 | Esporta | avvia la pipeline MP4 |
| 30 | Canvas anteprima | selezione e trasformazioni |
| 31 | Waveform | stato e posizione audio |

## Esito per build

- sviluppo: 31/31;
- Portable esterna: 31/31;
- Setup installato: 31/31.

In tutti i casi `visibleWithoutHandler` è vuoto. Non sono stati aggiunti
controlli tecnici, pulsanti placebo o funzioni di Fase 4.

