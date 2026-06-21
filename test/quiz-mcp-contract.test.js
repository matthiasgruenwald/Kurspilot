'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp-quiz.js');

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

async function listTools(server) {
  const response = await server.request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  return response.result.tools;
}

test('Quiz-MCP exposes exactly the extracted quiz tools and keeps full quiz field schema', async () => {
  const server = startServer();
  try {
    const tools = await listTools(server);
    const toolNames = tools.map(tool => tool.name);
    const createQuiz = tools.find(tool => tool.name === 'moodle_create_quiz');
    const updateQuiz = tools.find(tool => tool.name === 'moodle_update_quiz_settings');
    const addQuestions = tools.find(tool => tool.name === 'moodle_add_questions_to_quiz');

    assert.deepEqual(toolNames, [
      'moodle_create_quiz',
      'moodle_update_quiz_settings',
      'moodle_add_questions_to_quiz',
    ]);

    assert.ok(createQuiz, 'moodle_create_quiz should be exposed');
    assert.ok(updateQuiz, 'moodle_update_quiz_settings should be exposed');
    assert.ok(addQuestions, 'moodle_add_questions_to_quiz should be exposed');

    assert.equal(createQuiz.inputSchema.required.includes('courseid'), true);
    assert.equal(createQuiz.inputSchema.required.includes('sectionnum'), true);
    assert.equal(createQuiz.inputSchema.required.includes('name'), true);
    assert.equal(updateQuiz.inputSchema.required.includes('cmid'), true);
    assert.equal(addQuestions.inputSchema.required.includes('questionids'), true);

    for (const fieldName of [
      'preferredbehaviour',
      'navmethod',
      'questionsperpage',
      'attempts',
      'completionpassgrade',
      'reviewoverallfeedback',
      'overallfeedbacktextpass',
      'overallfeedbacktextfail',
    ]) {
      assert.ok(
        Object.hasOwn(createQuiz.inputSchema.properties, fieldName),
        `create_quiz should expose ${fieldName}`
      );
      assert.ok(
        Object.hasOwn(updateQuiz.inputSchema.properties, fieldName),
        `update_quiz_settings should expose ${fieldName}`
      );
    }
  } finally {
    server.stop();
  }
});

test('Quiz-MCP read-only profile exposes no tools and rejects write calls by name', async () => {
  const server = startServer({ profile: 'readonly' });
  try {
    const tools = await listTools(server);
    assert.deepEqual(tools, []);

    const response = await server.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'moodle_create_quiz',
        arguments: { courseid: 1, sectionnum: 0, name: 'Quiz 1' },
      },
    });

    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /read-only/);
  } finally {
    server.stop();
  }
});
