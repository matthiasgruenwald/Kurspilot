# Kurspilot-Bootstrap fuer Windows (Issue #125, siehe
# docs/adr/0008-curl-bootstrap-vertrieb.md). Einzeiler:
#
#   powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/matthiasgruenwald/Kurspilot/main/setup.ps1 | iex"
#
# Henne-Ei: an dieser Stelle existiert noch kein Node, deshalb darf hier
# NICHT die volle Architektur-Tabelle aus lib/node-provision.js dupliziert
# werden - nur ein bewusst minimaler Inline-Fall fuer die zwei aktuell
# unterstuetzten Windows-Architekturen (x64, arm64). Sobald diese
# Mindest-Node-Version laeuft, uebernimmt scripts/bootstrap-app.js
# (Node-seitig, volle DI/Tests) den Rest: App-Tarball holen/entpacken,
# scripts/setup-kurspilot.js starten.
#
# Ablageort des Kurspilot-eigenen Node (muss mit lib/node-provision.js
# getKurspilotNodeDir uebereinstimmen): %LOCALAPPDATA%\Kurspilot\node

$ErrorActionPreference = "Stop"
# Ohne das hier rendert der Web-Download einen Fortschrittsbalken pro Paket -
# auf manchen Windows-Versionen so langsam, dass der Download wie aufgehaengt
# wirkt (bekannter PowerShell-5.1-Effekt, nicht netzwerkbedingt).
$ProgressPreference = "SilentlyContinue"

$NodeDistVersion = "v24.18.0"
$NodeMinMajorVersion = 24
$KurspilotHome = Join-Path $env:LOCALAPPDATA "Kurspilot"
$KurspilotNodeDir = Join-Path $KurspilotHome "node"
$KurspilotNodeBin = Join-Path $KurspilotNodeDir "node.exe"

function Write-KurspilotLog {
    param([string]$Message)
    Write-Host "[Kurspilot] $Message"
}

Write-KurspilotLog "Hinweis: Falls beim Ausfuehren eine Windows SmartScreen-Warnung erscheint - das ist normal bei einem noch unbekannten Download, kein Fehler. Einfach auf 'Mehr Informationen' und dann 'Trotzdem ausfuehren' klicken."

# Schritt 1: bereits ein nutzbares Node? (Reihenfolge wie
# lib/node-provision.js resolveNodeBinary: Kurspilot-eigenes Node zuerst,
# dann System-Node, sonst Download.)
function Resolve-KurspilotNode {
    if (Test-Path $KurspilotNodeBin) {
        return $KurspilotNodeBin
    }

    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($systemNode) {
        try {
            $versionOutput = & $systemNode.Source --version
            if ($versionOutput -match '^v(\d+)\.') {
                $major = [int]$Matches[1]
                if ($major -ge $NodeMinMajorVersion) {
                    return $systemNode.Source
                }
            }
        } catch {
            # System-Node nicht ausfuehrbar -> wie "nicht gefunden" behandeln.
        }
    }

    return $null
}

# Schritt 2: kein nutzbares Node -> architektur-passendes offizielles
# Node-Tarball laden und nach %LOCALAPPDATA%\Kurspilot\node entpacken.
# Minimaler Inline-Fall (Windows x64/arm64) - siehe Datei-Kommentar oben.
function Install-KurspilotNode {
    $archName = $env:PROCESSOR_ARCHITECTURE
    switch ($archName) {
        "AMD64" { $target = "win-x64" }
        "ARM64" { $target = "win-arm64" }
        default {
            Write-Error "[Kurspilot] Nicht unterstuetzte Architektur fuer automatischen Node-Download: $archName. Bitte Node.js >= $NodeMinMajorVersion manuell installieren (https://nodejs.org) und setup.ps1 erneut ausfuehren."
            exit 1
        }
    }

    $url = "https://nodejs.org/dist/$NodeDistVersion/node-$NodeDistVersion-$target.zip"
    Write-KurspilotLog "Node.js wird automatisch geladen ($target)..."

    New-Item -ItemType Directory -Force -Path $KurspilotHome | Out-Null
    $zipPath = Join-Path $env:TEMP "kurspilot-node.zip"
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

    $extractDir = Join-Path $env:TEMP "kurspilot-node-extract"
    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    # Node-Zip enthaelt einen versionierten Wurzelordner (node-vX.Y.Z-win-...);
    # dessen Inhalt nach KurspilotNodeDir verschieben (Aequivalent zu
    # --strip-components=1 unter macOS/Linux).
    $innerDir = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    if (Test-Path $KurspilotNodeDir) { Remove-Item -Recurse -Force $KurspilotNodeDir }
    Move-Item -Path $innerDir.FullName -Destination $KurspilotNodeDir

    Remove-Item -Force $zipPath
    Remove-Item -Recurse -Force $extractDir

    return $KurspilotNodeBin
}

Write-KurspilotLog "Pruefe, ob Node.js vorhanden ist..."
$NodeBin = Resolve-KurspilotNode
if (-not $NodeBin) {
    Write-KurspilotLog "Node.js fehlt, ich installiere es jetzt automatisch (von nodejs.org) - das ist die Software, die das Lehrer-Tool zum Laufen braucht..."
    $NodeBin = Install-KurspilotNode
}

Write-KurspilotLog "Node.js bereit: $NodeBin"

# Schritt 3: Aktuellen main-Tarball holen, nach
# %LOCALAPPDATA%\Kurspilot\app entpacken und daraus den Konfigurator starten.
$KurspilotAppDir = Join-Path $KurspilotHome "app"
$SetupScript = Join-Path $KurspilotAppDir "scripts\setup-kurspilot.js"

Write-KurspilotLog "Aktualisiere Kurspilot vom aktuellen main-Stand..."
New-Item -ItemType Directory -Force -Path $KurspilotAppDir | Out-Null
$appTarballPath = Join-Path $env:TEMP "kurspilot-app.tar.gz"
Invoke-WebRequest -Uri "https://github.com/matthiasgruenwald/moodle-coursepilot/archive/refs/heads/main.tar.gz" -OutFile $appTarballPath -UseBasicParsing
# tar.exe ist seit Windows 10 1803 systemeigen vorhanden (bsdtar).
& tar -xzf $appTarballPath -C $KurspilotAppDir --strip-components=1
if ($LASTEXITCODE -ne 0) {
    throw "[Kurspilot] Entpacken der aktuellen Kurspilot-Version fehlgeschlagen. Die vorhandene Installation wurde nicht gestartet."
}
Remove-Item -Force $appTarballPath

& $NodeBin $SetupScript --after-install
