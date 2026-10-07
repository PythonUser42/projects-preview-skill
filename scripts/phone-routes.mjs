import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadConfig,loadProfiles} from '../server.mjs';
const bin=existsSync('/Applications/Tailscale.app/Contents/MacOS/Tailscale')?'/Applications/Tailscale.app/Contents/MacOS/Tailscale':'tailscale';
const status=spawnSync(bin,['serve','status','--json'],{encoding:'utf8'});
if(status.status!==0){console.log('Private phone routing not configured: connect Tailscale and run node scripts/phone-routes.mjs.');process.exit(0);}
const current=JSON.parse(status.stdout),config=loadConfig(),projects=loadProfiles(config);
// Reuse the existing hub listener; never replace another application's route.
const hubEntry=Object.entries(current.Web||{}).find(([,value])=>value.Handlers?.['/']?.Proxy===`http://127.0.0.1:${config.hubPort}`);
const hubPhonePort=hubEntry?Number(hubEntry[0].split(':').at(-1)):8443;
const desired=new Map([[hubPhonePort,config.hubPort]]);
for(const project of projects){
 if(desired.has(project.phonePort)&&desired.get(project.phonePort)!==project.previewPort)throw Error(`Phone port ${project.phonePort} conflicts with the project hub`);
 desired.set(project.phonePort,project.previewPort);
}
const additions=[];
for(const [port,local] of desired){
 const entry=Object.entries(current.Web||{}).find(([host])=>host.endsWith(`:${port}`));
 if(entry){
  if(entry[1].Handlers?.['/']?.Proxy!==`http://127.0.0.1:${local}`)throw Error(`Phone port ${port} already serves another application. Choose a different --phone-port.`);
 }else{
  if(current.TCP?.[port])throw Error(`Tailscale port ${port} is already in use`);
  additions.push([port,local]);
 }
}
for(const [port,local] of additions){
 const result=spawnSync(bin,['serve','--bg',`--https=${port}`,String(local)],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
const info=spawnSync(bin,['status','--json'],{encoding:'utf8'});
if(info.status===0){const host=JSON.parse(info.stdout).Self?.DNSName?.replace(/\.$/,'');if(host)console.log(`Projects: https://${host}:${hubPhonePort}/__preview/`);}
