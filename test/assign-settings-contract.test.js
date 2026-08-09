const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ASSIGN_TOOLS } = require('../lib/assign-tools');

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
