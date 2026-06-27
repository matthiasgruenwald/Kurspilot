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

$NodeDistVersion = "v20.11.0"
$NodeMinMajorVersion = 18
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

# Schritt 3: App-Tarball (enthaelt scripts/bootstrap-app.js + lib/) muss
# vorhanden sein, BEVOR wir in Node wechseln - bootstrap-app.js braucht
# lib/app-provision.js aus genau diesem Tarball. Erstlauf: per
# Invoke-WebRequest + tar holen (gleiche Quelle/Ablageort wie
# lib/app-provision.js APP_TARBALL_URL/getKurspilotAppDir - bei Aenderung
# dort auch hier nachziehen). Danach uebernimmt scripts/bootstrap-app.js
# selbst alle weiteren Updates (idempotent per Hash-Marker).
$KurspilotAppDir = Join-Path $KurspilotHome "app"
$BootstrapScript = Join-Path $KurspilotAppDir "scripts\bootstrap-app.js"

if (-not (Test-Path $BootstrapScript)) {
    Write-KurspilotLog "Richte das Tool ein - lade Kurspilot von github.com/matthiasgruenwald/Kurspilot (der offiziellen Quelle)..."
    New-Item -ItemType Directory -Force -Path $KurspilotAppDir | Out-Null
    $appTarballPath = Join-Path $env:TEMP "kurspilot-app.tar.gz"
    Invoke-WebRequest -Uri "https://github.com/matthiasgruenwald/Kurspilot/archive/refs/heads/main.tar.gz" -OutFile $appTarballPath -UseBasicParsing
    # tar.exe ist seit Windows 10 1803 systemeigen vorhanden (bsdtar).
    & tar -xzf $appTarballPath -C $KurspilotAppDir --strip-components=1
    Remove-Item -Force $appTarballPath
}

& $NodeBin $BootstrapScript
