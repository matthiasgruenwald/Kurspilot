# ImageMagick fuer den Gezielten Bildausschnitt

Fuer den **Gezielten Bildausschnitt** (CONTEXT.md, "Fachabbildung" aus #12-Quellmaterial) wird ein Bildbereich aus einer Quelldatei ausgeschnitten und als eigene Datei gespeichert. Diese Bildverarbeitung kann Node.js nicht ohne Zusatz-Tooling leisten.

## Optionen

- **macOS `sips`**: bereits auf jedem Mac vorhanden, aber nicht auf Windows verfuegbar. Lehrkraefte arbeiten laut CLAUDE.md ueberwiegend unter Windows (Parallels nur fuer Maintainer-Tests) — `sips` scheidet damit als alleinige Loesung aus.
- **npm-Bildbibliothek** (z.B. `sharp`): waere eine echte Laufzeit-Dependency, oft mit nativen Bindings/Praecompiled-Binaries je Plattform. Widerspricht der CLAUDE.md-Praemisse "keine Laufzeit-Dependencies" am staerksten und erschwert die Installation fuer Lehrkraefte zusaetzlich.
- **ImageMagick (`convert`)**: externes CLI-Tool, cross-platform (macOS via Homebrew, Windows via offiziellen Installer). Wird per `child_process` aufgerufen, kein npm-Package.

## Entscheidung

Wir nutzen **ImageMagick** (`convert`) als externes CLI-Tool fuer den Crop:

```
convert <sourcePath> -crop <width>x<height>+<x>+<y> +repage <destPath>
```

Der Aufruf erfolgt ueber `child_process.execFileSync` mit Argumenten als Array (keine Shell-Interpolation, keine Command-Injection-Gefahr).

## Cross-Platform-Tragfaehigkeit

- **macOS (Maintainer)**: Installation via `brew install imagemagick`.
- **Windows (Lehrkraefte)**: Installation via offiziellen ImageMagick-Installer (https://imagemagick.org/script/download.php#windows). ImageMagick 7 liefert dort nur `magick.exe`, kein `convert.exe` mehr; `convert` ist zudem durch das eingebaute Windows-Systemtool zur Datentraeger-Konvertierung belegt. `lib/image-crop.js` waehlt das Binary daher plattformabhaengig (`magick` unter Windows, `convert` sonst, siehe Issue #116).
- Die Implementierung verwendet ausschliesslich dieses plattformabhaengig gewaehlte ImageMagick-CLI, keine macOS-spezifischen Tools wie `sips`.

## Auswirkung auf "keine Laufzeit-Dependencies"

Die Praemisse "keine Laufzeit-Dependencies" bezog sich bisher auf **npm-Packages** (`node_modules`/`package.json` `dependencies`). Diese bleibt unveraendert: `cropImage` fuegt **kein** npm-Package hinzu.

Wir dokumentieren hiermit jedoch eine bewusste **Ausnahme fuer externe System-CLI-Tools**: Fuer Bildverarbeitung (Crop von Fachabbildungen) ist die Installation von ImageMagick auf dem Rechner, auf dem der MCP-Server laeuft, erforderlich. Dies ist eine zusaetzliche Systemvoraussetzung analog zu Node.js selbst, aber **keine** npm-Laufzeit-Dependency im engeren Sinne.

## Konsequenzen

- `lib/image-crop.js` implementiert `cropImage(sourcePath, region, destPath)` und ruft das plattformabhaengig gewaehlte ImageMagick-Binary (`magick`/`convert`) per `execFileSync` auf.
- Ist das ImageMagick-CLI nicht installiert, schlaegt `cropImage` mit einer verstaendlichen Fehlermeldung fehl (kein stiller Fallback).
- Der zugehoerige Test (`test/image-crop.test.js`) prueft vor der Ausfuehrung, ob ImageMagick verfuegbar ist, und skippt sauber, falls nicht (analog zu `test/integration/*.test.js`).
- README/Setup-Anleitung sollte bei Bedarf um einen Hinweis zur ImageMagick-Installation ergaenzt werden, sobald `cropImage` tatsaechlich in einem Tool/Workflow genutzt wird.
