# Built-in profile dataset preparation

This internal module owns the shared Worker entry for built-in runtime profiles.
Every built-in profile references the same Worker factory, so one pipeline setup
can parse a VEGFILE once and prepare all selected built-in layers in one Worker.

The Worker registry currently contains Grass preparation. Add another built-in
preparation here when its complete runtime profile is introduced. Consumer
projects never import this module or create its Worker.
