// Aim Plus — "In this video": beside a video watched for a learning aim, the concepts it covers,
// each with a jump to its chapter and a couple of places to see the same idea in another context;
// and "Test me on this video", offered when it ends. Aim works the concepts out from what the page
// shows (title, description, chapters) and, with captions on (content/captions.js), what was said;
// the panel says which. Never the audio. One AI call per video,
// kept in this browser (see saveVideoConcepts in store.js).

let concepts = null; // { id, state: "loading" | "ready" | "error", data, info, message }
let conceptsEndedFor = null;

// A learning aim, on Aim Plus: a study session, today's Homeschool plan, or a goal the
// librarian classed as learning.
const conceptsWanted = p => !!(account.plus && p && !brk && (p.librarian?.kind === "learn" || p.study || p.plan));

// "4:10 Density altitude" lines in the description, which is how YouTube's chapters are written,
// plus the chapters panel if YouTube has rendered it.
function readChapters(description) {
  const out = [], seen = new Set();
  const add = (t, title) => { title = squash(title).replace(/^[-–—:|•]\s*/, ""); if (title && !seen.has(t)) { seen.add(t); out.push({ t, title }); } };
  for (const line of String(description || "").split("\n")) {
    const m = line.match(/^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.{2,120})$/);
    if (m) add((+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]), m[4]);
  }
  for (const item of $$(YT.chapterItems)) {
    const time = squash(first(YT.chapterTime, item)?.textContent).split(":").map(Number);
    if (time.length < 2 || time.some(Number.isNaN)) continue;
    add(time.reduce((s, n) => s * 60 + n, 0), first(YT.chapterTitle, item)?.textContent);
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 60);
}

const mmss = s => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}`) + `:${String(s % 60).padStart(2, "0")}`;

// The title and description as the watch page shows them, once YouTube has filled them in for this
// video (it reuses the page between videos, so wait for it to catch up).
async function pageVideoInfo(id) {
  const known = currentInfo?.id === id ? currentInfo : {};
  for (let i = 0; i < 20 && currentId === id; i++) {
    const title = squash($(YT.watchTitle)?.textContent);
    const d = $(YT.watchDescription);
    if ($(YT.watchFlexy)?.getAttribute("video-id") === id && title && d) {
      return { id, title: known.title || title, channel: known.channel || squash(channelLink()?.textContent), description: (d.innerText || d.textContent || "").trim() };
    }
    await sleep(250);
  }
  return { id, title: known.title || document.title.replace(/ - YouTube$/, "").trim(), channel: known.channel || "", description: known.description || "" };
}

async function loadConcepts(id, p) {
  concepts = { id, state: "loading" };
  const cached = await send({ type: "video-concepts-get", id });
  const info = await pageVideoInfo(id);
  if (currentId !== id) return;
  if (cached?.data) { concepts = { id, state: "ready", data: cached.data, info }; return renderConcepts(); }
  renderConcepts();
  // With captions on (Aim Plus): what was said, too, so concepts can point at the moment they're explained.
  const cap = settings.captions ? await captionsFor(id) : null;
  if (currentId !== id) return;
  const r = await send({ type: "librarian", task: "video-concepts", input: {
    id, title: info.title, channel: info.channel, description: (info.description || "").slice(0, 5000), chapters: readChapters(info.description), target: p.text,
    ...(cap ? { captions: captionExcerpt(cap, `${p.text} ${info.title}`, 9000), auto: cap.auto } : {}) } });
  if (currentId !== id) return;
  if (!r || r.error) { concepts = { id, state: "error", info, message: r?.code === "limit" ? "That's today's AI limit." : "Couldn't look at this video right now." }; return renderConcepts(); }
  const { ok, ...data } = r;
  send({ type: "video-concepts-save", id, data });
  concepts = { id, state: "ready", data, info };
  renderConcepts();
}

function seekTo(t) {
  const v = getVideoEl();
  if (!v) return;
  v.currentTime = t;
  v.play?.().catch(() => {});
}

// TeachBack on this video: the concepts go in as the student's study notes, with where they came
// from, so the questions stay on what the video covers. Its result goes back to a study session or
// today's plan when the video belongs to one.
function testOnVideo() {
  const p = activePurpose();
  const { data, info } = concepts;
  const notes = [`The video “${info.title}”${info.channel ? ` (${info.channel})` : ""}. From its ${data.basis}, it covers:`,
    ...data.concepts.map(c => `- ${c.name}: ${c.summary}`),
    data.references?.length ? `Authoritative references: ${data.references.join("; ")}.` : ""].filter(Boolean).join("\n");
  const st = activeStudy(p);
  const topic = st?.topics.find(t => t.videos.some(v => v.id === concepts.id));
  closeNotice();
  send({ type: "open-teachback", topic: info.title.slice(0, 200), notes: notes.slice(0, 3000), study: topic?.id, plan: p?.plan, video: concepts.id });
}

function conceptRow(c) {
  return el("details", { class: "wp-concept" },
    el("summary", {},
      el("span", { class: "wp-concept-name" }, c.name),
      c.basis === "likely" ? el("span", { class: "wp-concept-likely", title: "Not named in the chapters or description, but very likely covered given the video's subject." }, "likely") : null,
      c.chapter ? el("button", { class: "wp-concept-time", title: `Jump to “${c.chapter.title}”`, onclick: e => { e.preventDefault(); seekTo(c.chapter.t); } }, mmss(c.chapter.t)) : null),
    el("div", { class: "wp-concept-body" },
      el("div", { class: "wp-muted wp-concept-summary" }, c.summary),
      c.contexts.length ? el("div", { class: "wp-label" }, "See it in another context") : null,
      ...c.contexts.map(k => el("a", { class: "wp-concept-context", href: `/results?search_query=${encodeURIComponent(k.search)}`, target: "_blank", rel: "noopener" },
        icon("search"), el("span", {}, k.label))),
      el("button", { class: "wp-concept-ask", onclick: () => askYouTubeAbout(c) }, icon("ask"), "Ask YouTube about this")));
}

// YouTube's AI answers from the video's transcript, which Aim doesn't read. So Aim suggests the
// question (it knows what's worth asking) and points to YouTube's Ask, which answers it: the button
// under the video if there is one, otherwise Ask in the search bar. It copies the question; it
// never types into YouTube's AI or reads its answer.
async function askYouTubeAbout(c) {
  const button = youTubeAskButton();
  const title = concepts?.info?.title || "";
  const question = button ? `What does this video say about ${c.name.toLowerCase()}? Where in the video?`
    : `In the YouTube video “${title}”, what does it say about ${c.name.toLowerCase()}, and where?`;
  let copied = false;
  try { await navigator.clipboard.writeText(question); copied = true; } catch {}
  const target = button || first(YT.searchBox);
  if (target) {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("wp-point-here");
    setTimeout(() => target.classList.remove("wp-point-here"), 4000);
    if (!button) target.focus();
  }
  toast(copied ? `Question copied. Paste it into ${button ? "YouTube's Ask, under the video" : "Ask in YouTube's search bar"}.`
    : `Ask YouTube: “${question}”`);
}

function renderConcepts() {
  const existing = $("#wp-concepts");
  const p = activePurpose();
  if (!account.checkedAt && location.pathname === "/watch") { librarianOn().then(() => { if (account.checkedAt) renderConcepts(); }); return; }
  const host = location.pathname === "/watch" && conceptsWanted(p) ? sidebarHost() : null;
  if (!host || !currentId) { existing?.remove(); return; }
  if (concepts?.id !== currentId) { existing?.remove(); loadConcepts(currentId, p); return; }
  const d = concepts.data;
  if (concepts.state === "ready" && !d.concepts.length) { existing?.remove(); return; } // not an educational video
  const key = `${concepts.id}|${concepts.state}`;
  if (existing && existing.dataset.key === key && existing.parentElement === host) return;
  existing?.remove();
  const panel = el("div", { id: "wp-concepts", class: "wp wp-concepts", "data-key": key },
    el("div", { class: "wp-row-between" },
      el("div", { class: "wp-strong" }, "In this video"),
      concepts.state === "ready" ? el("span", { class: "wp-muted" }, `${d.concepts.length} concepts`) : null),
    ...(concepts.state === "loading" ? [el("div", { class: "wp-muted" }, `${BRAND} is looking at what this video covers…`)]
      : concepts.state === "error" ? [el("div", { class: "wp-muted" }, concepts.message, " ",
          el("button", { class: "wp-link", onclick: () => { concepts = null; renderConcepts(); } }, "Try again"))]
      : [el("div", { class: "wp-muted wp-concepts-basis" }, /captions/.test(d.basis) ? `From the video's ${d.basis}.` : `From the video's ${d.basis}, not what was said.`),
        el("div", { class: "wp-concepts-list" }, ...d.concepts.map(conceptRow)),
        d.regulated ? el("div", { class: "wp-concepts-note" },
          d.references.length ? el("b", {}, "Study with: ") : null,
          d.references.length ? `${d.references.join("; ")}. ` : null,
          `${BRAND} supports study; it doesn't replace a certified instructor.`) : null,
        el("button", { class: "wp-btn wp-btn-tonal wp-btn-block wp-concepts-test", onclick: testOnVideo }, icon("ask"), "Test me on this video")]));
  // Under today's plan or the study session, above Up next.
  const after = $("#wp-plan-panel") || $("#wp-study");
  if (after?.parentElement === host) after.after(panel); else host.prepend(panel);
  watchForEnd();
}

// When the video ends (never during it), offer the test once.
function watchForEnd() {
  const v = getVideoEl();
  if (!v || conceptsEndedFor === concepts?.id) return;
  const id = concepts.id;
  conceptsEndedFor = id;
  v.addEventListener("ended", () => {
    if (currentId !== id || concepts?.state !== "ready" || !concepts.data.concepts.length) return;
    showNotice([el("div", { class: "wp-notice-text" }, el("b", {}, "Finished. Test yourself on this video?"),
      el("div", { class: "wp-muted" }, `A few questions on ${concepts.data.concepts.slice(0, 3).map(c => c.name.toLowerCase()).join(", ")}${concepts.data.concepts.length > 3 ? " and more" : ""}.`)),
      el("button", { class: "wp-btn wp-btn-primary", onclick: testOnVideo }, "Test me")]);
  }, { once: true });
}
