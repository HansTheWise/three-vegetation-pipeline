# Vegetations-Patterns

Pattern, Rotation und Spiegelung einer Cell verwenden die stabile Cell-ID und
Bitbelegung aus `../identity/identity.md`. Die Erzeugung der Patterns selbst
bleibt davon unabhängig.

`createVegetationPatterns` erzeugt aus dem im VEGFILE gespeicherten Seed und
der Runtime-Config eine feste Menge normalisierter Ankerpositionen. Die
Positionen liegen im Bereich `[0, 1)` einer Vegetations-Cell und werden einmalig
erzeugt.

Die Ankerreihenfolge ist progressiv: Jeder neue Anker wird aus mehreren
Kandidaten möglichst weit von den bereits vorhandenen Ankern platziert. Die
Distanz wird periodisch über gegenüberliegende Cell-Ränder gemessen. Dadurch
haben Ränder und Ecken keinen künstlichen Platzvorteil und jedes Pattern bleibt
kachelbar. Ein LOD verwendet immer einen zusammenhängenden Präfix dieser
Reihenfolge.

`createLodAnchorCounts` halbiert die Ankerzahl pro Stufe. Bei acht Ankern gilt
die übliche Reihenfolge vom höchsten zum niedrigsten Detail:

```text
LOD 0: 8 Anker (100 %)
LOD 1: 4 Anker ( 50 %)
LOD 2: 2 Anker ( 25 %)
```

`selectCellPattern` bestimmt aus Seed, Layer-ID und globaler Cell-Koordinate
reproduzierbar Patternindex, Rotation in 90-Grad-Schritten und Spiegelung.
Dadurch müssen diese Entscheidungen nicht pro Cell gespeichert werden.
