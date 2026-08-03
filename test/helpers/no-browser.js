'use strict';

const childProcess = require('node:child_process');

// Die Test-Suite darf keine sichtbaren Browserfenster der interaktiven
// Ersteinrichtung oder andere GUI-Dialoge öffnen. Browser- und
// Betriebssystemaufrufe werden in den betroffenen Tests weiterhin über
// injizierte Fakes geprüft.
process.env.KURSPILOT_NO_BROWSER = '1';

// Node-Kindprozesse (etwa die echte Bootstrap-Kette im Integrationstest)
// laden dieselbe Sperre erneut. Bash-/PowerShell-Zwischenprozesse vererben
// NODE_OPTIONS an ihren anschließenden Node-Aufruf.
const preloadOption = `--require "${__filename}"`;
if (!process.env.NODE_OPTIONS?.includes(__filename)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preloadOption].filter(Boolean).join(' ');
}

function isGuiCommand(command, args = []) {
  return command === 'open' ||
    command === 'xdg-open' ||
    command === 'osascript' ||
    (command === 'cmd' && args[0] === '/c' && args[1] === 'start');
}

function blockGuiCommand(command, args) {
  if (isGuiCommand(command, args)) {
    throw new Error(`GUI-Befehl im Test blockiert: ${command}`);
  }
}

for (const methodName of ['execFile', 'execFileSync', 'spawn', 'spawnSync']) {
  const original = childProcess[methodName];
  childProcess[methodName] = (command, args, ...rest) => {
    blockGuiCommand(command, args);
    return original(command, args, ...rest);
  };
}
