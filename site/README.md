# Aim's website

The public site people download Aim from: the home page (`index.html`), the privacy policy
(`privacy.html`, generated from `PRIVACY.md`; the Chrome Web Store needs one at a public URL) and a
page for installing the preview by hand (`install.html`) until the store listing is live. Plain
HTML, CSS and a little JavaScript; nothing loads from other sites; no analytics.

## Before publishing

1. `node tools/build-site.mjs --preview` copies Aim's colors, fonts, mark and book covers into
   `assets/`, regenerates `privacy.html` from `PRIVACY.md`, and zips the last commit's extension into
   `download/aim-preview.zip` (not committed). Run it again whenever `PRIVACY.md` changes.
2. Fill in `PRIVACY.md`'s contact email (it says `[contact email]`), then rebuild.
3. Edit `config.js`: `contactEmail`; `plusPrice` once it's set; at launch, `storeUrl` (the Chrome Web
   Store listing) and `preview: false`.
4. `node tests/site.test.mjs` checks links, the privacy page and the phone layout.

## Hosting (free options)

The `site` folder is the whole website. Any static host works:

- **Cloudflare Pages** or **Netlify:** create a site and upload the `site` folder (both have a
  drag-and-drop upload). Then add your domain in the host's settings.
- **GitHub Pages:** needs a public repository (or a paid GitHub plan for a private one). Put the
  folder's contents in a public repo and turn on Pages.

Then put `https://<your domain>/privacy.html` in the Chrome Web Store form's Privacy policy URL
(STORE_LISTING.md).
