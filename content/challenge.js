// Aim — challenges on YouTube's homepage (0.70, docs/SPEC.md §7–§9). Beside "What brings you
// here?": say what you're curious about, pick the time you have, and Aim offers three session
// challenges, each with what makes it interesting and how you'll know you've done it. Pick one to see
// its success condition and plan, then begin: it becomes your aim, its plan steps become what Up next
// works through, and its last step is the Final Challenge. Signed-in accounts (the server writes
// challenges); a specific need still goes straight to search.

const CH_KIND = { understand: "Understand", build: "Build & do", investigate: "Investigate" };
const CH_LEVEL = { intro: "Intro", intermediate: "Intermediate", advanced: "Advanced" };
// What's on screen, kept across the homepage card's redraws.
let chFind = { minutes: 30, view: "closed", interest: "", list: [], picked: null, busy: false, error: "", offered: [] };

async function findChallenges(interest, { custom = "" } = {}) {
  interest = String(interest || "").trim();
  if (!interest && !custom) { chFind = { ...chFind, view: "ask", error: "Type a subject first, like aviation, Polish or woodworking." }; return renderHome(); }
  chFind = { ...chFind, busy: true, error: "", interest: interest || chFind.interest, view: chFind.view === "closed" ? "list" : chFind.view };
  renderHome();
  const known = (await send({ type: "challenge-known", interest: interest || custom })) || [];
  const r = await send({ type: "librarian", task: "challenges-suggest", input: { interest, custom, minutes: chFind.minutes, known, avoid: custom ? [] : chFind.offered } });
  chFind.busy = false;
  if (!r || r.error) { chFind.error = r?.error || "Couldn't find challenges just now. Try again."; return renderHome(); }
  const list = (r.challenges || []).map(c => ({ ...c, interest: interest || chFind.interest }));
  chFind = { ...chFind, list, view: custom ? "detail" : "list", picked: custom ? list[0] : null, offered: [...chFind.offered, ...list.map(c => c.title)].slice(-9) };
  renderHome();
}

async function beginChallenge(c) {
  chFind.busy = true; renderHome();
  const r = await send({ type: "challenge-start", challenge: c });
  chFind.busy = false;
  if (!r || r.result !== "applied") { chFind.error = r?.message || "Couldn't start that. Try again."; return renderHome(); }
  chFind = { minutes: chFind.minutes, view: "closed", interest: "", list: [], picked: null, busy: false, error: "", offered: [] };
  location.href = r.url;
}

const chMeta = c => [CH_KIND[c.kind] || "Understand", `${c.minutes} min`, CH_LEVEL[c.difficulty] || "Intro"].join(" · ");

// The block in the homepage card. input: the card's own box, read for the subject.
function challengeBlock(input) {
  if (status.totalReached || exploreOpen) return null;
  const times = el("div", { class: "wp-ch-times", role: "group", "aria-label": "Time you have" },
    ...[15, 30, 60].map(m => el("button", { class: `wp-chip${chFind.minutes === m ? " wp-chip-on" : ""}`, "aria-pressed": String(chFind.minutes === m),
      onclick: () => { chFind.minutes = m; chFind.interest = input.value.trim() || chFind.interest; renderHome(); } }, `${m} min`)));
  const find = () => (account.on ? findChallenges(input.value || chFind.interest) : send({ type: "open-options", section: "account" }));
  const head = el("div", { class: "wp-ch-head" },
    el("span", { class: "wp-ch-q" }, "Curious, with some time?"),
    times,
    el("button", { class: "wp-btn wp-btn-tonal", disabled: chFind.busy, onclick: find }, icon("target"), chFind.busy ? "Finding…" : account.on ? "Find a challenge" : "Sign in for challenges"));
  const box = el("div", { class: "wp-ch" }, head);
  if (chFind.error) box.append(el("div", { class: "wp-error wp-ch-error" }, chFind.error));
  if (chFind.view === "list" && chFind.list.length) {
    box.append(
      el("div", { class: "wp-ch-label" }, `Challenges for ${chFind.interest}`),
      el("div", { class: "wp-ch-list" }, ...chFind.list.map(c => el("button", { class: "wp-ch-card", onclick: () => { chFind.picked = c; chFind.view = "detail"; renderHome(); } },
        el("span", { class: "wp-ch-meta" }, chMeta(c)),
        el("b", { class: "wp-ch-title" }, c.title),
        c.why ? el("span", { class: "wp-ch-why" }, c.why) : null,
        c.materials?.length ? el("span", { class: "wp-ch-mat" }, `Needs: ${c.materials.filter(m => m.required).map(m => m.item).join(", ") || c.materials[0].item}`) : null))),
      el("div", { class: "wp-row wp-ch-more" },
        el("button", { class: "wp-link", disabled: chFind.busy, onclick: () => findChallenges(chFind.interest) }, "Different ones"),
        el("button", { class: "wp-link", onclick: () => {
          const own = input.value.trim();
          if (own && own.toLowerCase() !== chFind.interest.toLowerCase()) return findChallenges(chFind.interest, { custom: own });
          input.value = ""; input.placeholder = "Write your own challenge, then press Write my own again"; input.focus();
        } }, "Write my own"),
        el("button", { class: "wp-link", onclick: () => { chFind.view = "closed"; chFind.list = []; renderHome(); } }, "Close")));
  }
  if (chFind.view === "detail" && chFind.picked) {
    const c = chFind.picked;
    box.append(el("div", { class: "wp-ch-detail" },
      el("span", { class: "wp-ch-meta" }, chMeta(c)),
      el("b", { class: "wp-ch-title wp-ch-big" }, c.title),
      c.why ? el("span", { class: "wp-ch-why" }, c.why) : null,
      el("div", { class: "wp-ch-success" }, el("span", { class: "wp-ch-label" }, "You'll have done it when"), el("span", {}, c.success)),
      el("ol", { class: "wp-ch-plan" }, ...c.plan.map(s => el("li", {}, el("b", {}, s.title), el("span", { class: "wp-muted" }, ` · ~${s.minutes} min`),
        s.look ? el("div", { class: "wp-muted" }, s.look) : null))),
      c.materials?.length ? el("div", { class: "wp-ch-mats" }, el("span", { class: "wp-ch-label" }, "You'll need"),
        el("ul", {}, ...c.materials.map(m => el("li", {}, m.item, m.required ? null : el("span", { class: "wp-muted" }, " (optional)"))))) : null,
      c.safety ? el("div", { class: "wp-ch-safety" }, c.safety) : null,
      el("div", { class: "wp-row wp-ch-actions" },
        el("button", { class: "wp-btn wp-btn-primary", disabled: chFind.busy, onclick: () => beginChallenge(c) }, "Begin challenge"),
        el("button", { class: "wp-btn wp-btn-text", onclick: () => { chFind.view = chFind.list.length > 1 ? "list" : "closed"; renderHome(); } }, chFind.list.length > 1 ? "Back to the list" : "Not this one")),
      el("div", { class: "wp-muted wp-ch-note" }, "The time is a target, not a timer. Skip what you know, swap a video, or stop and pick it up later.")));
  }
  return box;
}

// The Final Challenge's outcome, recorded with its evidence, and what comes next.
const CH_OUTCOME = { solid: "demonstrated", getting_there: "partly", not_enough: "not_enough" };
function recordChallenge(state, verdict) {
  const p = activePurpose();
  if (!state.aimId || !(p?.id === state.aimId ? p.challenge : state.session?.challenge)) return null;
  const answer = [...state.thread].reverse().find(m => m.role === "person")?.text || "";
  send({ type: "challenge-result", aimId: state.aimId, outcome: CH_OUTCOME[verdict] || "not_enough", answer, shown: state.feedback?.explained || [] });
  return CH_OUTCOME[verdict] || "not_enough";
}
