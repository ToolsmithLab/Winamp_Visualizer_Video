# Fixture import preset

- `valid.milk`: preset valido con autore e licenza espliciti;
- `corrupt.milk`: file testuale non MilkDrop;
- `missing-texture.milk`: preset che riferisce una texture assente;
- `unicode/Visualità Ω.milk`: nome Unicode e licenza non dichiarata.

Gli ZIP validi, danneggiati, con traversal e con eseguibili vengono generati
durante i test per evitare che un archivio ostile venga distribuito come asset
ordinario.
