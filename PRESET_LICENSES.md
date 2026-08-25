# Licenze dei Preset MilkDrop

Aggiornato il 28 luglio 2026.

## Ambito e limite della verifica

Questo documento registra licenze dichiarate, provenienza, hash, testi inclusi e verifiche tecniche. Non è un parere legale e non dichiara “legalmente approvato” alcun preset o pacchetto. La licenza principale di un repository non prova in modo assoluto la titolarità di ogni contributo storico.

## Libreria personale

L’utente può importare e usare localmente qualsiasi `.milk` tecnicamente compatibile e sicuro.

Quando autore, fonte o licenza non sono verificabili:

- etichetta: `Licenza non verificata`;
- anteprima, playlist, transizioni ed export: consentiti;
- quarantena per sola licenza ignota: vietata;
- redistribuzione da parte del programma: vietata;
- inclusione in Setup, Portable o catalogo ufficiale: vietata;
- responsabilità dei diritti d’uso: dell’utente, come ricordato nell’interfaccia.

Il programma non afferma che l’utente possieda i diritti.

## Preset incluso nell’app

| Campo | Valore |
|---|---|
| Nome | AVS Audio Wave |
| Percorso | `assets/projectm/presets/AVS Audio Wave.milk` |
| Provenienza | creato per Audio Visualizer Studio |
| Licenza dichiarata | testo in `assets/projectm/presets/LICENSE.md` |
| Distribuzione | inclusa in Setup e Portable |
| Verifica tecnica | caricamento projectM e packaging verificati |
| Revisione legale definitiva | non ottenuta |

## Catalogo ufficiale

Manifest: `assets/preset-catalog/catalog-v1.json`, schema 1, catalogo 1.0.0.

### projectM 4.1.6 — preset di test ufficiali

| Campo | Valore |
|---|---|
| ID | `projectm-4.1.6-development-test-presets` |
| Progetto/autore dichiarato | projectM Development Team |
| Fonte | tag projectM v4.1.6, `presets/tests` |
| Versione | 4.1.6 |
| Licenza dichiarata | LGPL-2.1-or-later |
| Testo licenza | `licenses/projectM/LICENSE.txt` |
| Archivio SHA-256 | `ce8edc600042184e42e3dc2ce43befea857cf2dfe8b947cb8ff3268f33e56048` |
| Preset | 37 |
| Texture | 0 |
| Compatibilità | 37/37 caricati da projectM 4.1.6 |
| Quarantena | 0 |
| Verifica tecnica | fonte HTTPS, hash, inventario e caricamento verificati |
| Revisione legale definitiva | non ottenuta |

Gli autori individuali non sono dichiarati nei dieci preset campionati dall’audit. La provenienza dal tag e la licenza principale sono state verificate tecnicamente; ciò non certifica la titolarità storica di ogni contributo.

## Dieci preset campionati

Tutti provengono da `https://github.com/projectM-visualizer/projectm/tree/v4.1.6/presets/tests`, dichiarazione LGPL-2.1-or-later del repository, 0 texture:

| Preset | SHA-256 |
|---|---|
| 001-line | `0927cdb46b69bfe19d73da3a58fe953c6fbfd9f9dce6353b93b108939d3fc741` |
| 100-square | `a22cfaf02fc47872b8a714696b38b2bf5a05f92b37dd663b783f9746e30a996f` |
| 101-per_frame | `c67614510e18383559ad2ac2a76362ca241a07b865f3ad59731736ae3f7d6ea7` |
| 110-per_pixel | `8d58b7fcc30241a8dfcd805ee8499863f2efcd70cd862d39d05275bdbec5799f` |
| 200-wave | `afa1f7df14ef80ea6dd90f22b277e5edcaa62784b22ea913e8664dffe4d95cf5` |
| 201-wave | `821cfc6f502ffffd2b48959dc1df558c2b32676222bc60065b28de9fb265df66` |
| 240-wave-smooth-00 | `02a6e72ae58edc6187ba1d348aec3ecce67b23a39d14980f0a7b116e9a664dbe` |
| 250-wavecode | `501548257965af34322931fd7648f96e7264b8f5a04fea9337acee241ecea2a4` |
| 260-compshader-noise_lq | `447102d59d0480373adfffec2a277765d1a072ed36dce210f5ac9070d41c43cc` |
| 300-beatdetect-bassmidtreb | `b5d7bf8e812a50b568b8427fd93f7faba6a4f0d64463ab71c9482af38aa0ec65` |

## Pacchetti esclusi

| Pacchetto | Motivo tecnico/documentale |
|---|---|
| Cream of the Crop | nessuna concessione esplicita; il testo presume pubblico dominio |
| Classic projectM Presets | nessun file LICENSE/licenza esplicita verificata |
| MilkDrop Texture Pack | nessun inventario di licenze per tutte le texture |
| En D Presets | testo basato su assunzione di pubblico dominio e copyright riconosciuto |
| MilkDrop 2 original presets | licenza esplicita per ogni preset non verificata |

“Free download”, repository pubblico, forum o assenza di avviso copyright non sono considerati una licenza.

## Installazione catalogo

Il client:

- usa HTTPS;
- scarica in area temporanea;
- verifica SHA-256 prima dell’estrazione;
- applica la stessa estrazione sicura dell’import personale;
- rifiuta hash errato o file vietati;
- usa staging e rollback;
- non aggiorna silenziosamente;
- mostra fonte e testo licenza.

## Azione legale residua

Prima di distribuire commercialmente il pacchetto ufficiale è raccomandata una revisione legale indipendente su:

- titolarità dei contributi storici;
- correttezza delle attribuzioni;
- compatibilità della distribuzione con la licenza dichiarata;
- uso del preset creato per l’app.
