import {setupInstall} from './pwa.js';

// Capture the initial screen space before changing the native viewport.
// Only a physical orientation change refits the outer shell; pinch is native.
// The iframe always keeps its desktop dimensions and current document.
const availableWidth = document.documentElement.clientWidth;
const availableHeight = document.documentElement.clientHeight;
const status = document.querySelector('#preview-status');
try {
  const project = new URLSearchParams(location.search).get('project');
  const response = await fetch(`./config.json${project ? '?project='+encodeURIComponent(project) : ''}`, {cache:'no-store'});
  if (!response.ok) throw new Error(`Configuration request failed: ${response.status}`);
  const config = await response.json();
  const pageWidth = config.desktopWidth + 96;
  const pageHeight = config.desktopHeight + 196;
  document.documentElement.style.setProperty('--desktop-w', `${config.desktopWidth}px`);
  document.documentElement.style.setProperty('--desktop-h', `${config.desktopHeight}px`);
  function fitScreen(width, height) {
    const scale = Math.min(width / pageWidth, height / pageHeight, 1);
    const shellWidth = Math.max(pageWidth, width / scale);
    document.documentElement.style.setProperty('--page-w', `${shellWidth}px`);
    document.documentElement.style.setProperty('--page-h', `${height / scale}px`);
    document.querySelector('meta[name="viewport"]').content = `width=${shellWidth},initial-scale=${scale},viewport-fit=cover,user-scalable=yes`;
  }
  fitScreen(availableWidth, availableHeight);
  let rotationTimer;
  function rotated() {
    clearTimeout(rotationTimer);
    // Safari reports orientation before its viewport has finished rotating.
    rotationTimer = setTimeout(() => {
      const viewport = window.visualViewport;
      const width = viewport ? viewport.width * viewport.scale : innerWidth;
      const height = viewport ? viewport.height * viewport.scale : innerHeight;
      fitScreen(width, height);
      window.scrollTo(0, 0);
    }, 250);
  }
  if (screen.orientation?.addEventListener) screen.orientation.addEventListener('change', rotated);
  else window.addEventListener('orientationchange', rotated);
  document.querySelector('#app-name').textContent = config.name;
  document.title = `${config.name} · Desktop Preview`;
  const appURL = new URL(config.entryPath || '/', location.origin);
  appURL.port = String(location.protocol === 'https:' ? config.phonePort : config.previewPort);
  document.querySelector('#unframed').href = appURL.href;
  document.querySelector('#macbook').hidden = false;
  const iframe = document.querySelector('iframe');
  // The only iframe navigation: opening the selected project.
  iframe.src = appURL.href;
  status.hidden = true;
} catch (error) {
  console.error('Could not load preview configuration', error);
  status.textContent = 'Project unavailable. Return to Projects and check that your Mac is connected.';
}
setupInstall();
