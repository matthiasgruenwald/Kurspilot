#!/usr/bin/env bash
# Kurspilot-Bootstrap fuer macOS/Linux (Issue #125, siehe
# docs/adr/0008-curl-bootstrap-vertrieb.md). Einzeiler:
#
#   curl -fsSL https://raw.githubusercontent.com/matthiasgruenwald/Kurspilot/main/setup.sh | bash
#
# Henne-Ei: an dieser Stelle existiert noch kein Node, deshalb darf hier
# NICHT die volle Architektur-Tabelle aus lib/node-provision.js dupliziert
# werden - nur ein bewusst minimaler Inline-Fall fuer die zwei aktuell
# unterstuetzten OS/Arch-Kombinationen (macOS arm64/x64, Linux x64). Sobald
# diese Mindest-Node-Version laeuft, uebernimmt scripts/bootstrap-app.js
# (Node-seitig, volle DI/Tests) den Rest: App-Tarball holen/entpacken,
# scripts/setup-kurspilot.js starten.
#
# Ablageort des Kurspilot-eigenen Node (muss mit lib/node-provision.js
# getKurspilotNodeDir uebereinstimmen): ~/.kurspilot/node
set -euo pipefail

NODE_DIST_VERSION="v20.11.0"
KURSPILOT_HOME="${HOME}/.kurspilot"
KURSPILOT_NODE_DIR="${KURSPILOT_HOME}/node"
KURSPILOT_NODE_BIN="${KURSPILOT_NODE_DIR}/bin/node"
NODE_MIN_MAJOR_VERSION=18

log() {
  echo "[Kurspilot] $*"
}

# Schritt 1: bereits ein nutzbares Node? (Reihenfolge wie
# lib/node-provision.js resolveNodeBinary: Kurspilot-eigenes Node zuerst,
# dann System-Node, sonst Download.)
node_major_version() {
  "$1" --version 2>/dev/null | sed -E 's/^v([0-9]+)\..*/\1/'
}

resolve_node() {
  if [ -x "${KURSPILOT_NODE_BIN}" ]; then
    echo "${KURSPILOT_NODE_BIN}"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    local system_node
    system_node="$(command -v node)"
    local major
    major="$(node_major_version "${system_node}")"
    if [ -n "${major}" ] && [ "${major}" -ge "${NODE_MIN_MAJOR_VERSION}" ]; then
      echo "${system_node}"
      return 0
    fi
  fi

  return 1
}

# Schritt 2: kein nutzbares Node -> architektur-passendes offizielles
# Node-Tarball laden und nach ~/.kurspilot/node entpacken. Minimaler
# Inline-Fall (macOS arm64/x64, Linux x64) - siehe Datei-Kommentar oben.
download_node() {
  local os_name arch_name target
  os_name="$(uname -s)"
  arch_name="$(uname -m)"

  case "${os_name}-${arch_name}" in
    Darwin-arm64) target="darwin-arm64" ;;
    Darwin-x86_64) target="darwin-x64" ;;
    Linux-x86_64) target="linux-x64" ;;
    *)
      echo "[Kurspilot] Nicht unterstuetzte Plattform fuer automatischen Node-Download: ${os_name} ${arch_name}." >&2
      echo "[Kurspilot] Bitte Node.js >= ${NODE_MIN_MAJOR_VERSION} manuell installieren (https://nodejs.org) und setup.sh erneut ausfuehren." >&2
      exit 1
      ;;
  esac

  local url="https://nodejs.org/dist/${NODE_DIST_VERSION}/node-${NODE_DIST_VERSION}-${target}.tar.gz"
  log "Node.js wird automatisch geladen (${target})..."
  mkdir -p "${KURSPILOT_NODE_DIR}"
  curl -fsSL "${url}" | tar -xz -C "${KURSPILOT_NODE_DIR}" --strip-components=1
  echo "${KURSPILOT_NODE_BIN}"
}

log "Prüfe, ob Node.js vorhanden ist..."
NODE_BIN="$(resolve_node || true)"
if [ -z "${NODE_BIN}" ]; then
  log "Node.js fehlt, ich installiere es jetzt automatisch - das ist die Software, die das Lehrer-Tool zum Laufen braucht..."
  NODE_BIN="$(download_node)"
fi

log "Node.js bereit: ${NODE_BIN}"

# Schritt 3: App-Tarball (enthaelt scripts/bootstrap-app.js + lib/) muss
# vorhanden sein, BEVOR wir in Node wechseln - bootstrap-app.js braucht
# lib/app-provision.js aus genau diesem Tarball. Erstlauf: per curl/tar
# holen (gleiche Quelle/Ablageort wie lib/app-provision.js APP_TARBALL_URL/
# getKurspilotAppDir - bei Aenderung dort auch hier nachziehen). Danach
# uebernimmt scripts/bootstrap-app.js selbst alle weiteren Updates
# (idempotent per Hash-Marker, siehe lib/app-provision.js).
KURSPILOT_APP_DIR="${KURSPILOT_HOME}/app"
BOOTSTRAP_SCRIPT="${KURSPILOT_APP_DIR}/scripts/bootstrap-app.js"

if [ ! -f "${BOOTSTRAP_SCRIPT}" ]; then
  log "Richte das Tool ein - lade Kurspilot von github.com/matthiasgruenwald/Kurspilot (der offiziellen Quelle)..."
  mkdir -p "${KURSPILOT_APP_DIR}"
  curl -fsSL "https://github.com/matthiasgruenwald/Kurspilot/archive/refs/heads/main.tar.gz" \
    | tar -xz -C "${KURSPILOT_APP_DIR}" --strip-components=1
fi

exec "${NODE_BIN}" "${BOOTSTRAP_SCRIPT}"
