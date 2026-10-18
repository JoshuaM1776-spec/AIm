// Aim — Pathways pieces shared by Aim's own pages (TeachBack, study sessions, Pathways):
// "Want more of this?" and "Where could this take me?". The YouTube versions are in
// content/pathways.js. Each page loads this before its own script.

const PW = (() => {
  const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
  function make(tag, props = {}, ...kids) {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  }
  // Styles for these pieces are in aim.css.

  // "Want more of this?" Yes / Maybe / Not really.
  function interest({ topic, subject = "", source }) {
    const row = make("div", { className: "pw-interest", role: "group", ariaLabel: "Want more of this?" });
    const draw = answer => row.replaceChildren(make("span", { textContent: "Want more of this?" }),
      ...[["yes", "Yes"], ["maybe", "Maybe"], ["no", "Not really"]].map(([v, label]) => make("button", { type: "button", textContent: label,
        ariaPressed: String(answer === v), onclick: async () => { const r = await send({ type: "interest", topic, subject, source, answer: v }); if (r?.result === "applied") draw(v); } })));
    draw(null);
    return row;
  }

  // "Where could this take me?": a link that unfolds into the answer right there. Needs a signed-in
  // account (it asks the AI), but uses nothing about the student.
  function where(topic, context = "", stage = "other") {
    const box = make("div");
    const btn = make("button", { type: "button", className: "pw-where-btn", textContent: "Where could this take me?" });
    btn.onclick = async () => {
      btn.disabled = true;
      box.replaceChildren(make("div", { className: "pw-where" }, make("p", { className: "pw-intro", textContent: "Looking…" })));
      const r = await send({ type: "librarian", task: "pathways-where", input: { topic, context, stage } });
      btn.disabled = false;
      if (!r || r.error) { box.replaceChildren(make("div", { className: "pw-where" }, make("p", { textContent: r?.error || "Couldn't answer that right now. Try again." }))); return; }
      const reveal = (label, text) => {
        const panel = make("div", { className: "pw-reveal", textContent: text, hidden: true });
        const b = make("button", { type: "button", textContent: label, onclick: () => { panel.hidden = !panel.hidden; } });
        return [b, panel];
      };
      box.replaceChildren(make("div", { className: "pw-where" },
        make("h3", { textContent: `Where could ${topic} take me?` }),
        r.intro ? make("p", { className: "pw-intro", textContent: r.intro }) : null,
        r.uses.map(u => {
          const [hb, hp] = reveal("Hint", u.hint), [ab, ap] = reveal("Answer", u.answer);
          return make("div", { className: "pw-use" }, make("b", { className: "pw-field", textContent: u.field }), make("div", { className: "pw-how", textContent: u.how }),
            make("div", { className: "pw-problem" }, make("b", { textContent: "Try it: " }), u.problem),
            make("div", { className: "pw-links" }, u.hint ? hb : null, ab), u.hint ? hp : null, ap);
        }),
        make("button", { type: "button", className: "pw-where-btn", textContent: "See work connected to this →", onclick: () => send({ type: "open-pathways", theme: topic }) })));
    };
    return make("div", {}, btn, box);
  }

  return { interest, where, send, make };
})();
