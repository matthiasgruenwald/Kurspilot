'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseWorkspaceFolder,
  parseArgs,
  promptActivitySelection,
  promptWorkspaceSelection,
} = require('../scripts/setup-kurspilot');

test('parseArgs liest Aktivitaetsauswahl fuer nicht-interaktives Setup', () => {
  const args = parseArgs([
    '--non-interactive',
    '--clients', 'codex',
    '--activities', 'Textfeld,Test',
  ]);

  assert.deepStrictEqual(args.activities, ['Textfeld', 'Test']);
});

test('promptActivitySelection nutzt menschenlesbare Mehrfachauswahl und loest Abhaengigkeiten auf', () => {
  const result = promptActivitySelection({
    osascriptFn: script => {
      assert.match(script, /Seite/);
      assert.match(script, /Test/);
      assert.doesNotMatch(script, /page,quiz/);
      return 'Test';
    },
  });

  assert.deepStrictEqual(result, ['quiz', 'fragensammlung']);
});

test('promptWorkspaceSelection bestaetigt den vorgeschlagenen Standard-Arbeitsbereich direkt', () => {
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
    osascriptFn: () => 'Anderen Ordner waehlen',
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
