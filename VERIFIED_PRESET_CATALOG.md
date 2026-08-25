# Catalogo preset verificato

> La verifica qui descritta è tecnica/documentale e non un’approvazione legale. Il riepilogo finale, inclusa la riserva sulla titolarità dei contributi storici, è in `PRESET_LICENSES.md`.

## Stato

Manifest: `assets/preset-catalog/catalog-v1.json`  
Schema: 1  
Versione catalogo: 1.0.0  
Verifica: 28 luglio 2026

Il catalogo è separato dalla Libreria preset personale. La licenza verificata
è un requisito del catalogo, non un requisito per usare localmente un preset.

## Pacchetto pubblicato

### projectM 4.1.6 — Preset di test ufficiali

- ID: `projectm-4.1.6-development-test-presets`
- versione: 4.1.6
- progetto/autore: projectM Development Team
- fonte:
  `https://github.com/projectM-visualizer/projectm/tree/v4.1.6/presets/tests`
- download:
  `https://github.com/projectM-visualizer/projectm/archive/refs/tags/v4.1.6.zip`
- data release: 28 novembre 2025
- licenza: LGPL-2.1-or-later
- testo: `licenses/projectM/LICENSE.txt`
- attribuzione: projectM e rispettivi contributori
- SHA-256:
  `ce8edc600042184e42e3dc2ce43befea857cf2dfe8b947cb8ff3268f33e56048`
- preset: 37
- texture: 0
- inventario texture: vuoto
- projectM verificato: 4.1.6
- verifica compatibilità: 37/37 caricati e renderizzati, 0 quarantene

L'installer verifica l'intero archivio, poi estrae esclusivamente
`projectm-4.1.6/presets/tests`. Il resto del repository non viene importato.

## Sicurezza e operazioni

- solo URL HTTPS senza credenziali;
- hash SHA-256 obbligatorio prima dell'estrazione;
- download temporaneo con limite dimensione e timeout;
- massimo cinque redirect HTTPS;
- estrazione con normalizzazione, blocco traversal/device path/assoluti;
- rifiuto symlink, file eseguibili e tipo reale non consentito;
- limite numero file, dimensione per file e dimensione totale;
- verifica CRC ZIP e inventario esatto;
- validazione reale di ogni `.milk` con projectM 4.1.6;
- staging isolata, pulizia e rollback in caso di errore;
- nessuna esecuzione di contenuti;
- installazione e aggiornamento soltanto su richiesta esplicita;
- disinstallazione limitata ai file posseduti dal pacchetto;
- verifica integrità dei file installati.

L'interfaccia mostra elenco, dettagli, autore, licenza, fonte, stato,
installazione, aggiornamento, disinstallazione, controllo integrità, apertura
fonte, lettura licenza ed errori.

## Pacchetti esclusi

| Pacchetto | Motivo |
|---|---|
| Cream of the Crop | la raccolta dichiara che molti preset non hanno licenza specifica; l'assunzione di pubblico dominio non soddisfa il criterio |
| En D | condizioni analoghe: assenza di licenze specifiche per molti contenuti |
| Classic Presets | nessun file di licenza esplicita verificabile nel repository |
| Texture Pack | manca un inventario con licenza esplicita per ogni texture |
| MilkDrop Original | provenienza storica disponibile, ma nessuna licenza di ridistribuzione verificata per il pacchetto |

L'esclusione dal catalogo non impedisce all'utente di importare personalmente
questi file, se sicuri e tecnicamente compatibili.

## Evidenza

Il report reale è
`test-results/phase2/verified-preset-catalog.json`: archivio di 48.153.763
byte, hash corretto, 37 importati, 37 validi, 0 errori e 0 quarantene.
