import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateConfig} from '../server.mjs';

const root = process.env.PREVIEW_HOME || fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(['--name','--target','--project-dir','--start-command-json','--preview-port','--desktop-width','--desktop-height','--profile','--use','--entry-path','--phone-port','--hub-port']);
const switches = new Set(['--help','--list','--up']);
const options = {};
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (switches.has(flag)) options[flag] = true;
  else if (flags.has(flag) && args[i + 1] && !args[i + 1].startsWith('--')) options[flag] = args[++i];
  else throw new Error(`Unknown option or missing value: ${flag}`);
}
if (options['--help']) {
  console.log(`Attach: node scripts/attach.mjs --target http://127.0.0.1:5173 --name "My App" [--profile my-app] [--up]
Switch: node scripts/attach.mjs --use my-app [--up]
List:   node scripts/attach.mjs --list
Options: --project-dir PATH --start-command-json '["npm","run","dev"]'
         --preview-port PORT --phone-port PORT --hub-port 5180 --desktop-width 1440 --desktop-height 900 --entry-path /`);
  process.exit(0);
}
const profiles = resolve(root, '.profiles');
function profilePath(name) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error('Profile names must use lowercase letters, digits and hyphens');
  return resolve(profiles, `${name}.json`);
}
function save(path, value) {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {mode:0o600});
  renameSync(temp, path);
  chmodSync(path, 0o600);
}
if (options['--list']) {
  for (const file of existsSync(profiles) ? readdirSync(profiles).filter(f => f.endsWith('.json')) : []) {
    const config = JSON.parse(readFileSync(resolve(profiles, file), 'utf8'));
    console.log(`${file.slice(0,-5)}\t${config.name}\t${config.target}`);
  }
  process.exit(0);
}
if (options['--use'] && Object.keys(options).some(k => !['--use','--up'].includes(k))) throw new Error('--use accepts only --up; attach again to edit a profile');
const saved = existsSync(profiles) ? readdirSync(profiles).filter(f => f.endsWith('.json')).map(f => ({id:f.slice(0,-5),...validateConfig(JSON.parse(readFileSync(resolve(profiles,f),'utf8')))})) : [];
const existing = saved.find(item => item.id === options['--profile']);
function availablePort(start, key) {while (saved.some(item => item[key] === start)) start++; return start;}
const config = options['--use']
  ? validateConfig(JSON.parse(readFileSync(profilePath(options['--use']), 'utf8')))
  : validateConfig({
    name: options['--name'] || 'Local App',
    target: options['--target'] || (() => {throw new Error('--target is required');})(),
    previewPort: Number(options['--preview-port'] || existing?.previewPort || availablePort(5180,'previewPort')),
    phonePort: Number(options['--phone-port'] || existing?.phonePort || availablePort(8443,'phonePort')),
    hubPort: Number(options['--hub-port'] || existing?.hubPort || 5180),
    desktopWidth: Number(options['--desktop-width'] || 1440),
    desktopHeight: Number(options['--desktop-height'] || 900),
    projectDir: options['--project-dir'] ? resolve(options['--project-dir']) : '',
    startCommand: JSON.parse(options['--start-command-json'] || '[]'),
    entryPath: options['--entry-path'] || '/',
    updatedAt: Date.now()
  });
// Validate everything before replacing the active attachment.
if (saved.some(item => item.id !== options['--profile'] && item.id !== options['--use'] && (item.previewPort === config.previewPort || (item.phonePort || 8443) === config.phonePort))) throw new Error('Each project needs a distinct preview port and phone port');
if (options['--profile']) {
  const path = profilePath(options['--profile']);
  mkdirSync(profiles, {recursive:true, mode:0o700});
  save(path, config);
}
save(resolve(root, '.preview.json'), config);
console.log(`Attached ${config.name} at ${config.target}${config.entryPath}`);
if (options['--up']) {
  if (process.platform !== 'darwin') throw new Error('--up currently supports macOS; use npm start on other platforms');
  const installed = spawnSync('sh', [fileURLToPath(new URL('./install-macos-service.sh', import.meta.url))], {stdio:'inherit'});
  if (installed.status !== 0) process.exit(installed.status || 1);
  const phone = spawnSync(process.execPath, [fileURLToPath(new URL('./phone-routes.mjs', import.meta.url))], {stdio:'inherit'});
  if (phone.status !== 0) process.exit(phone.status || 1);
  const checked = spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url))], {stdio:'inherit'});
  if (checked.status !== 0) process.exit(checked.status || 1);
} else console.log('Run npm start for a foreground preview, or add --up for a persistent macOS service.');
console.log(`Preview: http://127.0.0.1:${config.previewPort}/__preview/`);
