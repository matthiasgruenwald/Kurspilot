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

test('upload_assignfile tolerates assignments without introattachments property', () => {
  const source = fs.readFileSync(UPLOAD_ASSIGNFILE_PATH, 'utf8');

  assert.doesNotMatch(source, /empty\(\$assign->introattachments\)/);
  assert.match(source, /isset\(\$assign->introattachments\)/);
});

test('upload_assignfile determines the MIME type from decoded file content', () => {
  const source = fs.readFileSync(UPLOAD_ASSIGNFILE_PATH, 'utf8');

  assert.match(source, /finfo_buffer\(new \\finfo\(FILEINFO_MIME_TYPE\), \$filedata\)/);
  assert.match(source, /'mimetype'\s*=>\s*\$detectedmimetype/);
});
