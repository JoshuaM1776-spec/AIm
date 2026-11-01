// Aim — TeachBack on YouTube: talking a session through with one practice student (0.66), in a small
// panel at the bottom right. The librarian reads the session; the student asks.
// It always arrives with a specific question about what you've been watching, never an empty box;
// it listens, sometimes adds something, and knows when to stop (supabase/functions/ai/talk.ts).
// Opened from the card after Done, the Explore invitation on the homepage, "This connects to…" while
// watching, and Aim's menu (Talk it through). Signed-in accounts; free ones get one conversation a day.
// With Aim Plus, what you explained is remembered in this browser (Settings lists it).

let talkPanel = null;

function closeTalk() { talkPanel?.el.remove(); talkPanel = null; }

const talkCall = (state, extra = {}) => send({ type: "librarian", task: "librarian-talk",
  input: { mode: state.mode, session: state.session, thread: state.thread.map(({ role, text }) => ({ role, text })), memory: state.memory, connect: state.connect, focus: state.focus, followUp: state.followUp ? { title: state.followUp.title, what: state.followUp.what } : undefined,
    student: state.student?.key, studentName: state.student?.name, review: state.review || undefined, ...extra } });

// Everything a conversation needs, with its opening question already asked. Null when there's
// nothing to talk about, no account, or the AI couldn't open (the error is in .error).
// mode "deeper" (Aim Plus) goes one "why" further into focus: { title, brief, chain }, from an aim's page.
// followUp: a gap { id, title, what } they've since watched something about; the first question is about it.
async function prepareTalk({ aimId = null, connect = null, source = "menu", mode = null, focus = null, followUp = null, review = null } = {}) {
  const brief = await send({ type: "plus-brief" });
  if (!brief?.account) return { error: "Sign in to talk things through with the librarian." };
  // Spaced review: one question about something explained weeks ago; no session needed.
  if (mode === "review" && review?.idea) {
    const state = { aimId: review.aimId || null, mode: "review", reviewKey: review.key, student: studentFor(review.key),
      review: { subject: review.subject, idea: review.idea, daysAgo: review.daysAgo },
      session: { aim: review.aimText || review.subject, searches: [], videos: [], minutes: 0 },
      thread: [], plus: brief.plus === true, remember: false, source, done: false, busy: false, memory: [] };
    const r = await talkCall(state, { opening: true });
    if (!r || r.error) return { error: r?.error || "Couldn't start the review just now. Try again later." };
    state.thread.push({ role: "aim", text: r.message });
    return state;
  }
  const ctx = await send({ type: "talk-session", id: aimId });
  if (!ctx || ctx.result !== "applied") return { error: ctx?.message || "Nothing to talk about yet." };
  const mapped = ctx.session.map?.parts?.some(x => x.status !== "new");
  if (!ctx.session.videos.length && !ctx.session.searches.length && !mapped && mode !== "deeper") return { error: "Watch something first, then let's talk it through." };
  const plus = brief.plus === true, remember = plus && settings.librarianMemory !== false;
  // A learning aim that's nearly there finishes by putting it together; asked for, or offered after Done.
  const synthesis = mode === "synthesis" || (source === "done" && ctx.ready);
  const state = { aimId: ctx.id, mode: mode === "deeper" && focus?.title ? "deeper" : synthesis ? "synthesis" : ctx.mode, focus: mode === "deeper" ? focus : null, followUp,
    session: ctx.session, thread: [], connect, plus, remember, source, done: false, busy: false, student: studentFor(ctx.id),
    memory: remember ? (await send({ type: "memory-for", id: ctx.id })) || [] : [] };
  // Aim Plus, with captions on: what was actually said in the videos watched longest.
  if (plus && settings.captions) {
    const caps = await sessionCaptions(state.session.videos, state.session.aim);
    state.session = { ...state.session, videos: state.session.videos.map(v => (caps[v.id] ? { ...v, ...caps[v.id] } : v)) };
  }
  const r = await talkCall(state, { opening: true });
  if (!r || r.error) return { error: r?.error || "The librarian couldn't start just now. Try again in a minute." };
  state.thread.push({ role: "aim", text: r.message });
  return state;
}

// Another video the librarian suggests comes as a search; Aim shows the first video YouTube's own
// search finds for it (read from the results page's data), so the card is a real video, not a promise.
const topCache = new Map();
async function topResult(query) {
  if (topCache.has(query)) return topCache.get(query);
  let out = null;
  try {
    const r = await fetch(`/results?search_query=${encodeURIComponent(query)}`, { credentials: "include" });
    const html = r.ok ? await r.text() : "", at = html.indexOf("var ytInitialData = ");
    if (at >= 0) {
      const from = at + "var ytInitialData = ".length;
      const data = JSON.parse(html.slice(from, html.indexOf(";</script>", from)));
      const vr = findAll(data, "videoRenderer").find(v => /^[\w-]{6,20}$/.test(v.videoId || ""));
      const lk = vr ? null : findAll(data, "lockupViewModel").find(l => l.contentType === "LOCKUP_CONTENT_TYPE_VIDEO");
      if (vr) out = { id: vr.videoId, title: vr.title?.runs?.map(x => x.text).join("") || "", channel: vr.ownerText?.runs?.[0]?.text || "", length: vr.lengthText?.simpleText || "" };
      else if (lk?.contentId) out = { id: lk.contentId, title: lk.metadata?.lockupMetadataViewModel?.title?.content || "", channel: "", length: "" };
    }
  } catch { out = null; }
  topCache.set(query, out);
  return out;
}
const VIDEO_KIND = { visual: "A visual explanation", simpler: "A simpler explanation", perspective: "A different perspective", deeper: "Going deeper" };

// Cards under the librarian's message: the video, what kind it is, and why. Watching it keeps it with
// the aim (picking the aim up again first if it was finished).
function suggestedVideos(state, m) {
  const row = el("div", { class: "wp-talk-videos" });
  const card = (s, v) => el("button", { class: "wp-talk-video", title: v ? v.title : `Search: ${s.search}`, onclick: async () => {
    if (activePurpose()?.id !== state.aimId) {
      const r = await send({ type: "purpose-resume", id: state.aimId });
      if (!r || r.result !== "applied") return toast(r?.message || "Couldn't do that. Try again.");
    }
    if (!v) { location.href = `/results?search_query=${encodeURIComponent(s.search)}`; return; }
    await send({ type: "purpose-allow", query: s.search, videos: [{ id: v.id, title: v.title, channel: v.channel }], lists: [] });
    location.href = `/watch?v=${encodeURIComponent(v.id)}`;
  } },
    v ? el("span", { class: "wp-talk-video-thumb", style: `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")` },
      v.length ? el("span", { class: "wp-upnext-len" }, v.length) : null) : el("span", { class: "wp-talk-video-thumb wp-talk-video-search" }, icon("search")),
    el("span", { class: "wp-talk-video-text" },
      el("b", {}, VIDEO_KIND[s.kind] || "Another video"),
      el("span", {}, v ? v.title : `Search: ${s.search}`),
      s.why ? el("span", { class: "wp-muted" }, s.why) : null));
  const fill = () => row.replaceChildren(...m.videos.map((s, i) => (m.found?.[i] === undefined
    ? el("div", { class: "wp-talk-video wp-talk-video-loading" }, el("span", { class: "wp-muted" }, "Finding a video…")) : card(s, m.found[i]))));
  if (!m.found) {
    m.found = m.videos.map(() => undefined);
    m.videos.forEach((s, i) => topResult(s.search).then(v => { m.found[i] = v; fill(); }));
  }
  fill();
  return row;
}

// "[V2 6:40]" in what the librarian says: a link to that moment in that video (a seek, when it's the
// one playing). Only for videos it had captions for; anything else stays plain text.
function withMoments(text, videos) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(/\[V(\d{1,2}) (\d{1,2}):(\d{2})\]/g)) {
    const v = videos[Number(m[1]) - 1], sec = Number(m[2]) * 60 + Number(m[3]);
    out.push(text.slice(at, m.index));
    out.push(v?.id && v.transcript ? el("a", { class: "wp-talk-moment", href: `/watch?v=${encodeURIComponent(v.id)}&t=${sec}s`, title: v.title,
      onclick: e => { if (v.id === currentId) { e.preventDefault(); seekTo(sec); } } }, `${m[2]}:${m[3]}`) : `${m[2]}:${m[3]}`);
    at = m.index + m[0].length;
  }
  out.push(text.slice(at));
  return out.filter(x => x !== "");
}

// The panel, continuing a prepared conversation.
// The one student (docs/SPEC.md §7): the same one for an aim each time, so it feels like someone.
// An engraved medallion with an initial, never a face; and never presented as a real person.
const STUDENTS = [
  { key: "skeptic", name: "Reese", role: "The Skeptic" },
  { key: "curious", name: "Mara", role: "The Curious One" },
  { key: "beginner", name: "Theo", role: "The Beginner" }
];
function studentFor(id) {
  let h = 7;
  for (const c of String(id || "aim")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return STUDENTS[h % STUDENTS.length];
}
function medallion(st, size = 40) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("class", "wp-medal");
  svg.setAttribute("aria-hidden", "true");
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
  };
  add("circle", { cx: 20, cy: 20, r: 19, fill: "none", stroke: "currentColor", "stroke-width": "1.2" });
  add("circle", { cx: 20, cy: 20, r: 15.5, fill: "none", stroke: "currentColor", "stroke-width": ".6" });
  for (const deg of [0, 90, 180, 270]) {
    const r = deg * Math.PI / 180;
    add("circle", { cx: (20 + 17.25 * Math.cos(r)).toFixed(2), cy: (20 + 17.25 * Math.sin(r)).toFixed(2), r: ".9", fill: "currentColor" });
  }
  add("text", { x: 20, y: 25.5, "text-anchor": "middle", "font-size": "15", "font-family": "Georgia, 'Times New Roman', serif", fill: "currentColor" }, st.name[0]);
  return svg;
}
const TALK_QUESTIONS = { explore: 1, focus: 3, synthesis: 1, deeper: 3, review: 1 };
const RECALL = {
  yes: "Still there. Aim will check again in a few weeks.",
  partly: "Partly there. Aim will check again in about a week.",
  no: "Worth another look. Aim will ask again in a few days."
};

// What the conversation showed, kept apart (never a score): explained, still uncertain, possible
// misconceptions, and what to revisit, each gap with a search for a clear explanation of it.
function talkFeedback(state) {
  const f = state.feedback || {};
  const list = (label, items, cls) => items?.length ? el("div", { class: `wp-fb ${cls}` },
    el("div", { class: "wp-label" }, label), el("ul", {}, ...items.map(t => el("li", {}, t)))) : null;
  const gaps = (state.gaps || []).map(g => el("li", {}, el("span", {}, g.what || g.title), " ",
    el("button", { class: "wp-link", onclick: () => { closeTalk(); location.href = `/results?search_query=${encodeURIComponent(g.search)}`; } }, "Study this gap")));
  const parts = [
    state.recalled ? el("div", { class: "wp-talk-recalled" }, RECALL[state.recalled]) : null,
    list("Explained convincingly", f.explained, "wp-fb-ok"),
    list("Still uncertain", f.uncertain, ""),
    list("Possible misconceptions", f.misconceptions, "wp-fb-warn"),
    gaps.length ? el("div", { class: "wp-fb" }, el("div", { class: "wp-label" }, "To revisit"), el("ul", {}, ...gaps)) : null
  ].filter(Boolean);
  return parts.length ? el("div", { class: "wp-talk-feedback" }, ...parts) : null;
}

// Answer aloud: Chrome's own speech recognition (which Chrome runs on Google's servers; see
// PRIVACY.md), straight into the answer box. Null where Chrome doesn't offer it.
function answerAloud(input, onChange) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return null;
  const c = { on: false, rec: null };
  c.label = el("span", {}, "Answer aloud");
  c.btn = el("button", { class: "wp-btn wp-btn-primary wp-talk-voice", "aria-pressed": "false" }, icon("mic"), c.label);
  c.stop = () => {
    const r = c.rec; c.rec = null;
    if (!c.on) return;
    c.on = false; r?.stop();
    c.btn.setAttribute("aria-pressed", "false");
    onChange();
  };
  c.btn.onclick = () => {
    if (c.on) return c.stop();
    const rec = c.rec = new Rec();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    const before = input.value.trim() ? `${input.value.trim()} ` : "";
    rec.onresult = e => { input.value = before + [...e.results].map(x => x[0].transcript).join(""); onChange(); };
    rec.onerror = e => { c.stop(); if (e.error === "not-allowed") toast("Allow the microphone for YouTube to answer aloud."); };
    rec.onend = () => c.stop();
    try { rec.start(); } catch { c.rec = null; return; }
    c.on = true;
    c.btn.setAttribute("aria-pressed", "true");
    onChange();
  };
  return c;
}

// TeachBack, the simple way (docs/SPEC.md §7): one student, one question at a time, the question as
// the thing you look at. Answer aloud first, typing there too; "I don't know" is a fine answer.
function showTalk(state) {
  closeTalk();
  const st = state.student ||= studentFor(state.reviewKey || state.aimId);
  const max = TALK_QUESTIONS[state.mode] || 3;
  const log = el("div", { class: "wp-talk-log", "aria-live": "polite" });
  const progress = el("div", { class: "wp-talk-progress" });
  const input = el("textarea", { class: "wp-input wp-talk-input", rows: "3", maxlength: "1200", placeholder: "Explain it in your own words…", "aria-label": "Your answer" });
  const sendBtn = el("button", { class: "wp-btn wp-btn-primary" }, "Send");
  const voice = answerAloud(input, () => sync());
  const typeBtn = el("button", { class: "wp-btn wp-btn-text", onclick: () => { state.typing = true; sync(); input.focus(); } }, "Type instead");
  const dunno = el("button", { class: "wp-btn wp-btn-text", onclick: () => { voice?.stop(); input.value = "I don't know."; reply(); } }, "I don't know");
  const enough = el("button", { class: "wp-btn wp-btn-text wp-talk-enough", onclick: () => later() });
  const answer = el("div", { class: "wp-talk-answer" }, input,
    el("div", { class: "wp-talk-main" }, voice?.btn, sendBtn),
    el("div", { class: "wp-talk-links" }, dunno, typeBtn, enough));
  const foot = el("div", { class: "wp-talk-foot" });
  const panel = el("div", { class: "wp wp-talk", role: "dialog", "aria-label": `TeachBack with ${st.name}, ${st.role}` },
    el("div", { class: "wp-talk-head" },
      medallion(st),
      el("div", { class: "wp-talk-who" }, el("div", { class: "wp-talk-name" }, `${st.name} · ${st.role}`),
        el("div", { class: "wp-muted wp-ellipsis" }, state.mode === "review" ? `Remembering · ${state.review?.subject || ""}` : state.session.aim)),
      el("button", { class: "wp-icon-btn", "aria-label": "Close", title: "Close", onclick: () => later() }, svgIcon("close"))),
    progress, log, foot);
  talkPanel = { el: panel, state };

  const later = () => {
    voice?.stop();
    if (state.source === "explore" && !state.thread.some(m => m.role === "person")) send({ type: "talk-offered", aimId: state.aimId, answer: "later" });
    closeTalk();
  };
  // Which controls show: the voice button leads until there's something to send; the box appears
  // when typing, or as speech fills it.
  const sync = () => {
    const text = input.value.trim(), typing = !voice || state.typing || !!text || voice.on;
    input.hidden = !typing;
    sendBtn.hidden = !text && !!voice;
    input.disabled = sendBtn.disabled = dunno.disabled = !!state.busy;
    if (voice) {
      voice.btn.disabled = !!state.busy;
      voice.label.textContent = voice.on ? "Listening… tap to stop" : text ? "Add more aloud" : "Answer aloud";
      voice.btn.className = `wp-btn ${voice.on || !text ? "wp-btn-primary" : "wp-btn-tonal"} wp-talk-voice${voice.on ? " on" : ""}`;
    }
    typeBtn.hidden = typing || !voice;
    enough.textContent = state.thread.some(m => m.role === "person") ? "That's enough for now" : "Maybe later";
  };
  const bubble = m => [el("div", { class: `wp-talk-msg ${m.role === "person" ? "wp-talk-you" : "wp-talk-aim"}` },
    ...(m.role === "person" ? [m.text] : withMoments(m.text, state.session.videos))),
    m.videos?.length ? (m.row ||= suggestedVideos(state, m)) : null];
  const draw = (note = null) => {
    const asked = state.thread.filter(m => m.role === "aim").length;
    progress.textContent = state.done ? "" : max > 1 ? `Question ${Math.max(1, Math.min(asked, max))} of ${max}`
      : state.mode === "review" ? "One question · about a minute" : "One question";
    progress.hidden = !progress.textContent;
    const last = state.thread[state.thread.length - 1];
    const current = !state.busy && last?.role === "aim" ? last : null;
    const waiting = state.busy && last?.role === "person" ? last : null;
    const earlier = state.thread.slice(0, current || waiting ? -1 : undefined);
    const past = earlier.length ? el("details", { class: "wp-talk-earlier", ontoggle: e => { state.earlierOpen = e.target.open; } },
      el("summary", {}, `Earlier in this conversation (${earlier.length})`),
      el("div", { class: "wp-talk-earlier-list" }, ...earlier.flatMap(bubble).filter(Boolean))) : null;
    if (past && state.earlierOpen) past.open = true;
    log.replaceChildren(...[past,
      waiting ? bubble(waiting)[0] : null,
      state.busy ? el("div", { class: "wp-talk-msg wp-talk-aim wp-talk-typing", "aria-label": `${st.name} is thinking` }, el("i"), el("i"), el("i")) : null,
      current ? el("div", { class: `wp-talk-question${state.done ? " wp-talk-closing" : ""}` }, ...withMoments(current.text, state.session.videos)) : null,
      current?.videos?.length ? (current.row ||= suggestedVideos(state, current)) : null,
      note ? el("div", { class: "wp-muted wp-talk-note" }, note) : null,
      state.done ? (state.feedbackCard ||= talkFeedback(state)) : null].filter(Boolean));
    // Put it into practice: the librarian's one suggestion, if it made one, above the usual buttons.
    // Built once, so "Saved" stays put when the panel redraws.
    if (state.done && state.practice && !state.practiceCard) state.practiceCard = practiceCard(state.aimId, state.practice);
    if (state.practiceCard) log.append(state.practiceCard);
    log.scrollTop = state.done ? 0 : log.scrollHeight;
    if (state.done && state.verdict === "solid") {
      // The finish line: done here, or on to where people disagree.
      const live = activePurpose()?.id === state.aimId;
      foot.replaceChildren(el("div", { class: "wp-talk-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: () => { closeTalk(); debatesFor(state.session.aim); } }, "Explore the debates"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: () => { closeTalk(); if (live) finishPurpose("yes"); } }, live ? "Call it done" : "Close")));
    } else if (state.done) {
      const kept = state.kept?.length ? `Remembered: ${state.kept.join(", ")}` : null;
      foot.replaceChildren(...[kept ? el("span", { class: "wp-muted wp-talk-kept" }, kept) : null,
        el("button", { class: "wp-btn wp-btn-tonal", onclick: closeTalk }, "Close")].filter(Boolean));
    } else {
      if (!foot.contains(answer)) foot.replaceChildren(answer);
      sync();
    }
  };
  const reply = async () => {
    voice?.stop();
    const text = input.value.trim();
    if (!text || state.busy) return;
    if (state.source === "explore" && !state.thread.some(m => m.role === "person")) send({ type: "talk-offered", aimId: state.aimId, answer: "replied" });
    state.thread.push({ role: "person", text });
    input.value = "";
    state.busy = true; draw();
    const r = await talkCall(state);
    state.busy = false;
    if (!r || r.error) {
      state.thread.pop(); input.value = text;
      return draw(r?.error || `Couldn't reach ${st.name}. Try again.`);
    }
    state.thread.push({ role: "aim", text: r.message, ...(r.videos?.length ? { videos: r.videos } : {}) });
    // What they couldn't explain yet: kept with the aim, so the next video can address it.
    if (r.gaps?.length) {
      state.gaps = [...(state.gaps || []), ...r.gaps].slice(-4);
      if (state.aimId) send({ type: "aim-gaps", aimId: state.aimId, add: r.gaps });
    }
    if (r.done) {
      if (state.followUp?.id && state.aimId) send({ type: "aim-gaps", aimId: state.aimId, resolve: state.followUp.id });
      state.done = true;
      state.feedback = r.feedback || null;
      if (state.mode === "review" && r.recalled && state.reviewKey) { state.recalled = r.recalled; send({ type: "review-result", key: state.reviewKey, outcome: r.recalled }); }
      if (state.remember && r.memory?.length) { await send({ type: "memory-add", items: r.memory, aimId: state.aimId }); state.kept = r.memory.map(m => m.subject); }
      if (r.marks?.length) await send({ type: "talk-marks", aimId: state.aimId, marks: r.marks });
      if (r.verdict) { state.verdict = r.verdict; await send({ type: "talk-verdict", aimId: state.aimId, verdict: r.verdict }); }
      if (r.practice) state.practice = r.practice;
    }
    draw();
    if (!state.done && (state.typing || !voice)) input.focus();
  };
  sendBtn.onclick = reply;
  input.addEventListener("input", () => sync());
  input.addEventListener("keydown", e => {
    e.stopPropagation(); // keep YouTube's shortcuts out of the answer box
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); reply(); }
    if (e.key === "Escape") later();
  });
  for (const t of ["keyup", "keypress"]) input.addEventListener(t, e => e.stopPropagation());
  document.body.append(panel);
  // A slide, not a fade: a paused animation (a background tab) can never leave it half see-through.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    panel.animate([{ transform: "translateY(8px)" }, { transform: "none" }], { duration: 180, easing: "ease-out" });
  draw();
  if (!voice) input.focus();
}

// Past the finish line: a new aim about where people disagree, searched on YouTube.
async function debatesFor(aim) {
  const text = `Where people disagree: ${aim}`.slice(0, 300);
  const r = await send({ type: "purpose-start", text, search: `${aim} debate different views` });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't start that. Try again.");
  location.href = `/results?search_query=${encodeURIComponent(`${aim} debate different views`)}`;
}

async function openTalk(opts = {}) {
  closeDropdown?.();
  const wait = el("div", { class: "wp wp-talk wp-talk-wait", role: "status" }, el("span", { class: "wp-muted" }, opts.mode === "review" ? "Getting your question ready…" : "Reading your session…"));
  closeTalk();
  document.body.append(wait);
  talkPanel = { el: wait };
  const state = await prepareTalk(opts);
  wait.remove();
  if (talkPanel?.el === wait) talkPanel = null;
  if (state.error) return toast(state.error);
  showTalk(state);
}

// The friend's question as a block for a card (the card after Done, the Explore invitation): the
// question itself, Reply, and Maybe later. onEnd runs when the block is answered or put away.
function talkInvite(state, { onEnd = () => {}, lead = null } = {}) {
  const st = state.student ||= studentFor(state.aimId);
  const box = el("div", { class: "wp-talk-invite" },
    el("div", { class: "wp-talk-invite-who" }, medallion(st, 28), el("div", { class: "wp-label" }, lead || `${st.name} · ${st.role}`)),
    el("div", { class: "wp-talk-q" }, ...withMoments(state.thread[0].text, state.session.videos)),
    el("div", { class: "wp-row" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { onEnd(); showTalk(state); } }, "Reply"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => {
        if (state.source === "explore") send({ type: "talk-offered", aimId: state.aimId, answer: "later" });
        box.remove(); onEnd();
      } }, "Maybe later")));
  return box;
}

// Exploring, back on the homepage after a real stretch of it: one invitation, now and then (see
// talkOffer in store.js for the pacing). Aim Plus.
async function maybeOfferTalk(card) {
  const p = activePurpose();
  if (!p?.learn || homeEnd || $(".wp-talk-invite", card)) return;
  if (!(await send({ type: "plus-brief" }))?.plus) return;
  if (!(await send({ type: "talk-offer", aimId: p.id }))?.offer) return;
  const state = await prepareTalk({ aimId: p.id, source: "explore" });
  if (state.error || !card.isConnected || exploreOpen) return;
  send({ type: "talk-offered", aimId: p.id, answer: "shown" });
  const block = el("div", { class: "wp-home-end wp-talk-offer" }, talkInvite(state, { lead: `${state.student.name} · ${state.student.role} · ${p.text}`, onEnd: () => block.remove() }));
  card.querySelector(".wp-dialog-brand")?.after(block);
}

// Spaced review (docs/SPEC.md §10): about a week after you explained something, once, on the
// homepage: "Last week you explained X. Still remember?" One question, a minute; easy to put off.
// Any signed-in account; see reviewDue in store.js for the pacing.
async function maybeOfferReview(card) {
  if (homeEnd || exploreOpen || $(".wp-review-offer", card) || !account.on) return;
  const item = await send({ type: "review-due" });
  if (!item?.key || !card.isConnected || $(".wp-review-offer", card)) return;
  send({ type: "review-offered" });
  const when = item.daysAgo <= 10 ? "Last week" : item.daysAgo <= 35 ? "A few weeks ago" : "A while back";
  const st = studentFor(item.key);
  const done = outcome => { if (outcome) send({ type: "review-result", key: item.key, outcome }); block.remove(); };
  const block = el("div", { class: "wp-home-end wp-review-offer" },
    el("div", { class: "wp-talk-invite-who" }, medallion(st, 28), el("div", { class: "wp-label" }, "Still remember?")),
    el("div", { class: "wp-talk-q" }, `${when} you explained ${item.subject}. Could you still explain it?`),
    el("div", { class: "wp-row" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { block.remove(); openTalk({ mode: "review", review: item, source: "review" }); } }, "Try it · 1 minute"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => done("later") }, "Not now"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => done("never") }, "Don't ask about this")));
  card.querySelector(".wp-dialog-brand")?.after(block);
}

// While watching, with Aim Plus: a quiet line when this video connects to something you explained
// before ("This connects to Roman concrete"). At most once a day; see memoryMatch in store.js.
// Asked once per video; the answer is kept, so the line comes back when YouTube redraws the sidebar.
let connectChecked = null, connectFound = null;
async function connectionLine(host) {
  const p = activePurpose();
  if (!p || !currentId || settings.librarianMemory === false) return;
  if (connectChecked === currentId) return connectFound?.id === currentId && showConnection(host, connectFound.m);
  connectChecked = currentId;
  const id = currentId;
  const title = p.allowed?.find(v => v.id === currentId)?.title || (currentInfo?.id === currentId ? currentInfo.title : "");
  if (!title || !(await send({ type: "plus-brief" }))?.plus) return;
  const m = await send({ type: "memory-match", title });
  if (!m || currentId !== id) return;
  send({ type: "memory-offered", id: m.id });
  connectFound = { id, m };
  showConnection($("#wp-upnext") || host, m);
}
function showConnection(host, m) {
  if (!host?.isConnected || host.querySelector(".wp-connect")) return;
  host.querySelector(".wp-upnext-head")?.after(el("div", { class: "wp-deeper wp-connect" },
    el("span", { class: "wp-muted" }, `This connects to something you were into: ${m.subject}.`),
    el("button", { class: "wp-link", onclick: () => openTalk({ connect: m }) }, "Talk about it")));
}
