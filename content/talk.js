// Aim — talking a session through with the librarian: a small panel at the bottom right of YouTube.
// It always arrives with a specific question about what you've been watching, never an empty box;
// it listens, sometimes adds something, and knows when to stop (supabase/functions/ai/talk.ts).
// Opened from the card after Done, the Explore invitation on the homepage, "This connects to…" while
// watching, and Aim's menu (Talk it through). Signed-in accounts; free ones get one conversation a day.
// With Aim Plus, what you explained is remembered in this browser (Settings lists it).

let talkPanel = null;

function closeTalk() { talkPanel?.el.remove(); talkPanel = null; }

const talkCall = (state, extra = {}) => send({ type: "librarian", task: "librarian-talk",
  input: { mode: state.mode, session: state.session, thread: state.thread, memory: state.memory, connect: state.connect, ...extra } });

// Everything a conversation needs, with its opening question already asked. Null when there's
// nothing to talk about, no account, or the AI couldn't open (the error is in .error).
async function prepareTalk({ aimId = null, connect = null, source = "menu" } = {}) {
  const brief = await send({ type: "plus-brief" });
  if (!brief?.account) return { error: "Sign in to talk things through with the librarian." };
  const ctx = await send({ type: "talk-session", id: aimId });
  if (!ctx || ctx.result !== "applied") return { error: ctx?.message || "Nothing to talk about yet." };
  if (!ctx.session.videos.length && !ctx.session.searches.length) return { error: "Watch something first, then let's talk it through." };
  const plus = brief.plus === true, remember = plus && settings.librarianMemory !== false;
  const state = { aimId: ctx.id, mode: ctx.mode, session: ctx.session, thread: [], connect, plus, remember, source, done: false, busy: false,
    memory: remember ? (await send({ type: "memory-for", id: ctx.id })) || [] : [] };
  const r = await talkCall(state, { opening: true });
  if (!r || r.error) return { error: r?.error || "The librarian couldn't start just now. Try again in a minute." };
  state.thread.push({ role: "aim", text: r.message });
  return state;
}

// The panel, continuing a prepared conversation.
function showTalk(state) {
  closeTalk();
  const log = el("div", { class: "wp-talk-log", "aria-live": "polite" });
  const input = el("textarea", { class: "wp-input wp-talk-input", rows: "2", maxlength: "1200", placeholder: "Say what you think…", "aria-label": "Your reply" });
  const sendBtn = el("button", { class: "wp-btn wp-btn-primary" }, "Send");
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
    log.replaceChildren(...state.thread.map(m => el("div", { class: `wp-talk-msg ${m.role === "person" ? "wp-talk-you" : "wp-talk-aim"}` }, m.text)),
      ...(state.busy ? [el("div", { class: "wp-talk-msg wp-talk-aim wp-talk-typing", "aria-label": "The librarian is thinking" }, el("i"), el("i"), el("i"))] : []),
      ...(note ? [el("div", { class: "wp-muted wp-talk-note" }, note)] : []));
    log.scrollTop = log.scrollHeight;
    if (state.done) {
      const kept = state.kept?.length ? `Remembered: ${state.kept.join(", ")}` : null;
      foot.replaceChildren(...[kept ? el("span", { class: "wp-muted wp-talk-kept" }, kept) : null,
        el("button", { class: "wp-btn wp-btn-tonal", onclick: closeTalk }, "Close")].filter(Boolean));
    } else {
      input.disabled = sendBtn.disabled = state.busy;
      foot.replaceChildren(input, el("div", { class: "wp-talk-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: later }, state.thread.some(m => m.role === "person") ? "That's enough for now" : "Maybe later"), sendBtn));
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
    state.thread.push({ role: "aim", text: r.message });
    if (r.done) {
      state.done = true;
      if (state.remember && r.memory?.length) { await send({ type: "memory-add", items: r.memory, aimId: state.aimId }); state.kept = r.memory.map(m => m.subject); }
      if (r.marks?.length) await send({ type: "talk-marks", aimId: state.aimId, marks: r.marks });
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
  // Scripted, so it plays once: a CSS animation would replay whenever YouTube restyles the page.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    panel.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "ease-out" });
  draw();
  input.focus();
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
    el("div", { class: "wp-talk-q" }, state.thread[0].text),
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
let connectChecked = null;
async function connectionLine(host) {
  const p = activePurpose();
  if (!p || !currentId || connectChecked === currentId || settings.librarianMemory === false) return;
  connectChecked = currentId;
  const title = p.allowed?.find(v => v.id === currentId)?.title || (currentInfo?.id === currentId ? currentInfo.title : "");
  if (!title || !(await send({ type: "plus-brief" }))?.plus) return;
  const m = await send({ type: "memory-match", title });
  if (!m || !host.isConnected) return;
  send({ type: "memory-offered", id: m.id });
  host.querySelector(".wp-upnext-head")?.after(el("div", { class: "wp-deeper wp-connect" },
    el("span", { class: "wp-muted" }, `This connects to something you were into: ${m.subject}.`),
    el("button", { class: "wp-link", onclick: () => openTalk({ connect: m }) }, "Talk about it")));
}
