# Windows-Alias-Smoke-Test (Issue #163 / #166)

Dieser Ablauf verifiziert manuell den Alias-Flow auf der Windows-Parallels-VM:
Junction-Anlage ohne Adminrechte, Konfigurator-Option, Konflikt-Erkennung bei
manuell geändertem Alias-Ziel.

## Automatisierter Unit-Test (macOS/CI)

`test/skill-install.test.js` simuliert das Windows-Junction-Verhalten vollständig
über einen injizierbaren Link-Erzeuger (`createLink`-Option von
`installKurspilotSkillsAliasForClaude`). Der Test heißt:

```
Windows-Junction-Simulation: Konfigurator-Option --alias injizierbar, Konflikt bei falscher Zielangabe erkennbar
```

Er prüft:
- Junction-Anlage gelingt ohne Adminrechte (simuliert)
- `createLink` wird genau einmal je verwalteten Ordner aufgerufen
- Konflikt-Flow greift, wenn ein bestehendes Alias-Ziel manuell verändert wurde

## Manueller Verifikationsschritt auf der Parallels-VM

Voraussetzung: Node.js installiert, Repo per iCloud-Drive / Shared Folder eingebunden.

### 1. Junction-Anlage ohne Adminrechte

```powershell
node scripts/install-skills.js --alias --home %USERPROFILE%\AppData\Local\Temp\kp-test
```

Erwartetes Ergebnis:
- `%USERPROFILE%\AppData\Local\Temp\kp-test\.agents\skills\kurspilot\` enthält echte Dateien
- `%USERPROFILE%\AppData\Local\Temp\kp-test\.claude\skills\kurspilot` ist eine Junction
  (prüfbar via `dir /AL %USERPROFILE%\AppData\Local\Temp\kp-test\.claude\skills`)
- Kein UAC-Dialog, kein Fehler `Zugriff verweigert`

### 2. Konfigurator-Option sichtbar und funktional

```powershell
node scripts/install-skills.js --help
```

Oder ohne `--alias` (Kopier-Modus als Vergleich):

```powershell
node scripts/install-skills.js --home %USERPROFILE%\AppData\Local\Temp\kp-test2
```

Erwartetes Ergebnis: in `kp-test2\.claude\skills\kurspilot` sind echte Ordner,
keine Junctions.

### 3. Konflikt-Flow bei manuell verändertem Alias-Ziel

Nach Schritt 1 ein Junction-Ziel manuell auf einen anderen Ordner umleiten:

```cmd
rmdir %USERPROFILE%\AppData\Local\Temp\kp-test\.claude\skills\kurspilot
mklink /J %USERPROFILE%\AppData\Local\Temp\kp-test\.claude\skills\kurspilot C:\Windows\Temp
```

Dann erneut installieren:

```powershell
node scripts/install-skills.js --alias --home %USERPROFILE%\AppData\Local\Temp\kp-test
```

Erwartetes Ergebnis:
- Exit-Code 1
- Fehlermeldung auf stderr enthält `kurspilot` und einen Hinweis auf den Konflikt
- Die Junction auf `C:\Windows\Temp` bleibt unverändert

## Hintergrund

Windows-Junctions (`mklink /J`) benötigen keine Adminrechte auf NTFS-Volumes.
`defaultCreateLink` in `lib/skill-install.js` nutzt `cmd /c mklink /J` dafür.
`checkAliasIntegrity` erkennt Junctions über `fs.readlinkSync` (der Pfad hat
`\??\`-Präfix, der vor dem Vergleich normalisiert wird).
