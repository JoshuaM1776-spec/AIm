// Aim — Going deeper (Aim Plus): a ladder of "why", one level at a time, under a part of an aim's
// map or a scenario's debrief. Each level: what's happening there, why, and what counteracts it,
// from your references where they cover it (cited) or marked as general background. Stops at the
// useful floor for your level, and goes past it if you ask. The chain is kept with the aim.
// Used by aim.js and scenario.js; the server side is supabase/functions/ai/deeper.ts. Styles: aim.css.

// opts: { aimId, topic, domain, level, root, brief, partId, chain (a saved chain, if any), talk (a
// function that opens the conversation instead, or null) }
function deeperLadder(opts) {
  const mk = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.flat().filter(k => k != null && k !== false)); return n; };
  const chain = { id: opts.chain?.id || null, levels: [...(opts.chain?.levels || [])] };
  let last = chain.levels.length ? { next: "", floor: !!chain.levels.at(-1).floor } : null;
  const box = mk("div", { className: "ladder" });
  const status = mk("p", { className: "muted ladder-status", role: "status" });

  const levelCard = (l, i) => mk("div", { className: "rung" },
    mk("span", { className: "rung-n", textContent: String(i + 1) }),
    mk("div", {},
      mk("p", { className: "rung-what", textContent: l.what }),
      l.why ? mk("p", {}, mk("b", { textContent: "Why: " }), l.why) : null,
      l.counter ? mk("p", {}, mk("b", { textContent: "What counteracts it: " }), l.counter) : null,
      mk("span", { className: `pill${l.background ? "" : " ok"}`, textContent: l.background ? "General background" : "From your references" }),
      l.floor && l.floorNote ? mk("p", { className: "muted", textContent: l.floorNote }) : null));

  async function step(beyond = false) {
    status.textContent = "Going one level deeper…";
    for (const b of box.querySelectorAll("button")) b.disabled = true;
    const refs = (opts.domain === "medical" || opts.domain === "aviation") ? (await chrome.runtime.sendMessage({ type: "ref-list" }).catch(() => [])) || [] : [];
    const about = `${opts.topic} ${opts.root} ${chain.levels.at(-1)?.why || ""}`;
    const ex = refs.length ? await chrome.runtime.sendMessage({ type: "ref-excerpts", ids: refs.map(r => r.id), about, maxChars: 5000 }).catch(() => null) : null;
    let r;
    try {
      r = await chrome.runtime.sendMessage({ type: "plus-call", task: "deeper-step", input: { topic: opts.topic, domain: opts.domain || "general", level: opts.level || "",
        root: opts.brief ? `${opts.root.replace(/[.:;]\s*$/, "")}: ${opts.brief}` : opts.root, chain: chain.levels.map(({ what, why, counter }) => ({ what, why, counter })),
        passages: (ex?.passages || []).map(p => ({ cite: p.cite, heading: p.heading, text: p.text })), beyondFloor: beyond } });
    } catch { r = { error: "Aim was updated or reloaded. Reload this page." }; }
    if (!r || r.error) {
      status.textContent = r?.code === "plan" || r?.code === "auth" ? "Going deeper is part of Aim Plus." : r?.error || "That didn't come through. Try again.";
      return draw();
    }
    chain.levels.push({ what: r.what, why: r.why, counter: r.counter, background: r.background, floor: r.floor, floorNote: r.floorNote });
    last = r;
    status.textContent = "";
    const saved = await chrome.runtime.sendMessage({ type: "chain-save", aimId: opts.aimId, chain: { id: chain.id, root: opts.root, partId: opts.partId, levels: chain.levels } }).catch(() => null);
    if (saved?.chain) chain.id = saved.chain.id;
    draw();
  }

  function draw() {
    const btn = (label, cls, fn) => mk("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick: fn });
    const atFloor = last?.floor && !last?.next;
    const actions = mk("div", { className: "row ladder-actions" },
      !chain.levels.length ? btn(`Go deeper: why?`, "", () => step())
        : atFloor ? btn("Go past the floor anyway", "tonal", () => step(true))
        : btn(last?.next ? `Go deeper: ${last.next}` : "Go one level deeper", "", () => step()),
      opts.talk ? btn("Explain it yourself", "text", () => opts.talk(chain.levels.map(l => l.what))) : null);
    box.replaceChildren(
      mk("p", { className: "ladder-root" }, mk("b", { textContent: opts.root }), opts.brief ? ` · ${opts.brief}` : ""),
      chain.levels.length ? mk("div", { className: "rungs" }, chain.levels.map(levelCard)) : null,
      chain.levels.length >= 8 ? mk("p", { className: "muted", textContent: "That's as deep as a chain goes here." }) : actions,
      status);
  }
  draw();
  return box;
}
