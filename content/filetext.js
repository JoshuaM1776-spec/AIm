// Aim Plus — the text of a study guide or syllabus file, read in this browser: .txt and .md as they
// are, .docx from its document XML, and .pdf from its text drawing commands (most PDFs made from a
// document; not scans, and not every font encoding). Nothing is uploaded; the text goes into the
// study guide box, where the student sees and can edit what was read.

const FILE_MAX_BYTES = 10 * 1024 * 1024;

async function readFileText(file) {
  if (file.size > FILE_MAX_BYTES) throw new Error("That file is over 10 MB. Paste the part you need instead.");
  const name = file.name.toLowerCase();
  if (/\.(txt|md|markdown|text)$/.test(name) || file.type.startsWith("text/")) return (await file.text()).trim();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = name.endsWith(".docx") ? await docxText(bytes) : name.endsWith(".pdf") ? await pdfText(bytes) : null;
  if (text === null) throw new Error("Use a .txt, .docx or .pdf file, or paste the text.");
  if ((text.match(/\p{L}/gu) || []).length < 40)
    throw new Error("Couldn't read text from that file (it may be a scan). Copy the text and paste it instead.");
  return text;
}

const inflate = (data, format) => new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer().then(b => new Uint8Array(b));

// ---------- .docx: a zip; the text is in word/document.xml ----------
async function docxText(bytes) {
  const xml = await zipEntry(bytes, "word/document.xml");
  if (!xml) return "";
  const decode = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return decode(new TextDecoder().decode(xml)
    .replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\n{3,}/g, "\n\n").trim();
}

async function zipEntry(bytes, wanted) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  for (let n = 0; n < count && v.getUint32(p, true) === 0x02014b50; n++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const entry = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (entry === wanted) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      return method === 8 ? inflate(data, "deflate-raw") : method === 0 ? data : null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ---------- .pdf: the text its pages draw ----------
// Reads the PDF's objects (including compressed object streams), follows each page's fonts to their
// ToUnicode tables, and decodes the strings its text operators show. Not a full PDF reader: scans
// and unusual encodings come back empty, and the student is asked to paste instead.
async function pdfText(bytes) {
  const latin = b => new TextDecoder("latin1").decode(b);
  const src = latin(bytes);
  const objs = new Map(); // number → { dict, data (Uint8Array, decoded) }
  const objRe = /(\d+)\s+\d+\s+obj\b/g;
  let m;
  while ((m = objRe.exec(src))) {
    const bodyStart = m.index + m[0].length, end = src.indexOf("endobj", bodyStart);
    if (end < 0) break;
    let dict = src.slice(bodyStart, end), data = null;
    const st = dict.search(/\bstream\r?\n/);
    if (st >= 0) {
      const head = dict.slice(0, st), from = bodyStart + st + dict.slice(st).match(/^stream\r?\n/)[0].length;
      const len = head.match(/\/Length\s+(\d+)\b(?!\s+\d+\s+R)/);
      let to = len ? from + Number(len[1]) : src.indexOf("endstream", from);
      if (!len) while (to > from && /[\r\n]/.test(src[to - 1])) to--; // the line break before "endstream"
      data = await pdfDecode(head, bytes.subarray(from, to));
      dict = head;
    }
    objs.set(Number(m[1]), { dict, data });
    objRe.lastIndex = end;
  }
  // Objects packed inside object streams.
  for (const [, o] of [...objs]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict) || !o.data) continue;
    const n = Number(o.dict.match(/\/N\s+(\d+)/)?.[1] || 0), first = Number(o.dict.match(/\/First\s+(\d+)/)?.[1] || 0);
    const text = latin(o.data), head = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = head[2 * i], off = first + head[2 * i + 1], next = i + 1 < n ? first + head[2 * i + 3] : text.length;
      if (!objs.has(num)) objs.set(num, { dict: text.slice(off, next), data: null });
    }
  }
  const ref = s => { const r = String(s || "").trim().match(/^(\d+)\s+\d+\s+R/); return r ? objs.get(Number(r[1])) : null; };
  const value = (dict, key) => { // a key's value: a nested dictionary, an array, a reference or a name
    const i = dict.search(new RegExp(`/${key}(?![A-Za-z])`));
    if (i < 0) return null;
    const rest = dict.slice(i + key.length + 1).trimStart();
    if (rest.startsWith("<<")) return balanced(rest, "<<", ">>");
    if (rest.startsWith("[")) return balanced(rest, "[", "]");
    return rest.match(/^(\d+\s+\d+\s+R|\/[^\s/<>\[\]()]+|[^\s/<>\[\]()]+)/)?.[0] || null;
  };
  const resolveDict = v => (v && /^\d+\s+\d+\s+R/.test(v) ? ref(v)?.dict || "" : v || "");
  const cmaps = new Map();
  const fontMap = fontDict => {
    const fonts = new Map();
    for (const [, name, num] of resolveDict(fontDict).matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
      const fontObj = objs.get(Number(num));
      const tu = fontObj && value(fontObj.dict, "ToUnicode");
      const cm = tu && ref(tu);
      if (cm?.data && !cmaps.has(cm)) cmaps.set(cm, parseCMap(latin(cm.data)));
      fonts.set(name, cm ? cmaps.get(cm) : null);
    }
    return fonts;
  };
  // Pages in reading order: walk the page tree from the catalog; fall back to file order.
  const isPage = o => /\/Type\s*\/Page(?![s\w])/.test(o.dict);
  const pages = [];
  const walk = (node, depth) => {
    if (!node || depth > 20 || pages.length > 2000) return;
    if (isPage(node)) { pages.push(node); return; }
    for (const [, n] of (value(node.dict, "Kids") || "").matchAll(/(\d+)\s+\d+\s+R/g)) walk(objs.get(Number(n)), depth + 1);
  };
  const catalog = [...objs.values()].find(o => /\/Type\s*\/Catalog/.test(o.dict));
  walk(catalog && ref(value(catalog.dict, "Pages")), 0);
  if (!pages.length) pages.push(...[...objs.values()].filter(isPage));
  const out = [];
  for (const page of pages) {
    let res = value(page.dict, "Resources"), node = page;
    for (let up = 0; !res && node && up < 10; up++) { node = ref(value(node.dict, "Parent")); res = node && value(node.dict, "Resources"); }
    const fonts = fontMap(value(resolveDict(res), "Font"));
    const contents = value(page.dict, "Contents") || "";
    const streams = [...contents.matchAll(/(\d+)\s+\d+\s+R/g)].map(r => objs.get(Number(r[1]))?.data).filter(Boolean);
    const text = pdfOperators(streams.map(latin).join("\n"), fonts);
    if (text) out.push(text);
  }
  // Symbol-font bullets come out as private-use characters: drop them, and stray control characters.
  return out.join("\n\n").replace(/[\uE000-\uF8FF\u0000-\u0008\u000B\u000C\u000E-\u001F\u00AD]/g, "")
    .replace(/[^\S\n]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function balanced(s, open, close) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith(open, i)) { depth++; i += open.length - 1; }
    else if (s.startsWith(close, i)) { depth--; i += close.length - 1; if (!depth) return s.slice(0, i + 1); }
  }
  return s;
}

// Undo the stream's filters, in order: Flate (zlib) and ASCII85; anything else (images) is skipped.
async function pdfDecode(dict, data) {
  const filters = [...(dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1] || "").matchAll(/\/(\w+)/g)].map(f => f[1]);
  for (const f of filters) {
    if (f === "FlateDecode") { try { data = await inflate(data, "deflate"); } catch { return null; } }
    else if (f === "ASCII85Decode") data = ascii85(data);
    else return null;
  }
  return data;
}

function ascii85(data) {
  const s = new TextDecoder("latin1").decode(data).replace(/\s+/g, "").replace(/^<~/, "").replace(/~>.*$/, "");
  const out = [];
  for (let i = 0; i < s.length;) {
    if (s[i] === "z") { out.push(0, 0, 0, 0); i++; continue; }
    const chunk = s.slice(i, i + 5), pad = 5 - chunk.length;
    let n = 0;
    for (const ch of chunk.padEnd(5, "u")) n = n * 85 + (ch.charCodeAt(0) - 33);
    const four = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...four.slice(0, 4 - pad));
    i += 5;
  }
  return new Uint8Array(out);
}

// A ToUnicode CMap: character codes (as hex) to text, and how many bytes a code takes.
function parseCMap(s) {
  const map = new Map();
  const u16 = hex => { let t = ""; for (let i = 0; i + 3 < hex.length; i += 4) t += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return t; };
  let bytes = 0;
  for (const [, block] of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, from, to] of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) { map.set(from.toLowerCase(), u16(to)); bytes ||= from.length / 2; }
  for (const [, block] of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, lo, hi, rest] of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      bytes ||= lo.length / 2;
      const a = parseInt(lo, 16), b = parseInt(hi, 16), list = rest.startsWith("[") ? [...rest.matchAll(/<([0-9a-fA-F]*)>/g)].map(x => x[1]) : null;
      for (let c = a; c <= b && c - a < 65536; c++) {
        const key = c.toString(16).padStart(lo.length, "0");
        if (list) map.set(key, u16(list[c - a] || ""));
        else { const base = rest.slice(1, -1); map.set(key, u16(base.slice(0, -4) + (parseInt(base.slice(-4), 16) + c - a).toString(16).padStart(4, "0"))); }
      }
    }
  return { map, bytes: bytes || 1 };
}

// The strings a content stream shows, decoded through the current font's CMap when it has one.
function pdfOperators(s, fonts) {
  if (!/\bBT\b/.test(s)) return "";
  const unescape = t => t.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, e) => ({ n: "\n", r: "", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" }[e] ??
    (/^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : "")));
  let cmap = null, out = "";
  const show = raw => { // raw: a string of byte values (0–255)
    if (!cmap) return raw;
    let t = "";
    for (let i = 0; i < raw.length; i += cmap.bytes) {
      const key = [...raw.slice(i, i + cmap.bytes)].map(ch => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("");
      t += cmap.map.get(key) ?? "";
    }
    return t;
  };
  const hexBytes = h => { h = h.replace(/\s+/g, ""); if (h.length % 2) h += "0"; let t = ""; for (let i = 0; i < h.length; i += 2) t += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); return t; };
  const str = x => (x.startsWith("(") ? unescape(x.slice(1, -1)) : hexBytes(x.slice(1, -1)));
  const num = "(-?[\\d.]+)";
  const tok = new RegExp(`\\/([^\\s/<>\\[\\]()]+)\\s+[\\d.]+\\s+Tf|(\\((?:\\\\[\\s\\S]|[^\\\\)])*\\)|<[0-9a-fA-F\\s]*>)\\s*(?:Tj|'|")|\\[((?:\\\\[\\s\\S]|[^\\]])*)\\]\\s*TJ|` +
    `${num}\\s+${num}\\s+T[dD]\\b|(?:${num}\\s+){5}${num}\\s+Tm\\b|\\b(?:T\\*|ET)\\b`, "g");
  let lineY = null;
  let m;
  while ((m = tok.exec(s))) {
    if (m[1]) { cmap = fonts.get(m[1]) || null; continue; }
    if (m[2]) { out += show(str(m[2])); continue; }
    if (m[3] !== undefined) {
      for (const part of m[3].matchAll(/\((?:\\[\s\S]|[^\\)])*\)|<[0-9a-fA-F\s]*>|-?\d+(?:\.\d+)?/g)) {
        const x = part[0];
        if (x.startsWith("(") || x.startsWith("<")) out += show(str(x));
        else if (Number(x) < -200) out += " "; // a wide gap between words
      }
      continue;
    }
    // Moving the text position: a new line only when it moves up or down; along the line, nothing.
    if (m[4] !== undefined) { if (Math.abs(Number(m[5])) > 0.5) out += "\n"; continue; }
    if (m[7] !== undefined) { const y = Number(m[7]); if (lineY !== null && Math.abs(y - lineY) > 0.5) out += "\n"; lineY = y; continue; }
    out += "\n"; // T* (next line), or the end of a text block
  }
  return out.replace(/ {2,}/g, " ").trim();
}
