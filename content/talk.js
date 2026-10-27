// Aim — talking a session through with the librarian: a small panel at the bottom right of YouTube.
// It always arrives with a specific question about what you've been watching, never an empty box;
// it listens, sometimes adds something, and knows when to stop (supabase/functions/ai/talk.ts).
// Opened from the card after Done, the Explore invitation on the homepage, "This connects to…" while
// watching, and Aim's menu (Talk it through). Signed-in accounts; free ones get one conversation a day.
// With Aim Plus, what you explained is remembered in this browser (Settings lists it).

let talkPanel = null;

function closeTalk() { talkPanel?.el.remove(); talkPanel = null; }

const talkCall = (state, extra = {}) => send({ type: "librarian", task: "librarian-talk",
  input: { mode: state.mode, session: state.session, thread: state.thread.map(({ role, text }) => ({ role, text })), memory: state.memory, connect: state.connect, focus: state.focus, ...extra } });

// Everything a conversation needs, with its opening question already asked. Null when there's
// nothing to talk about, no account, or the AI couldn't open (the error is in .error).
// mode "deeper" (Aim Plus) goes one "why" further into focus: { title, brief, chain }, from an aim's page.
async function prepareTalk({ aimId = null, connect = null, source = "menu", mode = null, focus = null } = {}) {
  const brief = await send({ type: "plus-brief" });
  if (!brief?.account) return { error: "Sign in to talk things through with the librarian." };
  const ctx = await send({ type: "talk-session", id: aimId });
  if (!ctx || ctx.result !== "applied") return { error: ctx?.message || "Nothing to talk about yet." };
  const mapped = ctx.session.map?.parts?.some(x => x.status !== "new");
  if (!ctx.session.videos.length && !ctx.session.searches.length && !mapped && mode !== "deeper") return { error: "Watch something first, then let's talk it through." };
  const plus = brief.plus === true, remember = plus && settings.librarianMemory !== false;
  // A learning aim that's nearly there finishes by putting it together; asked for, or offered after Done.
  const synthesis = mode === "synthesis" || (source === "done" && ctx.ready);
  const state = { aimId: ctx.id, mode: mode === "deeper" && focus?.title ? "deeper" : synthesis ? "synthesis" : ctx.mode, focus: mode === "deeper" ? focus : null,
    session: ctx.session, thread: [], connect, plus, remember, source, done: false, busy: false,
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
function showTalk(state) {
  closeTalk();
  const log = el("div", { class: "wp-talk-log", "aria-live": "polite" });
  const input = el("textarea", { class: "wp-input wp-talk-input", rows: "2", maxlength: "1200", placeholder: "Say what you think…", "aria-label": "Your reply" });
  const sendBtn = el("button", { class: "wp-btn wp-btn-primary" }, "Send");
  const mic = micButton(input);
  const foot = el("div", { class: "wp-talk-foot" });
  const panel = el("div", { class: "wp wp-talk", role: "dialog", "aria-label": "Talk it through with the librarian" },
    el("div", { class: "wp-talk-head" },
      el("span", { class: "wp-talk-mark" }, icon("ask")),
      el("div", { class: "wp-talk-who" }, el("div", { class: "wp-strong" }, "The librarian"),
        el("div", { class: "wp-muted wp-ellipsis" }, state.session.aim)),
      el("button", { class: "wp-icon-btn", "aria-label": "Close", title: "Close", onclick: () => later() }, svgIcon("close"))),
    log, foot);
  talkPanel = { el: panel, state };

  const later = () => {
    if (state.source === "explore" && !state.thread.some(m => m.role === "person")) send({ type: "talk-offered", aimId: state.aimId, answer: "later" });
    closeTalk();
  };
  const draw = (note = null) => {
    log.replaceChildren(...state.thread.flatMap(m => [el("div", { class: `wp-talk-msg ${m.role === "person" ? "wp-talk-you" : "wp-talk-aim"}` },
      ...(m.role === "person" ? [m.text] : withMoments(m.text, state.session.videos))),
      m.videos?.length ? (m.row ||= suggestedVideos(state, m)) : null].filter(Boolean)),
      ...(state.busy ? [el("div", { class: "wp-talk-msg wp-talk-aim wp-talk-typing", "aria-label": "The librarian is thinking" }, el("i"), el("i"), el("i"))] : []),
      ...(note ? [el("div", { class: "wp-muted wp-talk-note" }, note)] : []));
    log.scrollTop = log.scrollHeight;
    // Put it into practice: the librarian's one suggestion, if it made one, above the usual buttons.
    // Built once, so "Saved" stays put when the panel redraws.
    if (state.done && state.practice && !state.practiceCard) state.practiceCard = practiceCard(state.aimId, state.practice);
    if (state.practiceCard) log.append(state.practiceCard);
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
      input.disabled = sendBtn.disabled = state.busy;
      foot.replaceChildren(input, el("div", { class: "wp-talk-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: later }, state.thread.some(m => m.role === "person") ? "That's enough for now" : "Maybe later"),
        el("div", { class: "wp-row" }, mic, sendBtn)));
    }
  };
  const reply = async () => {
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
      return draw(r?.error || "Couldn't reach the librarian. Try again.");
    }
    state.thread.push({ role: "aim", text: r.message, ...(r.videos?.length ? { videos: r.videos } : {}) });
    if (r.done) {
      state.done = true;
      if (state.remember && r.memory?.length) { await send({ type: "memory-add", items: r.memory, aimId: state.aimId }); state.kept = r.memory.map(m => m.subject); }
      if (r.marks?.length) await send({ type: "talk-marks", aimId: state.aimId, marks: r.marks });
      if (r.verdict) { state.verdict = r.verdict; await send({ type: "talk-verdict", aimId: state.aimId, verdict: r.verdict }); }
      if (r.practice) state.practice = r.practice;
    }
    draw();
    if (!state.done) input.focus();
  };
  sendBtn.onclick = reply;
  input.addEventListener("keydown", e => {
    e.stopPropagation(); // keep YouTube's shortcuts out of the reply box
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); reply(); }
    if (e.key === "Escape") later();
  });
  for (const t of ["keyup", "keypress"]) input.addEventListener(t, e => e.stopPropagation());
  document.body.append(panel);
  // A slide, not a fade: a paused animation (a background tab) can never leave it half see-through.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    panel.animate([{ transform: "translateY(8px)" }, { transform: "none" }], { duration: 180, easing: "ease-out" });
  draw();
  input.focus();
}

// Past the finish line: a new aim about where people disagree, searched on YouTube.
async function debatesFor(aim) {
  const text = `Where people disagree: ${aim}`.slice(0, 300);
  const r = await send({ type: "purpose-start", text, search: `${aim} debate different views` });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't start that. Try again.");
  location.href = `/results?search_query=${encodeURIComponent(`${aim} debate different views`)}`;
}

// Say it instead of typing: Chrome's own speech recognition (which Chrome runs on Google's servers;
// see PRIVACY.md), straight into the reply box. Only where Chrome offers it; nothing else is recorded.
function micButton(input) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return null;
  let rec = null;
  const btn = el("button", { class: "wp-icon-btn wp-talk-mic", "aria-label": "Speak your reply", title: "Speak your reply", "aria-pressed": "false" }, icon("mic"));
  const stop = () => { rec?.stop(); rec = null; btn.classList.remove("on"); btn.setAttribute("aria-pressed", "false"); };
  btn.onclick = () => {
    if (rec) return stop();
    rec = new Rec();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    const before = input.value ? `${input.value.trim()} ` : "";
    rec.onresult = e => { input.value = before + [...e.results].map(r => r[0].transcript).join(""); };
    rec.onerror = e => { stop(); if (e.error === "not-allowed") toast("Allow the microphone for YouTube to speak your reply."); };
    rec.onend = stop;
    rec.start();
    btn.classList.add("on"); btn.setAttribute("aria-pressed", "true");
  };
  return btn;
}

// From Aim's menu or a link: prepare, then show (with a small panel saying it's thinking meanwhile).
async function openTalk(opts = {}) {
  closeDropdown?.();
  const wait = el("div", { class: "wp wp-talk wp-talk-wait", role: "status" }, el("span", { class: "wp-muted" }, "The librarian is reading your session…"));
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
  const box = el("div", { class: "wp-talk-invite" },
    lead ? el("div", { class: "wp-label" }, lead) : null,
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
  const block = el("div", { class: "wp-home-end wp-talk-offer" }, talkInvite(state, { lead: `The librarian · ${p.text}`, onEnd: () => block.remove() }));
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
