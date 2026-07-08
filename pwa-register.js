(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(window.location.protocol)) return;

  var scriptUrl = new URL(document.currentScript ? document.currentScript.src : "pwa-register.js", window.location.href);

  window.addEventListener("load", function () {
    var workerUrl = new URL("sw.js", scriptUrl);
    navigator.serviceWorker.register(workerUrl.pathname).catch(function () {
      // The site still works normally if PWA registration is unavailable.
    });
  });
})();
