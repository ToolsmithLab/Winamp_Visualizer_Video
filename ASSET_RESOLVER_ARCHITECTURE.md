# Architettura Asset Resolver

## Componenti

- `src/engine/project/assetResolver.ts`: confronto puro, stati, applicazione
  singola/multipla, ignore/remove e preflight export;
- `src/main/project/mediaRelinkService.ts`: filesystem, tipo reale, SHA-256,
  manifest, ricerca esplicita e confini Windows;
- `src/shared/project.ts`: contratto persistente `ProjectAssetReference`;
- `src/renderer/projectAssets/assetRelinkView.ts`: workflow utente;
- IPC specifici `assets:choose-replacement`, `assets:search-folder`; i canali
  con percorso diretto sono rifiutati fuori da `--avs-runtime-test`.

Non esiste un nuovo IPC filesystem generico.

## Manifest

Ogni riferimento conserva:

`id`, `type`, `path`, `originalPath`, `relativePath`, `fileName`, `size`,
`hash`, `status`, `required`.

Tipi: `audio`, `cover`, `milkdrop-preset`, `texture`.

Stati:

- `available`;
- `missing`;
- `hash-mismatch`;
- `inaccessible`;
- `unsupported`;
- `relinked`;
- `ignored`.

Audio è essenziale. Un Preset MilkDrop esterno è essenziale quando projectM è
attivo. Cover e texture sono normalmente opzionali. Il preset projectM
integrato senza percorso esterno non richiede un asset.

## Risoluzione

All'apertura vengono valutati il percorso salvato e quello relativo alla
directory del progetto. Un relativo non può uscire dalla radice del progetto.
Non viene eseguita alcuna scansione automatica del disco.

Un file selezionato viene accettato solo se:

- il percorso è assoluto perché autorizzato dal dialogo;
- non è NUL, URL, device path, symlink o reparse point rilevabile;
- è un file regolare entro 4 GiB;
- estensione e magic bytes corrispondono;
- SHA-256 è calcolato in streaming.

La ricerca cartella è un'azione esplicita, opzionalmente ricorsiva, con massimo
10.000 file e profondità 32. Il matching usa nome, dimensione e SHA-256.

## Atomicità

`updateProjectAssets` lavora su clone. Tutti i match vengono risolti prima
della singola chiamata `ProjectStore.update`; se uno fallisce, il progetto
originale resta invariato. Un mismatch hash non viene applicato senza ID
inserito nell'insieme delle conferme esplicite.

Relink, batch relink, ignore, remove e aggiornamento hash sono comandi
annullabili. Un asset essenziale non può essere ignorato o rimosso.

## Export

Il main rigenera/verifica il manifest prima dell'encoder. Gli asset essenziali
in stato `missing`, `hash-mismatch`, `inaccessible` o `unsupported` bloccano
l'export con l'elenco dei riferimenti; gli opzionali usano il placeholder o
l'assenza esplicita. FFmpeg non viene avviato per un export essenziale
incompleto.

