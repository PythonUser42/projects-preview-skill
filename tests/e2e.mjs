import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Exercise public CLI + real server process + real browser. No mocked DOM or
// implementation imports. Never touch the user's active attachment or service.
const root = fileURLToPath(new URL('..', import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'phone-preview-e2e-'));
const artifacts = join(root, 'test-results');
mkdirSync(artifacts, {recursive:true});
const report = {command:'npm test', startedAt:new Date().toISOString(), checks:[], status:'failed', limitation:'Desktop Chromium; does not establish iPhone pinch-zoom stability.'};
let processHandle, browser, context, page;
const sockets = new Set();
let websocketOrigin;
const target = createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html'});
  res.end(`<!doctype html><title>Example UI</title><button id="count">Count: 0</button><p id="live">Connecting</p><script>
    let count=0; document.querySelector('#count').onclick=()=>document.querySelector('#count').textContent='Count: '+(++count);
    const ws=new WebSocket('ws://'+location.host+'/live');
    ws.onmessage=e=>document.querySelector('#live').textContent=e.data;
  </script>`);
});
target.on('connection', socket => {sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
target.on('upgrade', (req, socket) => {
  websocketOrigin = req.headers.origin;
  const accept = createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const message=Buffer.from('Live reload connected');
  socket.write(Buffer.concat([Buffer.from([0x81,message.length]),message]));
  socket.on('end',()=>socket.end());
  socket.on('error',()=>{});
});
const listen = async server => {server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;};
function attach(...args) {
  return spawnSync(process.execPath,['scripts/attach.mjs',...args],{cwd:root,env:{...process.env,PREVIEW_HOME:home},encoding:'utf8'});
}
async function stop() {
  if (!processHandle || processHandle.exitCode !== null) return;
  const exited=once(processHandle,'exit');processHandle.kill('SIGTERM');await exited;
}
async function start(base) {
  processHandle=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PREVIEW_CONFIG:join(home,'.preview.json')},stdio:['ignore','ignore','pipe']});
  let logs='';processHandle.stderr.on('data',data=>logs+=data);
  for(let i=0;i<60;i++) {
    if(processHandle.exitCode!==null)throw Error(`Server exited: ${logs}`);
    try {if((await fetch(`${base}/__preview/config.json`)).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error(`Server did not start: ${logs}`);
}
try {
  const targetPort=await listen(target);
  const reservation=createServer();const previewPort=await listen(reservation);await new Promise(resolve=>reservation.close(resolve));
  const base=`http://127.0.0.1:${previewPort}`;
  const secondReservation=createServer();const secondPort=await listen(secondReservation);await new Promise(resolve=>secondReservation.close(resolve));
  for(const name of ['first','second']) {
    const result=attach('--name',`${name} UI`,'--profile',name,'--target',`http://127.0.0.1:${targetPort}`,'--preview-port',String(name==='first'?previewPort:secondPort),'--phone-port',String(name==='first'?8443:8444),'--hub-port',String(previewPort),'--entry-path',`/${name}`);
    assert.equal(result.status,0,result.stderr);
  }
  assert.equal(attach('--use','first').status,0);
  const active=readFileSync(join(home,'.preview.json'),'utf8');
  assert.notEqual(attach('--target','https://example.com').status,0);
  assert.equal(readFileSync(join(home,'.preview.json'),'utf8'),active);
  report.checks.push('Invalid attachment preserves selected project');
  await start(base);
  browser=await chromium.launch({channel:process.env.PREVIEW_BROWSER_CHANNEL || (process.platform==='darwin'?'chrome':undefined)});
  context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  page=await context.newPage();page.setDefaultTimeout(10000);
  const cdp=await context.newCDPSession(page);
  const rotate = (width,height,type,angle) => cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:true,screenOrientation:{type,angle}});
  await rotate(844,390,'landscapePrimary',90);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(`${base}/__preview/`);
  assert.equal(response.status(),200);
  assert.match(response.headers()['content-type'],/text\/html/);
  await page.getByRole('heading',{name:'Projects.',exact:true}).waitFor();
  await page.getByRole('link').filter({has:page.getByRole('heading',{name:'first UI',exact:true})}).click();
  await page.waitForFunction(()=>document.title==='first UI · Desktop Preview');
  const app=page.frameLocator('iframe');
  await app.getByRole('button',{name:'Count: 0',exact:true}).click();
  await app.getByText('Live reload connected',{exact:true}).waitFor();
  assert.equal(websocketOrigin,base);
  report.checks.push('Selected project renders; framed control works; WebSocket notification reaches browser with original Origin');
  const originalWidth=await page.frames().find(frame=>frame!==page.mainFrame()).evaluate(()=>innerWidth);
  const initialScale=await page.evaluate(()=>visualViewport.scale);
  for(let cycle=0;cycle<3;cycle++) {
    let center=await page.evaluate(()=>({x:visualViewport.width/2,y:visualViewport.height/2}));
    await cdp.send('Input.synthesizePinchGesture',{...center,scaleFactor:2,relativeSpeed:300,gestureSourceType:'touch'});
    assert.ok(await page.evaluate(()=>visualViewport.scale)>initialScale*1.5);
    center=await page.evaluate(()=>({x:visualViewport.width/2,y:visualViewport.height/2}));
    await cdp.send('Input.synthesizePinchGesture',{...center,scaleFactor:0.5,relativeSpeed:300,gestureSourceType:'touch'});
  }
  assert.equal(await page.frames().find(frame=>frame!==page.mainFrame()).evaluate(()=>innerWidth),originalWidth);
  for (const [width,height,type,angle] of [[390,844,'portraitPrimary',0],[844,390,'landscapePrimary',90],[390,844,'portraitPrimary',0],[844,390,'landscapePrimary',90]]) {
    await rotate(width,height,type,angle);
    await page.waitForFunction(() => {
      const top=document.querySelector('.controls').getBoundingClientRect().top;
      const frame=document.querySelector('.stage').getBoundingClientRect();
      const v=visualViewport;
      return Math.abs((top+frame.bottom)/2-v.height/2)<8 &&
        Math.abs((frame.left+frame.right)/2-v.width/2)<8 &&
        top>=0 && frame.bottom<=v.height+2;
    });
    assert.equal(await page.frames().find(frame=>frame!==page.mainFrame()).evaluate(()=>innerWidth),originalWidth);
    await app.getByRole('button',{name:'Count: 1',exact:true}).waitFor();
    await page.screenshot({path:join(artifacts,`rotation-${type}.png`)});
  }
  await app.getByRole('button',{name:'Count: 1',exact:true}).click();
  await app.getByRole('button',{name:'Count: 2',exact:true}).waitFor();
  report.checks.push('Native pinch and rotation preserve iframe desktop width and interactive state');
  await page.screenshot({path:join(artifacts,'preview.png')});
  // Both projects must stay available concurrently; navigating the hub does
  // not switch a global backend or overwrite another browser tab's project.
  const firstPage=page;
  const secondPage=await context.newPage();
  await secondPage.goto(`${base}/__preview/`);
  await secondPage.getByRole('link').filter({has:secondPage.getByRole('heading',{name:'second UI',exact:true})}).click();
  await secondPage.waitForFunction(()=>document.title==='second UI · Desktop Preview');
  await secondPage.frameLocator('iframe').getByRole('button',{name:'Count: 0',exact:true}).click();
  assert.ok(secondPage.frames().some(frame=>frame.url()===`http://127.0.0.1:${secondPort}/second`));
  await firstPage.frameLocator('iframe').getByRole('button',{name:'Count: 2',exact:true}).click();
  await firstPage.frameLocator('iframe').getByRole('button',{name:'Count: 3',exact:true}).waitFor();
  await secondPage.getByRole('link',{name:'Projects',exact:true}).click();
  await secondPage.getByRole('heading',{name:'Projects.',exact:true}).waitFor();
  await secondPage.setViewportSize({width:390,height:844});
  await secondPage.screenshot({path:join(artifacts,'projects.png')});
  const manifest=await (await fetch(`${base}/__preview/manifest.webmanifest`)).json();
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');assert.equal(manifest.orientation,'any');
  await secondPage.evaluate(()=>navigator.serviceWorker.ready);
  await context.setOffline(true);
  await secondPage.reload();
  await secondPage.getByRole('heading',{name:'Projects.',exact:true}).waitFor();
  await secondPage.getByText('Your Mac is unreachable.',{exact:false}).waitFor();
  await context.setOffline(false);
  report.checks.push('Projects navigation, concurrent independent previews, portrait hub, standalone manifest and offline shell');
  assert.deepEqual(errors,[]);
  report.checks.push('Project selection keeps each preview on its own origin');
  for(const socket of sockets)socket.destroy();
  await new Promise(resolve=>target.close(resolve));
  const unavailable=await fetch(`${base}/second`);
  assert.equal(unavailable.status,502);
  assert.match(await unavailable.text(),/Target app unavailable/);
  report.checks.push('Unavailable target produces an explicit 502 response');
  report.status='passed';
} catch(error) {
  report.error=error.stack;process.exitCode=1;
} finally {
  if(context)await context.tracing.stop({path:join(artifacts,'trace.zip')}).catch(()=>{});
  await browser?.close();await stop();
  for(const socket of sockets)socket.destroy();target.close();
  rmSync(home,{recursive:true,force:true});
  report.finishedAt=new Date().toISOString();
  writeFileSync(join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`${report.status.toUpperCase()}: ${report.checks.length} user-flow checks. Artifacts: ${artifacts}`);
  if(report.error)console.error(report.error);
}
