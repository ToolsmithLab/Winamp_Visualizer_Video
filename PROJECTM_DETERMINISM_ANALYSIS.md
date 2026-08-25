# Analisi del determinismo projectM

Data: 30 luglio 2026  
Ambito: solo bloccante finale Fase 3; Fase 4 non iniziata.

## Versione e provenienza

- projectM: 4.1.6;
- tag: `v4.1.6`;
- commit dichiarato dal manifest upstream: `3158ee6`;
- sorgente: `libprojectM-4.1.6.tar.gz`;
- SHA-256 sorgente:
  `1B9E6D56C59FE24E5416DA4D42E941A34C982811003E43AC88B5ACA8AFA52C87`;
- linking: dinamico, DLL separata;
- host: processo C++ x64 separato da Electron.

Non esiste nell'API C pubblica 4.1.6 una funzione in grado di inizializzare
tutto lo stato casuale. `srand()` da sola non risolve il problema.

## Causa radice verificata nel sorgente

Il framebuffer divergeva dal frame zero perché il costruttore del motore e i
sottosistemi inizializzavano più generatori e clock indipendenti prima del
caricamento del preset:

| Sottosistema | Origine non deterministica 4.1.6 |
| --- | --- |
| `ProjectM.cpp` | `srand(time(nullptr))` |
| `TimeKeeper` | `random_device`, `mt19937`, `high_resolution_clock` |
| `MilkdropNoise` | seed da `system_clock` |
| `PresetTransition` | `random_device`, `system_clock` |
| `TransitionShaderManager` | `random_device` |
| `TextureManager` | `random_device` e scansione filesystem non ordinata |
| `PresetState` | `random_device` |
| shader MilkDrop | `rand()` C globale |
| `projectm-eval` | MT statico non reimpostabile tramite API |

Il problema non dipendeva dalla sequenza editoriale, dai plugin Canvas, dai
keyframe o dal compositor: questi erano già identici. Non sono emerse letture
da PID, ASLR o indirizzi di memoria. Il driver OpenGL e la compilazione shader
non hanno prodotto divergenze dopo la normalizzazione di PRNG, clock e ordine
texture. Beat detection, wave alignment, mesh, registri `q`/`t`/`reg` e PCM
sono risultati deterministici quando inizializzati nello stesso ordine.

## Decisione

È stata mantenuta projectM reale 4.1.6. È stata applicata una patch minima alla
stessa versione, senza dipendenze ABI da Electron e senza cambiare il parser
MilkDrop. La patch completa è distribuita come overlay sorgente in
`native/projectm-4.1.6-determinism/overlay`.

L'API aggiunta è:

```c
projectm_handle projectm_create_with_seed(uint64_t seed);
```

La funzione configura lo stato prima del costruttore. L'API esistente
`projectm_create()` rimane disponibile e mantiene il comportamento upstream,
quindi l'ABI preesistente non è rimossa.

## Esclusioni

Non sono stati introdotti mock, framebuffer preregistrati, renderer
alternativi o sostituti Canvas. Non è stata aggiornata la versione projectM.
Non sono state aggiunte funzioni editor o funzioni di Fase 4.

