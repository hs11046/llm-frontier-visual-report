(() => {
  const style = document.createElement('style');
  style.textContent = '.report-return{position:fixed;right:16px;bottom:16px;z-index:100000;padding:9px 14px;border-radius:999px;background:#173c39;color:#fff!important;text-decoration:none!important;font:600 12px/1.2 system-ui,sans-serif;box-shadow:0 4px 18px #102a2770;border:1px solid #b5d0bd;transition:transform .2s}.report-return:hover{transform:translateY(-3px);background:#276350}.report-return:focus-visible{outline:3px solid #e5b45e;outline-offset:3px}';
  document.head.appendChild(style);
  const a = document.createElement('a');
  a.className = 'report-return';
  a.href = '/';
  a.textContent = '← Back to report';
  a.setAttribute('aria-label', 'Back to the visual report');
  document.body.appendChild(a);
})();
