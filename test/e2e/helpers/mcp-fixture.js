'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER_SCRIPT = path.resolve(__dirname, '..', '..', '..', 'moodle-mcp.js');

class McpFixture {
  constructor(moodleUrl, moodleToken) {
    this._moodleUrl = moodleUrl;
    this._moodleToken = moodleToken;
    this._proc = null;
    this._nextId = 1;
    this._pending = new Map();
    this._buffer = '';
  }

  async start() {
    this._proc = spawn(process.execPath, [SERVER_SCRIPT], {
      env: {
        ...process.env,
        MOODLE_URL: this._moodleUrl,
        MOODLE_TOKEN: this._moodleToken,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this._proc.stdout.setEncoding('utf8');
    this._proc.stdout.on('data', chunk => this._onData(chunk));
    this._proc.stderr.setEncoding('utf8');

    this._proc.on('error', err => {
      for (const { reject } of this._pending.values()) reject(err);
      this._pending.clear();
    });

    this._proc.on('exit', code => {
      const err = new Error(`MCP server exited with code ${code}`);
      for (const { reject } of this._pending.values()) reject(err);
      this._pending.clear();
    });

    await this._send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '1.0.0' },
    });
  }

  async callTool(name, args) {
    const result = await this._send('tools/call', { name, arguments: args });
    const content = result.content;
    if (result.isError) {
      throw new Error(content && content[0] ? content[0].text : 'MCP tool error');
    }
    if (content && content[0] && content[0].type === 'text') {
      return JSON.parse(content[0].text);
    }
    return result;
  }

  stop() {
    if (this._proc) {
      this._proc.stdin.end();
      this._proc.kill();
      this._proc = null;
    }
  }

  _send(method, params) {
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this._proc.stdin.write(msg);
    });
  }

  _onData(chunk) {
    this._buffer += chunk;
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const entry = this._pending.get(msg.id);
      if (!entry) continue;
      this._pending.delete(msg.id);
      if (msg.error) {
        entry.reject(new Error(msg.error.message));
      } else {
        entry.resolve(msg.result);
      }
    }
  }
}

module.exports = { McpFixture };
