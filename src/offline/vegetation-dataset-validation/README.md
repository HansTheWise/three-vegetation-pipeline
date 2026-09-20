# Vegetation Dataset Validation

Dieses Modul prüft das dateiformatunabhängige `VegetationDataset`, bevor der
Writer daraus VEGFILE-v2-Bytes erzeugt.

Validiert werden Grid, Chunk-Lookup, Höhenbereiche, Heightmaplängen,
Layer-IDs, Maskenauflösungen und Maskendaten. Binärlayout, Quantisierung und
CRC32 bleiben Verantwortung des Writers und des gemeinsamen v2-Schemas.
