'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp-question-bank.js');

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
      return new Promise((resolve, reject) => {
        pending.push(resolve);
        child.once('error', reject);
        child.once('exit', (code) => {
          if (pending.length > 0) {
            reject(new Error(`Question-Bank-Server beendet vor Antwort mit Exit-Code ${code}.`));
          }
        });
      });
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

test('Fragensammlung-MCP exposes exactly the extracted question bank tools and keeps the explicit collection contract', async () => {
  const server = startServer();
  try {
    const tools = await listTools(server);
    const toolNames = tools.map(tool => tool.name);
    const ensureTool = tools.find(tool => tool.name === 'moodle_ensure_question_bank');
    const createCategoryTool = tools.find(tool => tool.name === 'moodle_create_question_category');
    const getCategoriesTool = tools.find(tool => tool.name === 'moodle_get_question_categories');
    const updateCategoryTool = tools.find(tool => tool.name === 'moodle_update_question_category');
    const createQuestionTool = tools.find(tool => tool.name === 'moodle_create_mc_question');
    const updateQuestionTool = tools.find(tool => tool.name === 'moodle_update_mc_question');
    const getQuestionTool = tools.find(tool => tool.name === 'moodle_get_question');

    assert.deepEqual(toolNames, [
      'moodle_ensure_question_bank',
      'moodle_create_question_category',
      'moodle_get_question_categories',
      'moodle_update_question_category',
      'moodle_create_mc_question',
      'moodle_update_mc_question',
      'moodle_get_question',
    ]);

    assert.deepEqual(ensureTool.inputSchema.required, ['courseid', 'name']);
    assert.ok(createCategoryTool.inputSchema.required.includes('questionbankid'));
    assert.ok(getCategoriesTool.inputSchema.required.includes('questionbankid'));
    assert.ok(updateCategoryTool.inputSchema.required.includes('questionbankid'));
    assert.ok(updateCategoryTool.inputSchema.required.includes('categoryid'));
    assert.ok(createQuestionTool.inputSchema.required.includes('categoryid'));
    assert.ok(updateQuestionTool.inputSchema.required.includes('questionid'));
    assert.deepEqual(getQuestionTool.inputSchema.required, ['categoryid']);
  } finally {
    server.stop();
  }
});

test('Fragensammlung-MCP read-only profile exposes only the read tools and rejects write calls', async () => {
  const server = startServer({ profile: 'readonly' });
  try {
    const tools = await listTools(server);
    assert.deepEqual(tools.map(tool => tool.name), [
      'moodle_get_question_categories',
      'moodle_get_question',
    ]);

    const response = await server.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'moodle_ensure_question_bank',
        arguments: { courseid: 1, name: 'QB' },
      },
    });

    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /read-only/);
  } finally {
    server.stop();
  }
});

test('Quiz-MCP and Fragensammlung-MCP declare structural dependency metadata via initialize', async () => {
  const questionBankServer = startServer();
  const quizServer = startServer();
  const quizPath = path.join(__dirname, '..', 'moodle-mcp-quiz.js');

  questionBankServer.stop();
  quizServer.stop();

  const [questionBankResponse, quizResponse] = await Promise.all([
    initializeServer(SERVER_PATH),
    initializeServer(quizPath),
  ]);

  assert.deepEqual(questionBankResponse.result.serverInfo.activityMcp, {
    id: 'fragensammlung',
    label: 'Fragensammlung',
    dependsOn: [],
    independentlyLoadable: true,
  });

  assert.deepEqual(quizResponse.result.serverInfo.activityMcp, {
    id: 'quiz',
    label: 'Quiz',
    dependsOn: ['fragensammlung'],
    independentlyLoadable: false,
  });
});

function initializeServer(serverPath) {
  const child = spawn('node', [serverPath], {
    env: {
      ...process.env,
      MOODLE_URL: 'https://example.test/moodle',
      MOODLE_TOKEN: 'dummy-token',
    },
  });

  return new Promise((resolve, reject) => {
    let stdoutBuffer = '';
    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        child.stdin.end();
        resolve(JSON.parse(line));
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server ${serverPath} beendet ohne initialize-Antwort mit Exit-Code ${code}.`)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })}\n`);
  });
}
