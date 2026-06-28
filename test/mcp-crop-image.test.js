'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const { isImageMagickAvailable, isSipsAvailable } = require('../lib/image-crop');

const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp.js');
const SKIP_REASON = 'ImageMagick ("convert") ist auf diesem System nicht installiert (siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md)';
// Auf macOS nutzt cropImage() jetzt "sips" (Issue #135), Windows/Linux bleiben bei ImageMagick.
const hasCropTool = os.platform() === 'darwin' ? isSipsAvailable() : isImageMagickAvailable();

function startServer() {
  const child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      MOODLE_URL: 'https://example.test/moodle',
      MOODLE_TOKEN: 'dummy-token',
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

function writeTestPng(filePath, width, height) {
  const bytesPerPixel = 3;
  const raw = Buffer.alloc(height * (1 + width * bytesPerPixel));
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0;
    for (let x = 0; x < width; x++) {
      raw[pos++] = (x * 251) % 256;
      raw[pos++] = (y * 251) % 256;
      raw[pos++] = 100;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  fs.writeFileSync(filePath, Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

test('MCP exposes a local image crop tool', async () => {
  const server = startServer();
  try {
    const response = await server.request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const toolNames = response.result.tools.map(tool => tool.name);

    assert.ok(toolNames.includes('moodle_crop_image'));
  } finally {
    server.stop();
  }
});

test(
  'moodle_crop_image crops a local image before upload',
  { skip: !hasCropTool && SKIP_REASON },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-crop-image-test-'));
    const sourcePath = path.join(dir, 'source.png');
    const destPath = path.join(dir, 'crop.png');
    writeTestPng(sourcePath, 10, 10);

    const server = startServer();
    try {
      const response = await server.request({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'moodle_crop_image',
          arguments: {
            sourcepath: sourcePath,
            destpath: destPath,
            x: 2,
            y: 1,
            width: 4,
            height: 3,
          },
        },
      });

      assert.strictEqual(response.result.isError, undefined);
      const payload = JSON.parse(response.result.content[0].text);
      assert.strictEqual(payload.filepath, destPath);
      assert.strictEqual(payload.filename, 'crop.png');
      assert.deepStrictEqual(readPngSize(destPath), { width: 4, height: 3 });
    } finally {
      server.stop();
    }
  }
);
