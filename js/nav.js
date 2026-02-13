/* ATS Drawer Nav
   Loads partial (partials/nav.html) and wires up open/close + active link.
   Also renders the current dataset marker (BETA / STABLE label) across pages.
*/
(function(){
  const PARTIAL_PATH = './partials/nav.html';
  const DATASET_STORE_KEY = 'ats_portal_dataset_mode_v1';

  function getPathname(){
    try{
      return (new URL(window.location.href)).pathname.split('/').pop() || 'index.html';
    }catch(e){
      return 'index.html';
    }
  }

  function getDatasetKey(){
    try{
      const env = window.PortalApp && window.PortalApp.Env;
      if(env && typeof env.getDatasetKey === 'function') return env.getDatasetKey();
    }catch(e){}
    const k = (localStorage.getItem(DATASET_STORE_KEY) || '').toString().trim().toLowerCase();
    return (k === 'beta' || k === 'stable') ? k : 'stable';
  }

  function getDatasetLabel(){
    try{
      const env = window.PortalApp && window.PortalApp.Env;
      if(env && typeof env.getRemoteConfig === 'function'){
        const cfg = env.getRemoteConfig();
        return cfg && cfg.label ? String(cfg.label) : '';
      }
    }catch(e){}
    return getDatasetKey() === 'beta' ? 'BETA' : 'LSW Dashboard';
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  function ensureEnvMarker(){
    let marker = document.getElementById('atsEnvMarker');
    if(!marker){
      // Back-compat: old marker id in index.html
      marker = document.getElementById('atsBetaMarker');
      if(marker) marker.id = 'atsEnvMarker';
    }

    if(!marker){
      const logo = document.querySelector('.logo');
      if(logo && logo.parentNode){
        marker = document.createElement('div');
        marker.id = 'atsEnvMarker';
        marker.className = 'ats-env-marker';
        logo.insertAdjacentElement('afterend', marker);
      }
    }

    if(!marker) return;

    const label = getDatasetLabel();
    marker.innerHTML = `
      <div class="ats-env-marker__line"></div>
      <div class="ats-env-marker__label">${escapeHtml(label)}</div>
      <div class="ats-env-marker__line"></div>
    `;

    // Also show inside the drawer if the partial supports it
    const drawerEnv = document.getElementById('ats-drawer-env');
    if(drawerEnv){
      drawerEnv.textContent = (getDatasetKey() === 'beta') ? 'Dataset: BETA' : 'Dataset: STABLE';
    }
  }

  function markActive(root){
    const current = getPathname();
    root.querySelectorAll('[data-ats-link]').forEach(a=>{
      const href = (a.getAttribute('href') || '').split('/').pop();
      if(href === current) a.classList.add('is-active');
    });
  }

  function wire(root){
    const drawer = root.querySelector('#ats-drawer');
    const burger = root.querySelector('.ats-nav__hamburger');
    const overlay = root.querySelector('.ats-drawer__overlay');
    const closeBtns = root.querySelectorAll('[data-ats-drawer-close]');

    if(!drawer || !burger || !overlay) return;

    function openDrawer(){
      drawer.classList.add('is-open');
      overlay.hidden = false;
      drawer.setAttribute('aria-hidden', 'false');
      burger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('ats-drawer-lock');
    }

    function closeDrawer(){
      drawer.classList.remove('is-open');
      overlay.hidden = true;
      drawer.setAttribute('aria-hidden', 'true');
      burger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('ats-drawer-lock');
    }

    burger.addEventListener('click', ()=>{
      if(drawer.classList.contains('is-open')) closeDrawer();
      else openDrawer();
    });

    closeBtns.forEach(btn => btn.addEventListener('click', closeDrawer));

    window.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
    });

    root.querySelectorAll('[data-ats-link]').forEach(a=>{
      a.addEventListener('click', closeDrawer);
    });

    markActive(root);
  }

  async function init(){
    let host = document.getElementById('ats-nav-root');
    if(!host){
      host = document.createElement('div');
      host.id = 'ats-nav-root';
      document.body.prepend(host);
    }

    try{
      const res = await fetch(PARTIAL_PATH, { cache: 'no-store' });
      if(!res.ok) throw new Error('Nav partial not found');
      host.innerHTML = await res.text();
    }catch(err){
      host.innerHTML = `
        <nav class="ats-nav">
          <button class="ats-nav__hamburger" type="button" aria-label="Open menu" aria-controls="ats-drawer" aria-expanded="false">
            <img src="./images/icons/hamburger-24.png" alt="" width="24" height="24">
          </button>
          <div class="ats-drawer__overlay" data-ats-drawer-close hidden></div>
          <aside id="ats-drawer" class="ats-drawer" aria-hidden="true">
            <div class="ats-drawer__header">
              <div class="ats-drawer__headtext">
                <div class="ats-drawer__title">Menu</div>
                <div class="ats-drawer__sub" id="ats-drawer-env"></div>
              </div>
              <button class="ats-drawer__close" type="button" aria-label="Close menu" data-ats-drawer-close>✕</button>
            </div>
            <ul class="ats-drawer__list">
              <li><a class="ats-drawer__link" href="./index.html" data-ats-link>Home</a></li>
              <li><a class="ats-drawer__link" href="./settings.html" data-ats-link>Settings</a></li>
            </ul>
          </aside>
        </nav>
      `;
    }

    wire(host);
    ensureEnvMarker();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
