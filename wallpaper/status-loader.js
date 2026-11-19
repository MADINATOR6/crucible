'use strict';

(() => {
  // Script tags work for local files in WebView2; fetch and modules do not.
  const folder = new URL('.', document.currentScript.src);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const target = document.getElementById('scene');
  let lastKey, loading = false;
  function draw() {
    const now = Date.now();
    const still = location.hash === '#still' || reducedMotion.matches;
    const key = `${statusKey(window.PALS_STATUS, now)}:${still}`;
    if (key === lastKey) return;
    // Only renderScene's escaped/validated markup crosses this DOM boundary.
    target.innerHTML = renderScene(window.PALS_STATUS, { now, still });
    lastKey = key;
  }
  function load(src) {
    return new Promise(resolve => {
      const script = document.createElement('script');
      let timer;
      const finish = ok => { clearTimeout(timer); script.remove(); resolve(ok); };
      script.onload = () => finish(true);
      script.onerror = () => finish(false);
      script.src = `${src}?t=${Date.now()}`;
      timer = setTimeout(() => finish(false), 1800);
      document.head.appendChild(script);
    });
  }
  async function poll() {
    draw(); // Expire old snapshots even if loading is slow or fails.
    if (loading) return;
    loading = true;
    try {
      window.PALS_STATUS = undefined;
      const relative = await load('status.js');
      if (!relative && folder.protocol === 'file:') await load(new URL('status.js', folder).href);
      draw();
    } finally { loading = false; }
  }
  reducedMotion.addEventListener('change', draw);
  window.addEventListener('hashchange', draw);
  poll();
  setInterval(poll, 5000);
})();
