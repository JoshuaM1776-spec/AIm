// Aim — Pathways on YouTube: "Want more of this?", "Where could this take me?", and the occasional
// offer of a theme ("You've been exploring aviation. Want to see some of the work connected to it?").
// The Pathways page itself is pathways.html. See docs/HOMESCHOOL.md → "Pathways".

const pathwayStage = () => status.pathways?.stage || (status.homeschool ? "middle" : "other");

// "Want more of this?" Yes / Maybe / Not really. The student's own answer, kept in this browser.
function interestChips({ topic, subject, source, ref, current }) {
  const row = el("div", { class: "wp-interest", role: "group", "aria-label": "Want more of this?" });
  const draw = answer => row.replaceChildren(
    el("span", { class: "wp-interest-q" }, "Want more of this?"),
    ...[["yes", "Yes"], ["maybe", "Maybe"], ["no", "Not really"]].map(([v, label]) =>
      el("button", { class: `wp-interest-btn${answer === v ? " on" : ""}`, "aria-pressed": answer === v ? "true" : "false",
        onclick: async e => {
          e.stopPropagation();
          const r = await send({ type: "interest", topic, subject, source, answer: v, ref });
          if (r?.result === "applied") draw(v);
        } }, label)));
  draw(current || null);
  return row;
}

// A small link that opens "Where could this take me?" for a subject or topic. Signed-in accounts
// only (it asks the AI), but it uses nothing about the student, so Pathways needn't be on.
function whereLink(topic, context = "") {
  if (!account.on || !topic) return null;
  return el("button", { class: "wp-link wp-where-link", onclick: e => { e.stopPropagation(); openWhere(topic, context); } },
    icon("pin"), "Where could this take me?");
}

async function openWhere(topic, context = "") {
  const body = el("div", { class: "wp-where-body" }, el("div", { class: "wp-muted" }, `${BRAND} is looking…`));
  openModal(el("div", { class: "wp wp-dialog wp-where", role: "dialog", "aria-modal": "true", "aria-label": "Where could this take me?" },
    brandLine(),
    el("div", { class: "wp-title" }, "Where could this take me?"),
    el("div", { class: "wp-where-topic" }, topic),
    body));
  const r = await send({ type: "librarian", task: "pathways-where", input: { topic, context, stage: pathwayStage() } });
  if (!body.isConnected) return;
  if (!r || r.error) { body.replaceChildren(el("div", { class: "wp-muted" }, r?.error || "Couldn't answer that right now. Try again.")); return; }
  body.replaceChildren(...[
    r.intro ? el("p", { class: "wp-where-intro" }, r.intro) : null,
    ...r.uses.map(u => {
      const reveal = (label, text) => {
        const box = el("div", { class: "wp-where-reveal", hidden: true }, text);
        const btn = el("button", { class: "wp-link", onclick: () => { box.hidden = !box.hidden; btn.textContent = box.hidden ? label : `Hide ${label.toLowerCase()}`; } }, label);
        return [btn, box];
      };
      const [hb, hbox] = reveal("Hint", u.hint), [ab, abox] = reveal("Answer", u.answer);
      return el("div", { class: "wp-where-use" },
        el("div", { class: "wp-where-field" }, u.field),
        el("div", { class: "wp-muted wp-where-how" }, u.how),
        el("div", { class: "wp-where-problem" }, el("b", {}, "Try it: "), u.problem),
        el("div", { class: "wp-where-actions" }, u.hint ? hb : null, ab), u.hint ? hbox : null, abox);
    }),
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Close"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeModal(); send({ type: "open-pathways", theme: topic }); } },
        status.pathways ? "See work like this" : "About Pathways"))].filter(Boolean));
}

// The one theme to offer, if any: on the homepage card and on Today. Never during a video.
function themeOfferBlock() {
  const t = status.pathways?.offer;
  if (!t) return null;
  const seen = dismiss => send({ type: "pathways-theme-seen", name: t.name, dismiss });
  return el("div", { class: "wp-theme-offer", role: "note" },
    el("span", { class: "wp-theme-offer-icon" }, icon("pin")),
    el("div", { class: "wp-theme-offer-text" }, t.offer),
    el("div", { class: "wp-theme-offer-actions" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: async () => { await seen(false); send({ type: "open-pathways", theme: t.name }); } },
        status.pathways.stage === "middle" ? "See the work" : "See careers"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => seen(false) }, "Not now"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => seen(true) }, "Don't suggest this")));
}
