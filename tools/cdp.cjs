/*
 * 极小 CDP 客户端 + 静态文件服务器（零依赖，Node ≥ 22）
 *
 * 为什么需要它：本 demo 集有两类东西**只能**在真实浏览器里验证 ——
 *   1. wordcloud / label 变换要真实 canvas 位图（Node 无 node-canvas，跑不了）；
 *   2. PNG 导出走 canvas.toDataURL，同样需要真实 canvas。
 * 而项目铁律是"零 npm 依赖"。Node 22 自带 fetch 与 WebSocket，于是 CDP 客户端
 * 可以手写 ~150 行搞定，浏览器用系统里现成的 Chromium/Chrome。
 *
 * 用法（见 validate-browser.cjs / export.cjs）：
 *   const { serve, launch } = require('./cdp.cjs');
 *   const server  = await serve(root, 0);            // 端口 0 = 自动挑空闲端口
 *   const browser = await launch();                  // 起 headless chromium + 连 CDP
 *   const page    = await browser.newPage();
 *   await page.goto(server.url + '/demos/01-bar-chart/index.html');
 *   await page.waitForFunction('window.__sceneReady === true');
 *   const r = await page.eval('window.__vegaExport({format:"png"})');
 *   await browser.close(); server.close();
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

/* ---------------------------------------------------------------- 静态服务器 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8'
};

/* 起一个只读静态服务器；端口传 0 让内核挑一个空闲端口 */
function serve(root, port) {
  root = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
      catch (e) { res.writeHead(400).end('bad url'); return; }
      if (rel.endsWith('/')) rel += 'index.html';
      // 浏览器总会顺手要一次 favicon；回 204 免得污染"页面无 console error"这条断言
      if (rel === '/favicon.ico') { res.writeHead(204).end(); return; }
      const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404).end('not found: ' + rel); return; }
        res.writeHead(200, {
          'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-store'
        });
        res.end(buf);
      });
    });
    server.on('error', reject);
    server.listen(port || 0, '127.0.0.1', () => {
      const p = server.address().port;
      resolve({
        port: p,
        url: `http://127.0.0.1:${p}`,
        close: () => new Promise(r => server.close(r))
      });
    });
  });
}

/* ------------------------------------------------------------------ 找浏览器 */

const CHROME_CANDIDATES = [
  process.env.CHROME, process.env.CHROMIUM,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'
];

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    if (!c) continue;
    if (c.includes('/')) { if (fs.existsSync(c)) return c; continue; }
    try { return execFileSync('which', [c], { encoding: 'utf8' }).trim(); } catch (e) { /* 没装，继续找 */ }
  }
  return null;
}

/* ------------------------------------------------------------------ CDP 连接 */

class Connection {
  constructor(ws) {
    this._ws = ws;
    this._id = 0;
    this._pending = new Map();
    this._listeners = [];
    ws.addEventListener('message', ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id != null && this._pending.has(msg.id)) {
        const { resolve, reject } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}${msg.error.data ? ' — ' + msg.error.data : ''}`));
        else resolve(msg.result);
      } else if (msg.method) {
        this._listeners.forEach(fn => fn(msg));
      }
    });
    ws.addEventListener('close', () => {
      this._pending.forEach(({ reject }) => reject(new Error('CDP 连接已关闭')));
      this._pending.clear();
    });
  }

  send(method, params, sessionId) {
    const id = ++this._id;
    const payload = { id, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      try { this._ws.send(JSON.stringify(payload)); }
      catch (e) { this._pending.delete(id); reject(e); }
    });
  }

  onEvent(fn) { this._listeners.push(fn); }
  close() { try { this._ws.close(); } catch (e) { /* 已关就算了 */ } }
}

class Page {
  constructor(conn, targetId, sessionId) {
    this._conn = conn;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.console = [];        // [{level, text}]
    this.exceptions = [];     // [string]
  }

  async _init() {
    await this._conn.send('Runtime.enable', {}, this.sessionId);
    await this._conn.send('Page.enable', {}, this.sessionId);
    await this._conn.send('Log.enable', {}, this.sessionId);
    this._conn.onEvent(msg => {
      if (msg.sessionId !== this.sessionId) return;
      if (msg.method === 'Runtime.consoleAPICalled') {
        const t = msg.params.type;
        if (t === 'error' || t === 'warning' || t === 'assert') {
          this.console.push({ level: t, text: (msg.params.args || []).map(argText).join(' ') });
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        this.exceptions.push(d.exception && d.exception.description ? d.exception.description : (d.text || 'unknown'));
      } else if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry || {};
        if (e.level === 'error') this.console.push({ level: 'error', text: `${e.source}: ${e.text}` });
      }
    });
  }

  clearLogs() { this.console.length = 0; this.exceptions.length = 0; }

  async setViewport(width, height, deviceScaleFactor) {
    await this._conn.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: deviceScaleFactor || 1, mobile: false
    }, this.sessionId);
  }

  async goto(url) {
    await this._conn.send('Page.navigate', { url }, this.sessionId);
    await this.waitForFunction('document.readyState === "complete"', 20000);
  }

  /* 求值一个 JS 表达式；Promise 会被 await，返回值按 JSON 深拷贝取回 */
  async eval(expression, { timeout = 30000 } = {}) {
    const r = await this._conn.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, timeout
    }, this.sessionId);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面内求值抛错: ' + (d.exception && d.exception.description || d.text));
    }
    return r.result ? r.result.value : undefined;
  }

  /* 轮询等待某个表达式为真 */
  async waitForFunction(expression, timeout = 20000, interval = 100) {
    const deadline = Date.now() + timeout;
    for (;;) {
      let ok = false;
      try { ok = await this.eval(`!!(${expression})`); } catch (e) { ok = false; }
      if (ok) return true;
      if (Date.now() > deadline) throw new Error(`等待超时（${timeout}ms）: ${expression}`);
      await new Promise(r => setTimeout(r, interval));
    }
  }

  async screenshot({ fullPage = false } = {}) {
    const params = { format: 'png' };
    if (fullPage) params.captureBeyondViewport = true;
    const r = await this._conn.send('Page.captureScreenshot', params, this.sessionId);
    return Buffer.from(r.data, 'base64');
  }

  async close() {
    try { await this._conn.send('Target.closeTarget', { targetId: this.targetId }); } catch (e) { /* 已关 */ }
  }
}

function argText(a) {
  if (a == null) return 'null';
  if (a.value !== undefined) return String(a.value);
  if (a.description) return a.description;
  if (a.unserializableValue) return a.unserializableValue;
  return a.type || '?';
}

class Browser {
  constructor(conn, proc, userDataDir) {
    this._conn = conn;
    this._proc = proc;
    this._userDataDir = userDataDir;
  }

  async newPage(width, height) {
    const { targetId } = await this._conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this._conn.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this._conn, targetId, sessionId);
    await page._init();
    if (width && height) await page.setViewport(width, height, 1);
    return page;
  }

  async close() {
    try { await this._conn.send('Browser.close'); } catch (e) { /* 可能已经退了 */ }
    this._conn.close();
    if (this._proc) {
      try { this._proc.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
    if (this._userDataDir) {
      try { fs.rmSync(this._userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  }
}

/*
 * 连一个已经在跑的 CDP 端点（如 http://127.0.0.1:9222）。
 */
async function connectTo(endpoint) {
  const res = await fetch(endpoint.replace(/\/$/, '') + '/json/version');
  const info = await res.json();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('无法连接 CDP websocket: ' + info.webSocketDebuggerUrl)), { once: true });
  });
  return new Browser(new Connection(ws), null, null);
}

/*
 * 起一个 headless Chromium 并连上。
 *   CDP_ENDPOINT=http://host:9222   直接复用已有浏览器，不再自己启
 *   CHROME=/path/to/chrome          指定浏览器可执行文件
 */
async function launch({ headless = true } = {}) {
  if (process.env.CDP_ENDPOINT) return connectTo(process.env.CDP_ENDPOINT);

  const bin = findChrome();
  if (!bin) {
    throw new Error(
      '找不到 Chromium/Chrome。装一个（Debian: apt install chromium），'
      + '或用 CHROME=/path/to/chrome 指定，'
      + '或用 CDP_ENDPOINT=http://127.0.0.1:9222 复用已有浏览器。'
    );
  }
  const userDataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vega-examples-cdp-'));
  const args = [
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking',
    '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank'
  ];
  if (headless) args.unshift('--headless=new');

  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('浏览器启动超时（30s）\n' + stderr)), 30000);
    const onData = chunk => {
      stderr += chunk;
      const m = /ws:\/\/[^\s]+/.exec(stderr);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
    proc.on('exit', code => { clearTimeout(timer); reject(new Error(`浏览器退出（code=${code}）\n${stderr}`)); });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('无法连接 CDP websocket: ' + wsUrl)), { once: true });
  });
  return new Browser(new Connection(ws), proc, userDataDir);
}

/* --------------------------------------------------- PNG 解码（校验透明背景） */

/*
 * 只为回答一个问题：导出的 PNG **真的**有 alpha 通道，且指定像素真的是全透明吗？
 * 用 zlib（Node 内建）解 IDAT、按 PNG 规范反滤波，够用且零依赖。
 * 返回 { width, height, colorType, bitDepth, hasAlpha, pixel(x, y) → [r,g,b,a] }
 */
function decodePng(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('不是 PNG（signature 不符）');

  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12]
      };
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (!ihdr) throw new Error('PNG 缺少 IHDR');
  if (ihdr.bitDepth !== 8) throw new Error('只支持 8 位深 PNG（实际 ' + ihdr.bitDepth + '）');
  if (ihdr.interlace) throw new Error('不支持隔行 PNG');

  const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const ch = CHANNELS[ihdr.colorType];
  if (!ch) throw new Error('不支持的 colorType: ' + ihdr.colorType);

  const raw = require('zlib').inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * ch;
  const out = Buffer.alloc(stride * height);

  // 反滤波：PNG 每行首字节是 filter type，参考 RFC 2083 §6
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= ch ? prior[i - ch] : 0;
      let v = line[i];
      switch (ft) {
        case 0: break;
        case 1: v = v + a; break;
        case 2: v = v + b; break;
        case 3: v = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error('未知 PNG filter type: ' + ft);
      }
      cur[i] = v & 0xff;
    }
  }

  const hasAlpha = ihdr.colorType === 4 || ihdr.colorType === 6;
  return {
    width, height, bitDepth: ihdr.bitDepth, colorType: ihdr.colorType, hasAlpha,
    pixel(x, y) {
      const i = y * stride + x * ch;
      if (ihdr.colorType === 6) return [out[i], out[i + 1], out[i + 2], out[i + 3]];
      if (ihdr.colorType === 2) return [out[i], out[i + 1], out[i + 2], 255];
      if (ihdr.colorType === 4) return [out[i], out[i], out[i], out[i + 1]];
      return [out[i], out[i], out[i], 255];
    }
  };
}

module.exports = { serve, launch, connectTo, findChrome, decodePng };
