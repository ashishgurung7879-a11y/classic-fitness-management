if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    const swUrl = new URL('./sw.js', window.location.href);
    navigator.serviceWorker.register(swUrl).catch(() => {
      // Keep the website usable even if service worker registration fails.
    });
  });
}
