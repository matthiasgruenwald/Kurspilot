'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp.js');
const WRITE_TOOL_PATTERN = /_(create|update|set|upload|add|ensure|embed|crop)_?/;

function startServer({ profile } = {}) {
  const child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      MOODLE_URL: 'https://example.test/moodle',
      MOODLE_TOKEN: 'dummy-token',
      ...(profile ? { MOODLE_MCP_PROFILE: profile } : {}),
    },
  });

  let stdoutBuffer = '';
  const pending = [];

  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const next = pending.shift();
      if (next) next(JSON.parse(line));
    }
  });

  return {
    request(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return new Promise(resolve => pending.push(resolve));
    },
    stop() {
      child.stdin.end();
    },
  };
}

async function listToolNames(server) {
  const response = await server.request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  return response.result.tools.map(tool => tool.name);
}

async function listTools(server) {
  const response = await server.request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  return response.result.tools;
}

test('read-only Moodle MCP profile exposes only read tools in tools/list', async () => {
  const server = startServer({ profile: 'readonly' });
  try {
    const toolNames = await listToolNames(server);

    // Reihenfolge spiegelt TOOLS-Array: Aktivitaets-Tools zuerst, dann
    // Core-Tools (Issue #89, ADR 0007) am Ende des Arrays.
    assert.deepEqual(toolNames, [
      'moodle_get_question_categories',
      'moodle_get_question',
      'moodle_get_modules',
      'moodle_get_course_catalog',
      'moodle_get_sections',
    ]);
    assert.equal(toolNames.some(name => WRITE_TOOL_PATTERN.test(name)), false);
  } finally {
    server.stop();
  }
});

test('full Moodle MCP profile keeps existing write tools visible in tools/list', async () => {
  const server = startServer();
  try {
    const toolNames = await listToolNames(server);

    assert.ok(toolNames.includes('moodle_create_page'));
    assert.ok(toolNames.includes('moodle_update_page'));
    assert.ok(toolNames.includes('moodle_set_completion'));
    assert.ok(toolNames.includes('moodle_upload_assignfile'));
    assert.ok(toolNames.includes('moodle_add_questions_to_quiz'));
    assert.ok(toolNames.includes('moodle_update_quiz_settings'));
    assert.ok(toolNames.includes('moodle_ensure_question_bank'));
    assert.ok(toolNames.includes('moodle_update_question_category'));
  } finally {
    server.stop();
  }
});

test('quiz tools expose only the new Kurspilot quiz modes as native schema values', async () => {
  const server = startServer();
  try {
    const tools = await listTools(server);
    const createQuiz = tools.find(tool => tool.name === 'moodle_create_quiz');
    const updateQuiz = tools.find(tool => tool.name === 'moodle_update_quiz_settings');

    assert.ok(createQuiz, 'moodle_create_quiz should be exposed');
    assert.ok(updateQuiz, 'moodle_update_quiz_settings should be exposed');

    assert.deepEqual(createQuiz.inputSchema.properties.mode.enum, [
      'mini-check',
      'lernstandscheck',
      'abschlusstest',
    ]);
    assert.deepEqual(updateQuiz.inputSchema.properties.mode.enum, [
      'mini-check',
      'lernstandscheck',
      'abschlusstest',
    ]);
    assert.equal(createQuiz.inputSchema.properties.mode.default, 'lernstandscheck');
    assert.equal(updateQuiz.inputSchema.properties.mode.default, 'lernstandscheck');
    assert.equal(updateQuiz.inputSchema.required.includes('cmid'), true);
  } finally {
    server.stop();
  }
});

test('question bank tools require an explicit named collection selection', async () => {
  const server = startServer();
  try {
    const tools = await listTools(server);
    const ensureTool = tools.find(tool => tool.name === 'moodle_ensure_question_bank');
    const createCategoryTool = tools.find(tool => tool.name === 'moodle_create_question_category');
    const getCategoriesTool = tools.find(tool => tool.name === 'moodle_get_question_categories');
    const updateCategoryTool = tools.find(tool => tool.name === 'moodle_update_question_category');

    assert.ok(ensureTool, 'moodle_ensure_question_bank should be exposed');
    assert.ok(createCategoryTool, 'moodle_create_question_category should stay exposed');
    assert.ok(getCategoriesTool, 'moodle_get_question_categories should stay exposed');
    assert.ok(updateCategoryTool, 'moodle_update_question_category should be exposed');

    assert.deepEqual(ensureTool.inputSchema.required, ['courseid', 'name']);
    assert.ok(Object.hasOwn(createCategoryTool.inputSchema.properties, 'questionbankid'));
    assert.ok(createCategoryTool.inputSchema.required.includes('questionbankid'));
    assert.ok(Object.hasOwn(getCategoriesTool.inputSchema.properties, 'questionbankid'));
    assert.ok(getCategoriesTool.inputSchema.required.includes('questionbankid'));
    assert.ok(Object.hasOwn(updateCategoryTool.inputSchema.properties, 'questionbankid'));
    assert.ok(updateCategoryTool.inputSchema.required.includes('questionbankid'));
    assert.ok(updateCategoryTool.inputSchema.required.includes('categoryid'));
  } finally {
    server.stop();
  }
});

test('read-only Moodle MCP profile rejects write tool calls even if called by name', async () => {
  const server = startServer({ profile: 'readonly' });
  try {
    const response = await server.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'moodle_create_page',
        arguments: { courseid: 1, sectionnum: 0, name: 'x', content: 'x' },
      },
    });

    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /read-only/);
  } finally {
    server.stop();
  }
});
