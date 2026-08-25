# Decisione di distribuzione FFmpeg

> Decisione tecnica, non parere legale. Versione, hash e risultati del benchmark OpenH264 corrente sono in `THIRD_PARTY_LICENSES.md` e `PHASE_2_TEST_RESULTS.md`.

Data: 28 luglio 2026  
Decisione: build FFmpeg LGPL condivisa inclusa nel prodotto

## Situazione iniziale

`ffmpeg-static` 5.3.0 risolveva a un `ffmpeg.exe` gyan.dev 6.1.1 con
`--enable-gpl`, `--enable-version3`, `--enable-static` e `--enable-libx264`.
La build dichiarava GPLv3. Il progetto applicativo è `UNLICENSED`, quindi la
precedente configurazione richiedeva una strategia GPL completa oppure la
sostituzione concreta del binario.

## Opzioni valutate

1. **Build LGPL compatibile.** Mantiene FFmpeg incluso e l'esperienza offline;
   richiede codec e packaging condivisi compatibili.
2. **Distribuzione conforme GPL.** Tecnicamente valida, ma imporrebbe una
   decisione di licenza e distribuzione molto più ampia per il prodotto.
3. **Download separato dell'utente.** Riduce i file inclusi, ma rende il primo
   export dipendente dalla rete e sposta la scelta del binario sull'utente.
4. **Encoder proprietario/Media Foundation.** Riduce FFmpeg, ma richiederebbe
   una nuova pipeline di muxing e una nuova verifica di parità.

È stata scelta l'opzione 1.

## Runtime selezionato

- FFmpeg: `n7.1.5-10-g2aefd64d48-20260727`;
- release BtbN: `autobuild-2026-07-27-14-00`;
- asset: `ffmpeg-n7.1.5-10-g2aefd64d48-win64-lgpl-shared-7.1.zip`;
- hash archivio:
  `d2a6df844a674c04780478f33224134a29d1b54152f8d8314b82e02eccb02edd`;
- licenza build: LGPL-3.0-or-later;
- H.264: `libopenh264`;
- audio: encoder AAC nativo;
- linking: DLL libav condivise.

La configurazione verificata non contiene `--enable-gpl`, disabilita
`libx264`/`libx265`, abilita shared e disabilita static.

## Packaging concreto

`native/ffmpeg/win-x64` viene copiato in
`resources/native/ffmpeg/win-x64`. `ffmpeg.exe` e ogni DLL hanno hash
individuale nel manifest. I testi LGPL e OpenH264 sono inclusi. L'app usa
percorsi relativi sia in Setup sia in Portable; Node.js o un'installazione
FFmpeg esterna non sono richiesti.

## Verifiche

- `ffmpeg -version`: variante LGPL shared attesa;
- smoke encode: H.264 High/yuv420p + AAC-LC riuscito;
- export del compositor: framebuffer projectM, Canvas e audio codificati;
- test automatico: nessun filtro FFmpeg sostitutivo;
- packaging: controllo presenza eseguibile, DLL, manifest e licenze.

## Limiti

OpenH264 non è equivalente a x264 in efficienza/controlli. Il profilo finale
deve mantenere la verifica prestazionale documentata e non viene dichiarato
stabile a 60 FPS. Restano inoltre da valutare con un consulente i brevetti
H.264 secondo territorio e distribuzione.
