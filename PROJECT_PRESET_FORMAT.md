# Formato Preset di progetto

Versione formato: `1.0`  
Estensione: `.avspreset`  
Encoding: JSON UTF-8 rigoroso, senza BOM richiesto  
Identificatore formato: `audio-visualizer-studio-project-preset`

Il Preset di progetto è distinto dal Preset MilkDrop. Il primo descrive una
configurazione visuale dell'editor; il secondo è un file `.milk` interpretato
dal Motore projectM.

## Documento

```json
{
  "format": "audio-visualizer-studio-project-preset",
  "version": "1.0",
  "metadata": {
    "id": "UUID stabile",
    "name": "Nome",
    "description": "Testo",
    "author": null,
    "createdAt": "ISO-8601",
    "modifiedAt": "ISO-8601"
  },
  "includeAssets": {
    "audio": false,
    "cover": false,
    "milkdropPreset": false,
    "textures": false
  },
  "visual": {
    "canvas": {},
    "cover": {},
    "text": {},
    "projectM": {},
    "layers": [],
    "exportSettings": {}
  },
  "assets": []
}
```

`visual` conserva canvas/profilo, layer e ordine, plugin e settings, transform,
opacità, blend, intervalli, keyframe, impostazioni projectM, playlist,
transizioni, marcatori e seed. I plugin integrati sconosciuti alla build
corrente restano nel documento con ID, versione, settings e `unknownData`;
l'applicazione parziale richiede conferma esplicita.

## Asset

Il file non incorpora binari. Un riferimento asset contiene:

- `id`, `type`;
- `relativePath` e `fileName`;
- `size` e SHA-256 `hash`;
- `status` e `required`;
- `path` e `originalPath` obbligatoriamente `null` nel file portabile.

Sono selezionabili indipendentemente audio, copertina, Preset MilkDrop e
texture; nessuna selezione è il default. Selezionare tutte le quattro opzioni
equivale a “tutti gli asset”. I percorsi assoluti restano solo nell'indice
locale della libreria e nel progetto `.avsproject`, mai nel `.avspreset`
esportato.

## Dati esclusi

Sono rifiutati PCM, framebuffer, bitmap, PID, handle, istanze runtime, metriche,
funzioni, moduli, comandi, script, HTML eseguibile e dati binari. Testo come
`<script>` nei metadati è conservato come testo inerte e renderizzato soltanto
con `textContent`.

Non vengono usati `eval`, `Function`, shell, PowerShell, `child_process`,
import dinamico derivato dal file o `innerHTML` per contenuti importati.

## Limiti

| Voce | Limite |
|---|---:|
| File | 2 MiB |
| Profondità JSON | 32 |
| Proprietà complessive | 20.000 |
| Lunghezza singola stringa | 8.192 caratteri |
| Layer | 128 |
| Keyframe | 10.000 |
| Riferimenti asset | 512 |

Sono rifiutati JSON vuoto/corrotto, UTF-8 invalido, versione futura, tipi
errati, `NaN`, `Infinity`, riferimenti circolari, `__proto__`, `constructor`,
`prototype`, traversal, percorsi assoluti/UNC/device, URL eseguibili, nomi
device Windows ed estensioni non ammesse.

## Pipeline di import

1. dialogo specifico nel main process;
2. verifica `.avspreset`, file regolare, symlink/reparse point e dimensione;
3. decodifica UTF-8 `fatal`;
4. parse JSON;
5. scansione struttura/limiti/proprietà vietate;
6. validazione stretta e normalizzazione in memoria;
7. risoluzione confinata degli asset relativi;
8. copia normalizzata nella libreria personale;
9. anteprima reale nel compositor senza mutare progetto/history/dirty;
10. conferma;
11. applicazione come un solo comando.

Import annullato o fallito non cambia il progetto. La versione formato è
indipendente dalla versione `6.0` del progetto.

