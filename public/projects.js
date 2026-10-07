import {setupInstall} from './pwa.js';
const list=document.querySelector('#projects'),status=document.querySelector('#connection');
async function refresh() {
  document.querySelector('#refresh').disabled=true;
  try {
    const response=await fetch('./projects.json',{cache:'no-store'});
    if(!response.ok)throw Error('Unavailable');
    const projects=await response.json();
    list.replaceChildren();
    document.querySelector('#project-count').textContent=projects.length;
    for(const project of projects){
      const card=document.createElement('a');card.className='project-card';card.href=`./preview.html?project=${encodeURIComponent(project.id)}`;
      const top=document.createElement('div');top.className='card-top';
      const icon=document.createElement('span');icon.className='project-icon';icon.textContent=project.name.slice(0,1).toUpperCase();
      const badge=document.createElement('span');badge.className=`status ${project.available?'online':''}`;badge.textContent=project.available?'Available':'Server offline';
      top.append(icon,badge);
      const bottom=document.createElement('div');bottom.className='card-bottom';
      const details=document.createElement('div'),name=document.createElement('h3'),dimensions=document.createElement('p');
      name.textContent=project.name;dimensions.textContent=`${project.desktopWidth} × ${project.desktopHeight} · Desktop preview`;
      details.append(name,dimensions);const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='↗';bottom.append(details,arrow);card.append(top,bottom);list.append(card);
    }
    status.textContent=projects.length?'':'No projects yet. Ask Codex or Claude to attach your first UI.';
  }catch{status.textContent='Your Mac is unreachable. Check Tailscale and refresh when you’re connected.';}
  finally{document.querySelector('#refresh').disabled=false;}
}
document.querySelector('#refresh').addEventListener('click',refresh);
addEventListener('online',refresh);
refresh();setupInstall();
