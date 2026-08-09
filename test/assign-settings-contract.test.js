const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ASSIGN_TOOLS } = require('../lib/assign-tools');
const fs = require('node:fs');
const path = require('node:path');

function tool(name) {
  return ASSIGN_TOOLS.find(candidate => candidate.name === name);
}

test('moodle_create_assign exposes and forwards the exercise preset with explicit attempt overrides', async () => {
  const createAssign = tool('moodle_create_assign');
  assert.ok(createAssign);

  const properties = createAssign.inputSchema.properties;
  assert.deepEqual(properties.mode.enum, ['standard', 'übung']);
  assert.ok(properties.grade);
  assert.ok(properties.submissiondrafts);
  assert.ok(properties.maxattempts);
  assert.deepEqual(properties.attemptreopenmethod.enum, ['manual', 'automatic', 'untilpass']);

  const calls = [];
  await createAssign.handler({
    courseid: 20,
    sectionnum: 1,
    name: 'Übungsraum',
    mode: 'übung',
    grade: 0,
    submissiondrafts: 0,
    maxattempts: -1,
    attemptreopenmethod: 'manual',
  }, async (functionName, args) => {
    calls.push([functionName, args]);
    return { cmid: 1024 };
  });

  assert.deepEqual(calls, [[
    'local_coursepilot_create_assign',
    {
      courseid: 20,
      sectionnum: 1,
      name: 'Übungsraum',
      description: '',
      duedate: 0,
      maxfiles: 1,
      visible: 1,
      mode: 'übung',
      grade: 0,
      submissiondrafts: 0,
      maxattempts: -1,
      attemptreopenmethod: 'manual',
    },
  ]]);
});

test('assignment create and update share snapshot patch settings and Moodle module lifecycle', () => {
  const pluginRoot = path.join(__dirname, '..', 'Plugin', 'src', 'local_coursepilot', 'classes');
  const createSource = fs.readFileSync(path.join(pluginRoot, 'external', 'create_assign.php'), 'utf8');
  const updateSource = fs.readFileSync(path.join(pluginRoot, 'external', 'update_assign.php'), 'utf8');

  assert.match(createSource, /assign_settings::create_moduleinfo/);
  assert.match(updateSource, /assign_settings::snapshot\(\$cm, \$course\)/);
  assert.match(updateSource, /assign_settings::patch/);
  assert.match(updateSource, /update_moduleinfo\(\$cm, \$moduleinfo, \$course\)/);
  assert.doesNotMatch(updateSource, /\$DB->update_record\(\s*'assign'/);
  assert.doesNotMatch(updateSource, /\$DB->set_field\(\s*'course_modules'/);
});

test('exercise preset is ungraded, editable and accepts explicit overrides', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Plugin', 'src', 'local_coursepilot', 'classes', 'assign_settings.php'), 'utf8');

  assert.match(source, /\$moduleinfo->grade = \$params\['mode'\] === 'übung' \? 0 : 100/);
  assert.match(source, /\$moduleinfo->submissiondrafts = 0/);
  assert.match(source, /\$moduleinfo->assignfeedback_comments_enabled = 1/);
  assert.match(source, /if \(\(\$params\['grade'\] \?\? -1\) >= 0\)/);
  assert.match(source, /if \(\(\$params\['submissiondrafts'\] \?\? -1\) >= 0\)/);
});

test('partial assignment updates retain the complete assignment and subplugin snapshot', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Plugin', 'src', 'local_coursepilot', 'classes', 'assign_settings.php'), 'utf8');

  assert.match(source, /get_moduleinfo_data\(\$cm, \$course\)/);
  assert.match(source, /get_records\('assign_plugin_config', \['assignment' => \$moduleinfo->id\]\)/);
  assert.match(source, /\$config->subtype . '_' . \$config->plugin . '_' . \$config->name/);
});

test('assignment responses and fresh catalog reads expose stored base settings', () => {
  const pluginRoot = path.join(__dirname, '..', 'Plugin', 'src', 'local_coursepilot', 'classes');
  const helper = fs.readFileSync(path.join(pluginRoot, 'assign_settings.php'), 'utf8');
  const catalog = fs.readFileSync(path.join(pluginRoot, 'external', 'get_course_catalog.php'), 'utf8');

  for (const field of ['grade', 'submissiondrafts', 'maxattempts', 'attemptreopenmethod', 'visible']) {
    assert.match(helper, new RegExp(`'${field}'`));
    assert.match(catalog, new RegExp(`'${field}'`));
  }
});
