const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const UPLOAD_ASSIGNFILE_PATH = path.join(
  __dirname,
  '..',
  'Plugin',
  'src',
  'local_coursepilot',
  'classes',
  'external',
  'upload_assignfile.php'
);

test('upload_assignfile nutzt das Moodle-5.0-Dateischema ohne assign-Tabellenspalten', () => {
  const source = fs.readFileSync(UPLOAD_ASSIGNFILE_PATH, 'utf8');

  assert.doesNotMatch(source, /\$assign->introattachments/);
  assert.doesNotMatch(source, /set_field\(\s*'assign',\s*'introattachments/);
  assert.match(source, /'filearea'\s*=>\s*'introattachment'/);
  assert.match(source, /'itemid'\s*=>\s*0/);
});

test('upload_assignfile determines the MIME type from decoded file content', () => {
  const source = fs.readFileSync(UPLOAD_ASSIGNFILE_PATH, 'utf8');

  assert.match(source, /finfo_buffer\(new \\finfo\(FILEINFO_MIME_TYPE\), \$filedata\)/);
  assert.match(source, /'mimetype'\s*=>\s*\$detectedmimetype/);
});
