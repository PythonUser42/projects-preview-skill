import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const CONFIG_PATH = process.env.PREVIEW_CONFIG || join(ROOT, '.preview.json');
const DEFAULTS = {hubPort:5180,phonePort:8443,entryPath:'/',name:'Local App',target:'http://127.0.0.1:5173',previewPort:5180,desktopWidth:1440,desktopHeight:900,projectDir:'',startCommand:[]};

export function loadConfig(path = CONFIG_PATH) {
  const stored = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  return validateConfig(stored);
}

export function validateConfig(stored) {
  const config = {...DEFAULTS, ...stored};
  const target = new URL(config.target);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('target must use http or https');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('target must be a loopback URL');
  if (target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('target must be a loopback origin; use entryPath for an app route');
  if (typeof config.entryPath !== 'string' || !config.entryPath.startsWith('/') || config.entryPath.startsWith('//') || config.entryPath.includes('\\') || config.entryPath.startsWith('/__preview')) throw new Error('entryPath must be an app path starting with /');
  if (typeof config.name !== 'string' || !config.name.trim()) throw new Error('name is required');
  if (Number(target.port || (target.protocol === 'https:' ? 443 : 80)) === config.previewPort) throw new Error('target and preview ports must differ');
  if (!Number.isInteger(config.previewPort) || config.previewPort < 1024 || config.previewPort > 65535) throw new Error('previewPort must be 1024-65535');
  for (const key of ['hubPort','phonePort']) if (!Number.isInteger(config[key]) || config[key] < 1024 || config[key] > 65535) throw new Error(`${key} must be 1024-65535`);
  for (const key of ['desktopWidth','desktopHeight']) if (!Number.isInteger(config[key]) || config[key] < 320 || config[key] > 4096) throw new Error(`${key} must be 320-4096`);
  if (!Array.isArray(config.startCommand) || config.startCommand.some((part) => typeof part !== 'string')) throw new Error('startCommand must be an array of strings');
  if (config.startCommand.length && (!config.projectDir || !existsSync(config.projectDir) || !statSync(config.projectDir).isDirectory())) throw new Error('projectDir must exist for a managed target');
  return {...config, target: target.toString().replace(/\/$/, '')};
}

const TYPES = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff'};

function sendFile(res, path) {
  if (!existsSync(path) || !statSync(path).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, {'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
  createReadStream(path).pipe(res);
}

function shellPath(urlPath) {
  const relative = decodeURIComponent(urlPath.slice('/__preview/'.length) || 'projects.html');
  const safe = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  return join(PUBLIC, safe);
}

function proxyRequest(req, res, config) {
  const path = new URL(req.url, 'http://preview.local');
  const target = new URL(config.target);
  target.pathname = path.pathname;
  target.search = path.search;
  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = {...req.headers, host: target.host, 'x-forwarded-host': req.headers.host || '', 'x-forwarded-proto': 'http'};
  delete headers['accept-encoding'];
  const upstream = transport(target, {method:req.method,headers}, (response) => {
    const responseHeaders = {...response.headers};
    if (responseHeaders.location?.startsWith(config.target)) responseHeaders.location = responseHeaders.location.slice(config.target.length) || '/';
    res.writeHead(response.statusCode || 502, responseHeaders);
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    res.end(`Target app unavailable at ${config.target}\n${error.code || 'proxy error'}`);
  });
  upstream.setTimeout(15000, () => upstream.destroy(new Error('Target timed out')));
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

export function loadProfiles(config, path = CONFIG_PATH) {
  const directory = join(dirname(path), '.profiles');
  const entries = existsSync(directory) ? readdirSync(directory).filter(file => /^[a-z0-9][a-z0-9-]*\.json$/.test(file)).map(file => ({id:file.slice(0,-5), ...loadConfig(join(directory,file))})) : [];
  if (!entries.some(item => item.previewPort === config.previewPort && item.target === config.target)) entries.push({id:'current', ...config});
  const ports = new Set(), phonePorts = new Set();
  for (const entry of entries) {
    if (ports.has(entry.previewPort) || phonePorts.has(entry.phonePort)) throw new Error('Project preview ports and phone ports must be unique; reattach with distinct ports');
    ports.add(entry.previewPort); phonePorts.add(entry.phonePort);
  }
  return entries.sort((a,b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0) || a.name.localeCompare(b.name));
}

export function createPreviewServer(config, projects = [{id:'current', ...config}]) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://preview.local');
    const path = url.pathname;
    if (path === '/__preview') { res.writeHead(308, {Location:'/__preview/'}); return res.end(); }
    if (path === '/__preview/projects.json') {
      Promise.all(projects.map(async item => {
        let available = false;
        try { const response = await fetch(`${item.target}${item.entryPath}`, {method:'HEAD', signal:AbortSignal.timeout(1500)}); available = response.ok; await response.body?.cancel(); } catch {}
        return {id:item.id,name:item.name,desktopWidth:item.desktopWidth,desktopHeight:item.desktopHeight,available};
      })).then(items => {res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(items));});
      return;
    }
    if (path === '/__preview/config.json') {
      const selected = url.searchParams.has('project') ? projects.find(item => item.id === url.searchParams.get('project')) : config;
      if (!selected) {res.writeHead(404, {'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Project not found'}));}
      const body = JSON.stringify({name:selected.name,desktopWidth:selected.desktopWidth,desktopHeight:selected.desktopHeight,entryPath:selected.entryPath || '/',previewPort:selected.previewPort,phonePort:selected.phonePort});
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body)});
      return res.end(body);
    }
    if (path.startsWith('/__preview/')) {
      try { return sendFile(res, shellPath(path)); }
      catch { res.writeHead(400); return res.end('Invalid preview path'); }
    }
    proxyRequest(req, res, config);
  });
  server.on('upgrade', (req, socket, head) => proxyUpgrade(req, socket, head, config));
  return server;
}

// Preserve WebSocket upgrades for Vite/Next/etc. Keep Origin intact so the
// target development server can apply its own origin allowlist.
function proxyUpgrade(req, socket, head, config) {
  const path = new URL(req.url, 'http://preview.local');
  if (path.pathname.startsWith('/__preview/')) return socket.destroy();
  const target = new URL(config.target);
  target.pathname = path.pathname;
  target.search = path.search;
  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = transport(target, {headers: {...req.headers, host:target.host}});
  upstream.setTimeout(15000, () => upstream.destroy());
  upstream.on('upgrade', (response, peer, peerHead) => {
    upstream.setTimeout(0);
    socket.write(`HTTP/1.1 101 ${response.statusMessage || 'Switching Protocols'}\r\n`);
    for (let i = 0; i < response.rawHeaders.length; i += 2) socket.write(`${response.rawHeaders[i]}: ${response.rawHeaders[i+1]}\r\n`);
    socket.write('\r\n');
    if (peerHead.length) socket.write(peerHead);
    if (head.length) peer.write(head);
    peer.on('error', () => socket.destroy());
    socket.on('error', () => peer.destroy());
    socket.on('close', () => peer.destroy());
    peer.on('close', () => socket.destroy());
    socket.pipe(peer).pipe(socket);
  });
  upstream.on('response', response => {response.resume(); socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`);});
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
  upstream.end();
}

function startManagedTarget(config) {
  if (!config.startCommand.length) return null;
  if (!config.projectDir || !existsSync(config.projectDir)) throw new Error('projectDir is required for a managed target');
  const child = spawn(config.startCommand[0], config.startCommand.slice(1), {cwd:config.projectDir,stdio:'inherit',env:{...process.env}});
  child.once('error', error => {console.error(`Could not start ${config.name}: ${error.message}`);});
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`Target process exited (${signal || code}).`);
      // Keep the Projects home and other applications available.
    }
  });
  return child;
}

let shuttingDown = false;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const projects = loadProfiles(config);
  const listeners = new Map(projects.map(item => [item.previewPort,item]));
  if (!listeners.has(config.hubPort)) listeners.set(config.hubPort, config);
  const children = [], servers = [];
  const managedTargets = new Set();
  for (const project of projects) {
    if (!managedTargets.has(project.target)) {
      const child = startManagedTarget(project);
      if (child) children.push(child);
      managedTargets.add(project.target);
    }
  }
  for (const [port,project] of listeners) {
    const server = createPreviewServer(project, projects);
    servers.push(server);
    server.on('error', error => {console.error(`Preview port ${port}: ${error.message}`);stop();});
    server.listen(port, '127.0.0.1', () => console.log(`Projects: http://127.0.0.1:${port}/__preview/`));
  }
  const stop = () => {
    shuttingDown = true;
    for (const child of children) if (!child.killed) child.kill('SIGTERM');
    let remaining = servers.length;
    for (const server of servers) server.close(() => {if (--remaining === 0) process.exit(0);});
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
