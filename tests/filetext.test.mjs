// The study guide file reader (content/filetext.js), on real files: a Word document, PDFs printed by
// Chrome, LibreOffice and ReportLab (font tables, ASCII85, indirect lengths), page order, and a
// file that isn't really a PDF. Run: node tests/filetext.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert";

const here = new URL(".", import.meta.url).pathname;
const ctx = vm.createContext({ TextDecoder, Response, Blob, DecompressionStream, Uint8Array, DataView, Map, Error, Number, String, Array, parseInt, Math, RegExp });
vm.runInContext(readFileSync(here + "../content/filetext.js", "utf8") + "\n;globalThis.readFileText = readFileText;", ctx);
const read = name => {
  const buf = readFileSync(here + "fixtures/" + name);
  return ctx.readFileText({ name, size: buf.length, type: "", text: async () => buf.toString("utf8"),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
};

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const lines = t => t.split("\n").map(l => l.trim()).filter(Boolean);
const SYLLABUS = ["BIO 110: Cellular Respiration Unit", "Exam on Friday, October 23. Covers chapters 7 and 8.",
  "Glycolysis: where it happens, inputs and outputs, net ATP", "Pyruvate oxidation and the Krebs cycle"];

test("a Word document reads exactly, with its paragraphs", async () => {
  const t = await read("syllabus.docx");
  for (const l of SYLLABUS) assert.ok(lines(t).includes(l), l);
  assert.ok(t.includes("“anaerobic”"), "curly quotes survive");
});
test("a PDF printed by Chrome (font tables) reads as its lines", async () => {
  const t = await read("syllabus-chrome.pdf");
  for (const l of SYLLABUS) assert.ok(lines(t).includes(l), l);
  assert.ok(t.includes("Fermentation (lactic acid and alcoholic) — “anaerobic” conditions"));
});
test("a PDF from LibreOffice (indirect lengths, symbol bullets) reads without stray characters", async () => {
  const t = await read("syllabus-libreoffice.pdf");
  for (const l of SYLLABUS) assert.ok(lines(t).includes(l), l);
  assert.ok(!/[-]|\n{3,}/.test(t));
});
test("a PDF from ReportLab (ASCII85 over Flate) reads", async () => {
  const t = await read("syllabus-reportlab.pdf");
  for (const l of SYLLABUS) assert.ok(lines(t).includes(l), l);
});
test("pages come in reading order", async () => {
  const t = lines(await read("three-pages.pdf"));
  assert.deepStrictEqual(t.map(l => l.slice(0, 6)), ["Page 1", "Page 2", "Page 3"]);
});
test("a file with no readable text says to paste instead", async () => {
  await assert.rejects(read("broken.pdf"), /paste it instead/);
  await assert.rejects(ctx.readFileText({ name: "notes.pages", size: 10, type: "", arrayBuffer: async () => new ArrayBuffer(10) }), /\.txt, \.docx or \.pdf/);
  await assert.rejects(ctx.readFileText({ name: "big.pdf", size: 11 * 1024 * 1024, type: "" }), /over 10 MB/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log("  ok  " + name); } catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
