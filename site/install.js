// The preview page: once Aim is on the Chrome Web Store (config.js), it points there instead.
(() => {
  const C = window.AIM_SITE || {};
  if (C.storeUrl) { document.getElementById("store").hidden = false; document.getElementById("preview").hidden = true; }
  if (C.contactEmail) document.getElementById("ask").hidden = false;
})();
