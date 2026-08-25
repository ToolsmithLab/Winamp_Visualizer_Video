# Schema parametri plugin Canvas — Fase 3 M2

Aggiornato il 29 luglio 2026.

## Tipi

Ogni parametro dichiara `key`, `label`, `type`, `defaultValue`,
`animatable` e `description`.

| Tipo | Metadati aggiuntivi | Controllo inspector |
|---|---|---|
| `number` | `minimum`, `maximum`, `step` | range e valore numerico |
| `boolean` | nessuno | checkbox |
| `color` | colore esadecimale `#RRGGBB` | color picker |
| `select` | elenco chiuso `options` | select |

`animatable` è metadata per compatibilità futura: la M2 non implementa
keyframe visibili o timeline avanzata.

## Normalizzazione

`normalizePluginSettings` usa esclusivamente il descriptor:

- `NaN` e `Infinity` tornano al default;
- un tipo errato torna al default;
- i numeri sono limitati a min/max e allineati allo step;
- un colore non `#RRGGBB` torna al default;
- un valore select non dichiarato torna al default;
- le chiavi non dichiarate vengono eliminate;
- il risultato contiene tutte e sole le chiavi note.

La stessa regola è usata da host, schema progetto e inspector. I dati di un
plugin sconosciuto restano conservati come `unknownData`, ma non vengono
eseguiti.

## Persistenza e comandi

Le impostazioni normalizzate sono salvate in:

```json
{
  "plugin": {
    "id": "radialRays",
    "version": "1.0.0",
    "settings": {}
  }
}
```

Ogni modifica persistente dell'inspector passa dal `CommandDispatcher`.
Range e color picker aprono una transazione sul gesto, quindi molti eventi
intermedi producono un solo comando undo/redo. Reset parametro e reset di tutti
i parametri sono anch'essi comandi reversibili.

## Sicurezza UI

Etichette, descrizioni, opzioni e nomi vengono assegnati con `textContent`.
L'inspector non usa `innerHTML` e non contiene condizioni sugli ID plugin.
Aggiungere un descriptor valido crea automaticamente i controlli.
