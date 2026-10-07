import {loadConfig} from '../server.mjs';
import {fileURLToPath} from 'node:url';

export async function checkPreview(base, expected) {
  const origin = new URL(base).origin;
  const get = async path => {
    const response = await fetch(`${origin}${path}`, {cache:'no-store', signal:AbortSignal.timeout(3000)});
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response;
  };
  const shell = await get('/__preview/preview.html');
  if (!shell.headers.get('content-type')?.includes('text/html') || !(await shell.text()).includes('id="macbook"')) throw new Error('URL is not serving the preview HTML');
  const config = await (await get('/__preview/config.json')).json();
  for (const key of ['name','desktopWidth','desktopHeight','entryPath']) {
    if (config[key] !== expected[key]) throw new Error(`Stale attachment: ${key} is ${JSON.stringify(config[key])}, expected ${JSON.stringify(expected[key])}`);
  }
  for (const [path,type] of [['preview.js','javascript'],['preview.css','text/css']]) {
    const response = await get(`/__preview/${path}`);
    if (!response.headers.get('content-type')?.includes(type)) throw new Error(`Wrong content type for ${path}`);
    await response.arrayBuffer();
  }
  const target = await get(config.entryPath);
  if (!target.headers.get('content-type')?.includes('text/html')) throw new Error('Target entry path is not an HTML page');
  await target.arrayBuffer();
  return config;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args[0] !== '--url' || args.length !== 2)) throw new Error('Usage: node scripts/check.mjs [--url https://private-host:8443]');
  const config = loadConfig();
  const base = args[1] || `http://127.0.0.1:${config.previewPort}`;
  const deadline = Date.now() + 20000;
  while (true) {
    try {
      const checked = await checkPreview(base, config);
      console.log(`Ready: ${checked.name} — ${new URL('/__preview/', base)}`);
      break;
    } catch (error) {
      if (Date.now() >= deadline) {console.error(`Preview not ready: ${error.message}\nCheck the target server and macOS file-access permissions. No readiness claim was made.`); process.exitCode = 1; break;}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
