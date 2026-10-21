// Tests for content/captions.js: finding a video's caption track, reading it (json3, or the older XML),
// and the excerpt that goes to the librarian. Run: node tests/captions.test.mjs
import assert from "node:assert";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../content/captions.js", import.meta.url), "utf8");
function load({ pages = {}, current = null, settings = { captions: true } } = {}) {
  const stats = [], fetched = [];
  const ctx = {
    settings, URL, navigator: { language: "en-US" }, location: { origin: "https://www.youtube.com" },
    document: { scripts: [] }, videoIdFromUrl: () => current,
    send: m => { if (m.type === "captions-stat") stats.push(m.found); return Promise.resolve(null); },
    fetch: async url => {
      const u = String(url); fetched.push(u);
      const body = Object.entries(pages).find(([k]) => u.includes(k))?.[1];
      if (body === undefined) return { ok: false, text: async () => "", json: async () => null };
      return { ok: true, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), json: async () => (typeof body === "string" ? JSON.parse(body) : body) };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src + "\n;globalThis.api = { pickTrack, parseJson3, parseXml, captionsFor, captionExcerpt, sessionCaptions };", ctx);
  return { ...ctx.api, stats, fetched };
}
const watchHtml = (id, tracks) => `<html><script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: id },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } })};</script></html>`;

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("the creator's captions in your language come first, then English, then automatic ones", () => {
  const { pickTrack } = load();
  const t = [{ languageCode: "en", kind: "asr", baseUrl: "a" }, { languageCode: "fr", baseUrl: "b" }, { languageCode: "en", baseUrl: "c" }];
  assert.strictEqual(pickTrack(t).baseUrl, "c");
  assert.strictEqual(pickTrack([t[0], t[1]]).baseUrl, "a", "English automatic beats another language's");
  assert.strictEqual(pickTrack([]), null);
});

test("json3 and the older XML both read as timed lines", () => {
  const { parseJson3, parseXml } = load();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(parseJson3({ events: [{ tStartMs: 1500, segs: [{ utf8: "Rome " }, { utf8: "fell\nslowly" }] }, { tStartMs: 3000 }, { tStartMs: 65000, segs: [{ utf8: "  " }] }] }))),
    [{ t: 1, text: "Rome fell slowly" }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(parseXml('<transcript><text start="62.4" dur="2">the army&amp;#39;s pay</text><text start="70">&lt;b&gt;land&lt;/b&gt;</text></transcript>'))),
    [{ t: 62, text: "the army's pay" }, { t: 70, text: "land" }]);
});

test("captions for a video: its watch page, then its track as json3; XML when json3 is empty; nothing when there's no track", async () => {
  const json3 = { events: [{ tStartMs: 0, segs: [{ utf8: "Welcome back" }] }, { tStartMs: 50000, segs: [{ utf8: "the Marian reforms changed the army" }] }] };
  let c = load({ pages: { "/watch?v=v1": watchHtml("v1", [{ languageCode: "en", baseUrl: "/api/timedtext?v=v1&lang=en" }]), "/api/timedtext?v=v1": json3 } });
  const cap = await c.captionsFor("v1");
  assert.strictEqual(cap.auto, false);
  assert.strictEqual(cap.lines.length, 2);
  assert.ok(c.fetched.some(u => u.includes("fmt=json3")));
  assert.deepStrictEqual(c.stats, [true], "how often captions were there is counted");
  await c.captionsFor("v1");
  assert.strictEqual(c.fetched.length, 2, "asked once per page");
  c = load({ pages: { "/watch?v=v2": watchHtml("v2", [{ languageCode: "en", kind: "asr", baseUrl: "/api/timedtext?v=v2" }]),
    "fmt=json3": "{}", "/api/timedtext?v=v2": '<transcript><text start="3">hello</text></transcript>' } });
  const xml = await c.captionsFor("v2");
  assert.ok(xml.auto && xml.lines[0].text === "hello", "fell back to XML");
  c = load({ pages: { "/watch?v=v3": watchHtml("v3", []) } });
  assert.strictEqual(await c.captionsFor("v3"), null);
  assert.deepStrictEqual(c.stats, [false]);
});

test("the excerpt: the passages about the aim, in the video's order, with times, within the size", () => {
  const { captionExcerpt } = load();
  const filler = i => `filler sentence number ${i} about weather and sports and cooking`.repeat(4);
  const lines = Array.from({ length: 40 }, (_, i) => ({ t: i * 50, text: i === 17 ? "the Marian reforms made soldiers loyal to their generals" : i === 30 ? "grain prices and taxes drained the treasury" : filler(i) }));
  const ex = captionExcerpt({ lines }, "why did the roman republic fall marian reforms generals treasury taxes", 1200);
  assert.ok(ex.length <= 1200, ex.length);
  assert.match(ex, /^\[0:00\] /, "the opening, for context");
  assert.match(ex, /\[14:10\] the Marian reforms/);
  assert.match(ex, /\[25:00\] grain prices/);
  assert.ok(ex.indexOf("14:10") < ex.indexOf("25:00"), "in the video's order");
  const short = captionExcerpt({ lines: lines.slice(0, 2) }, "anything", 5000);
  assert.strictEqual(short.split("\n").length, 2, "a short video goes in whole");
});

test("a conversation gets excerpts for the three videos watched longest, only with captions on", async () => {
  const pages = {};
  for (const id of ["a", "b", "c", "d"]) { pages[`/watch?v=${id}`] = watchHtml(id, [{ languageCode: "en", baseUrl: `/api/timedtext?v=${id}` }]); pages[`/api/timedtext?v=${id}`] = { events: [{ tStartMs: 0, segs: [{ utf8: `video ${id}` }] }] }; }
  const vids = [{ id: "a", minutes: 1 }, { id: "b", minutes: 9 }, { id: "c", minutes: 5 }, { id: "d", minutes: 7 }];
  const on = await load({ pages }).sessionCaptions(vids, "x");
  assert.deepStrictEqual(Object.keys(on).sort(), ["b", "c", "d"]);
  assert.strictEqual(on.b.captions, "creator");
  assert.deepStrictEqual(Object.keys(await load({ pages, settings: { captions: false } }).sessionCaptions(vids, "x")), [], "off: none");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message.split("\n").join("\n       ")}`); }
}
console.log(failed ? `\n${failed} failed` : `\nall ${tests.length} passed`);
process.exitCode = failed ? 1 : 0;
