export function setupInstall(){
  const button=document.querySelector('#install-app'),help=document.querySelector('#install-help');
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let prompt;
  if(button){button.hidden=standalone;button.addEventListener('click',async()=>{if(prompt){await prompt.prompt();prompt=null;}else if(help){help.hidden=false;}});}
  document.querySelector('#close-install')?.addEventListener('click',()=>{help.hidden=true;});
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;if(button)button.hidden=false;});
  addEventListener('appinstalled',()=>{if(button)button.hidden=true;if(help)help.hidden=true;});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
}
