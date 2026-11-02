// Aim's website: points the download buttons at the Chrome Web Store once there's a listing
// (config.js), shows the Plus price and contact address when set, and draws the library shelf
// with the extension's own book covers (assets/covers.js).
(() => {
  const C = window.AIM_SITE || {};
  for (const a of document.querySelectorAll("[data-get]")) {
    if (C.storeUrl) { a.href = C.storeUrl; a.rel = "noopener"; }
    else if (!C.preview) { a.removeAttribute("href"); a.textContent = "Coming soon to the Chrome Web Store"; a.classList.add("tonal"); }
    else a.textContent = "Try the preview";
  }
  const note = document.querySelector("[data-get-note]");
  if (note && !C.storeUrl) note.textContent = C.preview ? "Coming soon to the Chrome Web Store. Until then, testers can install the preview." : "Free · Chrome, Edge and Brave on a computer";
  const price = document.querySelector("[data-plus-price]");
  if (price && C.plusPrice) price.textContent = C.plusPrice;
  const contact = document.querySelector("[data-contact]");
  if (contact && C.contactEmail) { contact.href = `mailto:${C.contactEmail}`; contact.hidden = false; }
  // Homeschool early access: an email, once there's an address to write to.
  const early = document.querySelector("[data-early]");
  if (early && C.contactEmail) {
    early.href = `mailto:${C.contactEmail}?subject=${encodeURIComponent("Aim Homeschool early access")}`;
    early.hidden = false;
  }

  // The shelf: four goals as Aim draws them.
  const shelf = document.getElementById("shelf");
  if (shelf && typeof cover === "function") {
    const books = [
      { text: "Understand how airplane stalls work", subject: { id: "aviation", name: "Aviation" } },
      { text: "Learn to sharpen my chisels", subject: { id: "craft", name: "Craft" } },
      { text: "Why did the Roman Republic fall", subject: { id: "history", name: "History" } },
      { text: "Pass my biology exam", subject: { id: "science", name: "Science" }, state: "completed" }
    ];
    shelf.append(...books.map(b => cover(b, "shelf")));
  }
})();
