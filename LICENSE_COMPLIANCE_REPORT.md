# Rapporto di conformità licenze

> Documento tecnico, non parere legale. La versione finale dell’inventario e delle riserve è in `THIRD_PARTY_LICENSES.md` e `PRESET_LICENSES.md`.

Data audit: 28 luglio 2026. Questo rapporto è tecnico e non è consulenza
legale.

## Esito per ambito

| Ambito | Stato | Evidenza |
|---|---|---|
| Libreria personale | conforme al requisito funzionale | preset sconosciuti restano utilizzabili e non redistribuiti |
| Catalogo ufficiale | verificato | manifest versionato, un pacchetto con licenza/fonte/hash/inventario |
| projectM | impostazione LGPL documentata | DLL dinamica sostituibile, testi e fonte inclusi, nessuna modifica |
| FFmpeg | precedente conflitto rimosso | `ffmpeg-static`/GPL eliminato; runtime LGPL shared con manifest |
| Preset incluso | provenienza documentata | derivazione dal test projectM 4.1.6 e testo LGPL |

## projectM

- versione: 4.1.6 (`v4.1.6`, commit `3158ee6`);
- licenza: LGPL-2.1-or-later;
- linking: dinamico, tramite `projectM-4.dll`;
- isolamento: processo `projectm-host.exe`, fuori da Electron;
- modifiche alla libreria: nessuna;
- fonte corrispondente:
  `https://github.com/projectM-visualizer/projectm/tree/v4.1.6`;
- attribuzioni e testo: `licenses/projectM`;
- sostituzione: DLL separata in `resources/native/win-x64`, istruzioni in
  `BUILD_WINDOWS.md`.

L'host C++ del progetto rimane disponibile nel repository e non impedisce la
sostituzione della libreria ABI-compatibile.

## FFmpeg

La build precedente era FFmpeg 6.1.1 gyan.dev con `--enable-gpl`,
`--enable-version3`, `--enable-static` e `--enable-libx264`. Era quindi una
build GPLv3 e non adatta alla strategia di distribuzione scelta per questo
prodotto privato `UNLICENSED`.

Modifiche concrete:

1. rimossa la dipendenza `ffmpeg-static` da `package.json` e lockfile;
2. rimossi riferimenti ad `asarUnpack` e risoluzione runtime npm;
3. aggiunto FFmpeg `lgpl-shared-7.1` come risorsa separata;
4. sostituito `libx264` con `libopenh264`;
5. incluse licenze LGPL-3.0 e OpenH264;
6. fissati URL, release e SHA-256 archivio/file;
7. testato export H.264/AAC con pipeline visuale reale.

## Catalogo e preset personali

Il codice non usa la licenza come criterio di quarantena. Per il catalogo,
invece, il parser rifiuta manifest con licenza vuota/non verificata, URL non
HTTPS o hash non valido. Installazione e aggiornamento richiedono azione e
conferma dell'utente.

## Obblighi operativi prima della pubblicazione

- mantenere nei pacchetti i testi e i manifest presenti;
- mantenere accessibile il sorgente corrispondente projectM/FFmpeg o
  conservarne una copia pubblicabile;
- non sostituire i runtime con build GPL senza riesaminare l'intero modello di
  distribuzione;
- non aggiungere preset/texture al catalogo senza audit;
- svolgere revisione legale finale, incluse notice transitive e brevetti H.264.

L'ultimo punto è una verifica editoriale/legale del produttore, non un difetto
tecnico che blocca l'uso locale.
