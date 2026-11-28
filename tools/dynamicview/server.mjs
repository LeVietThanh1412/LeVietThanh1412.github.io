import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { networkInterfaces } from 'node:os';
import { basename, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { listDemos } from './scripts/demo-library.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const data = resolve(process.env.DATA_DIR || join(root, '.data'));
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const tlsPort = Number(process.env.HTTPS_PORT || 4443);
const maxBytes = 1024 ** 3;
const extensions = new Set(['ply', 'glb', 'usdz', 'splat', 'ksplat', 'spz']);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary', '.usdz': 'model/vnd.usdz+zip',
  '.crt': 'application/x-x509-ca-cert'
};
const mounts = new Map([
  ['/assets/', join(root, 'public', 'assets')],
  ['/app/', join(root, 'public', 'app')],
  ['/vendor/three/', join(root, 'node_modules', 'three')],
  ['/vendor/spark/', join(root, 'node_modules', '@sparkjsdev', 'spark', 'dist')],
  ['/vendor/qrcode/', join(root, 'node_modules', 'qrcode-generator', 'dist')]
]);

await mkdir(data, { recursive: true });
const demos = await listDemos();

const statePath = join(data, 'library.json');
const stored = await readFile(statePath, 'utf8').then(JSON.parse).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return { models: [], activeId: demos[0].id };
});
let state = { models: [...demos, ...stored.models], activeId: stored.activeId };
if (!state.models.some((model) => model.id === state.activeId)) state.activeId = demos[0].id;
let writes = Promise.resolve();

const certFile = resolve(process.env.HTTPS_CERT || join(root, '.certs', 'server.pem'));
const keyFile = resolve(process.env.HTTPS_KEY || join(root, '.certs', 'server-key.pem'));
const caFile = join(root, '.certs', 'rootCA.crt');
const tls = process.env.HTTPS_CERT || process.env.HTTPS_KEY ||
  (await access(certFile).then(() => true, () => false))
  ? { cert: await readFile(certFile), key: await readFile(keyFile) } : null;
const localCA = !process.env.HTTPS_CERT && !process.env.HTTPS_KEY && !!tls &&
  await access(caFile).then(() => true, () => false);
const privateAddress = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const lan = [...new Set(Object.values(networkInterfaces()).flat()
  .filter((item) => item.family === 'IPv4' && !item.internal && privateAddress.test(item.address))
  .map((item) => item.address))];
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });

function snapshot() {
  return {
    models: state.models.map(({ file, ...model }) => ({
      ...model, url: `/models/${model.id}.${model.type}`
    })),
    activeId: state.activeId,
    peers: sockets.clients.size
  };
}

function broadcast() {
  const message = JSON.stringify(snapshot());
  for (const client of sockets.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

sockets.on('connection', (socket) => {
  socket.on('error', () => socket.terminate());
  socket.on('close', broadcast);
  socket.on('pong', () => { socket.alive = true; });
  socket.alive = true;
  broadcast();
});

setInterval(() => {
  for (const socket of sockets.clients) {
    if (!socket.alive) socket.terminate();
    else {
      socket.alive = false;
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }
}, 30_000).unref();

function commit(change) {
  const write = writes.then(async () => {
    const next = change(state);
    const stored = { models: next.models.filter((model) => !model.sample), activeId: next.activeId };
    const temporary = statePath + '.tmp';
    await writeFile(temporary, JSON.stringify(stored));
    await rename(temporary, statePath);
    state = next;
    broadcast();
  });
  writes = write.catch(() => {});
  return write;
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function requestOrigin(request) {
  return `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
}

function isHost(request) {
  const address = request.socket.remoteAddress;
  if (address !== '::1' && !/^(::ffff:)?127\./.test(address)) return false;
  const hostname = URL.parse(requestOrigin(request))?.hostname;
  return hostname === 'localhost' || hostname === '[::1]' || /^127\.(\d{1,3}\.){2}\d{1,3}$/.test(hostname);
}

function authorize(request) {
  const origin = request.headers.origin;
  if (!isHost(request) || (origin && origin !== requestOrigin(request))) {
    throw fail(403, 'Hãy mở viewer trên localhost của máy tính để chia sẻ model.');
  }
}

async function serveFile(request, response, file, cache = 'no-cache') {
  const info = await stat(file).catch((error) => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  });
  if (!info?.isFile()) throw fail(404, 'Không tìm thấy tệp.');
  const { size } = info;
  const headers = {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    'Cache-Control': cache,
    'Accept-Ranges': 'bytes'
  };
  let status = 200;
  let start = 0;
  let end = size - 1;
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match?.[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    } else if (match?.[2]) start = Math.max(0, size - Number(match[2]));
    else start = size;
    if (start >= size || end < start) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
      response.end();
      return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  response.writeHead(status, headers);
  if (request.method === 'HEAD' || !size) response.end();
  else await pipeline(createReadStream(file, { start, end }), response);
}

async function verifySignature(path, type) {
  const handle = await open(path, 'r');
  const magic = Buffer.alloc(4);
  try {
    await handle.read(magic, 0, 4);
  } finally {
    await handle.close();
  }
  const prefixes = {
    ply: ['ply\n', 'ply\r'], glb: ['glTF'], usdz: ['PK\x03\x04']
  };
  if (prefixes[type] && !prefixes[type].includes(magic.toString('latin1'))) {
    throw fail(415, `Nội dung tệp không khớp với .${type}.`);
  }
}

async function upload(request, response) {
  authorize(request);
  let name;
  try {
    name = decodeURIComponent(request.headers['x-model-name'] || '');
  } catch {
    throw fail(400, 'Tên tệp không hợp lệ.');
  }
  if (!name || name.length > 255 || /[/\\\x00-\x1f\x7f]/.test(name)) {
    throw fail(400, 'Tên tệp không hợp lệ.');
  }
  const type = extname(name).slice(1).toLowerCase();
  if (!extensions.has(type)) throw fail(415, 'Định dạng tệp chưa được hỗ trợ.');
  const size = Number(request.headers['content-length']);
  if (!Number.isSafeInteger(size) || size < 4) throw fail(400, 'Tệp rỗng hoặc thiếu kích thước.');
  if (size > maxBytes) throw fail(413, 'Giới hạn mỗi tệp là 1 GiB.');
  if (request.headers['content-type'] !== 'application/octet-stream') {
    throw fail(415, 'Dữ liệu tải lên phải là tệp nhị phân.');
  }
  const id = randomUUID();
  const file = `${id}.${type}`;
  const path = join(data, file);
  const temporary = path + '.upload';
  try {
    await pipeline(request, createWriteStream(temporary, { flags: 'wx' }));
    await verifySignature(temporary, type);
    await rename(temporary, path);
    const model = { id, name, type, size, file, sample: false };
    await commit((current) => ({ ...current, models: [...current.models, model] }));
    json(response, 201, { id });
  } catch (error) {
    await Promise.all([temporary, path].map((item) => unlink(item).catch(() => {})));
    throw error;
  }
}

async function route(request, response) {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const method = request.method;
  if (method === 'POST' && path === '/api/models') return upload(request, response);
  const select = /^\/api\/active\/([\w-]+)$/.exec(path);
  if (method === 'PUT' && select) {
    authorize(request);
    const id = select[1];
    if (!state.models.some((model) => model.id === id)) throw fail(404, 'Không tìm thấy model.');
    await commit((current) => ({ ...current, activeId: id }));
    return json(response, 200, { activeId: id });
  }
  if (method !== 'GET' && method !== 'HEAD') throw fail(405, 'Phương thức chưa được hỗ trợ.');
  if (path === '/api/config') {
    return json(response, 200, { host: isHost(request), lan, port, tlsPort: tls ? tlsPort : null, localCA, maxBytes });
  }
  if (path === '/api/library') return json(response, 200, snapshot());
  if (path === '/') return serveFile(request, response, join(root, 'public', 'index.html'));
  if (path === '/lan-ca.crt' && localCA) return serveFile(request, response, caFile);
  const modelRoute = /^\/models\/([\w-]+)\.([\w]+)$/.exec(path);
  if (modelRoute) {
    const model = state.models.find(({ id, type }) => id === modelRoute[1] && type === modelRoute[2]);
    if (!model) throw fail(404, 'Không tìm thấy model.');
    const directory = model.sample ? join(root, 'public', 'assets') : data;
    return serveFile(request, response, join(directory, basename(model.file)), 'public, max-age=3600');
  }
  for (const [prefix, directory] of mounts) {
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length);
    if (relative.includes('\\') || relative.split('/').some((segment) => segment.startsWith('.'))) break;
    const file = resolve(directory, relative);
    if (file.startsWith(directory + sep)) return serveFile(request, response, file);
  }
  throw fail(404, 'Không tìm thấy đường dẫn.');
}

function handler(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  route(request, response).catch((error) => {
    if (response.destroyed) return;
    if (response.headersSent) return response.destroy();
    const status = error.status || (error instanceof URIError ? 400 : 500);
    if (status === 500) console.error(error);
    json(response, status, { error: status < 500 ? error.message : 'Máy chủ gặp lỗi khi xử lý tệp.' });
  });
}

function start(server, listenPort, protocol) {
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws' || request.headers.origin !== requestOrigin(request)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client));
  });
  server.listen(listenPort, host, () => {
    console.log(`DynamicView · ${protocol}://localhost:${listenPort}`);
    for (const address of lan) console.log(`Điện thoại · ${protocol}://${address}:${listenPort}`);
  });
}

start(createHttp(handler), port, 'http');
if (tls) start(createHttps(tls, handler), tlsPort, 'https');
