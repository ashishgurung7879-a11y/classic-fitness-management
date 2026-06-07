window.CFP_CONFIG = Object.assign(
  {
    apiBaseUrl: '',
    mobileApiBaseUrl: '',
    runtime: ''
  },
  window.CFP_CONFIG || {}
);

(() => {
  const config = window.CFP_CONFIG;
  const hostname = window.location.hostname;
  const localAppPorts = new Set(['5000', '8080', '4173']);
  const isCapacitorRuntime =
    config.runtime === 'android' ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    /; wv\)/i.test(navigator.userAgent);

  function getApiBaseUrl() {
    if (config.apiBaseUrl) {
      return config.apiBaseUrl;
    }

    if (isCapacitorRuntime) {
      return config.mobileApiBaseUrl || 'https://your-domain.com/api';
    }

    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '';

    if (window.location.protocol === 'file:') {
      return 'http://localhost:5000/api';
    }

    if (isLocalHost) {
      const currentPort = window.location.port || '';
      if (currentPort && !localAppPorts.has(currentPort)) {
        return 'http://localhost:5000/api';
      }
      return `${window.location.origin}/api`;
    }

    return `${window.location.origin}/api`;
  }

  window.CFPAppConfig = {
    config,
    isCapacitorRuntime,
    getApiBaseUrl
  };
})();
