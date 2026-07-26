'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseWorkspaceFolder,
  parseArgs,
  promptWorkspaceSelection,
  reportToText,
} = require('../scripts/setup-kurspilot');

const { OFFICIAL_INSTALL_LINKS } = require('../lib/client-registry');

test('parseArgs erkennt den After-Install-Startmodus', () => {
  const result = parseArgs(['--after-install']);

  assert.equal(result.afterInstall, true);
});

test('reportToText listet im Blocker die Installationslinks aller Clients inkl. opencode (Issue #183)', () => {
  const text = reportToText({ blocked: true, installLinks: OFFICIAL_INSTALL_LINKS });

  assert.match(text, /codex: https:\/\//);
  assert.match(text, /claude: https:\/\//);
  assert.match(text, /opencode: https:\/\/opencode\.ai/);
});

test('promptWorkspaceSelection bestätigt den vorgeschlagenen Standard-Arbeitsbereich direkt', () => {
  const defaultPath = '/Users/test/Documents/Kurspilot';

  const result = promptWorkspaceSelection(defaultPath, {
    osascriptFn: () => 'Standard verwenden',
  });

  assert.deepStrictEqual(result, {
    workspacePath: defaultPath,
    confirmed: true,
  });
});

test('promptWorkspaceSelection delegiert bei Ordnerwahl an den Ordnerdialog', () => {
  const defaultPath = '/Users/test/Documents/Kurspilot';
  let delegatedPath = null;

  const result = promptWorkspaceSelection(defaultPath, {
    osascriptFn: () => 'Anderen Ordner wählen',
    chooseWorkspaceFolderFn: selectedDefaultPath => {
      delegatedPath = selectedDefaultPath;
      return {
        workspacePath: '/Users/test/Library/Mobile Documents/com~apple~CloudDocs/Kurspilot',
        confirmed: true,
      };
    },
  });

  assert.strictEqual(delegatedPath, defaultPath);
  assert.deepStrictEqual(result, {
    workspacePath: '/Users/test/Library/Mobile Documents/com~apple~CloudDocs/Kurspilot',
    confirmed: true,
  });
});

test('chooseWorkspaceFolder nutzt bei nicht existierendem Ziel den vorhandenen Elternordner als Default-Location', () => {
  let script = '';

  const result = chooseWorkspaceFolder('/Users/test/Documents/Kurspilot', {
    osascriptFn: currentScript => {
      script = currentScript;
      return '/Users/test/Documents/\n';
    },
  });

  assert.match(script, /POSIX file "\/Users\/test\/Documents"/);
  assert.deepStrictEqual(result, {
    workspacePath: '/Users/test/Documents/',
    confirmed: true,
  });
});
