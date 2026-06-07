(function () {
  var hostname = window.location.hostname;
  var isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '';
  var localAppPorts = {
    '5000': true,
    '8080': true,
    '4173': true,
  };
  var port = window.location.port || '';
  var isStaticPreview =
    window.location.protocol !== 'file:' &&
    isLocalHost &&
    !!port &&
    !localAppPorts[port];

  window.__CFP_STATIC_BOOT__ = isStaticPreview;

  if (!isStaticPreview) {
    return;
  }

  var existingApiBaseUrl =
    window.CFP_CONFIG &&
    window.CFP_CONFIG.apiBaseUrl
      ? window.CFP_CONFIG.apiBaseUrl
      : '';

  window.CFP_CONFIG = Object.assign({}, window.CFP_CONFIG || {}, {
    apiBaseUrl: existingApiBaseUrl || 'http://localhost:5000/api',
  });

  if (!document.querySelector('link[data-cfp-static-css]')) {
    var cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = '/assets/main.css';
    cssLink.setAttribute('data-cfp-static-css', 'true');
    document.head.appendChild(cssLink);
  }

  if (!document.querySelector('script[data-cfp-static-js]')) {
    var script = document.createElement('script');
    script.type = 'module';
    script.src = '/assets/main.js';
    script.setAttribute('data-cfp-static-js', 'true');
    document.head.appendChild(script);
  }
})();
