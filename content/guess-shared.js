// Aim — guess first, explain after (0.71): which question to ask before a video, and what the
// one-minute close is about. Pure functions of an aim, shared by the background (store.js) and
// YouTube's pages (content/goal.js loads after this). Nothing here reads or writes storage.

const PRE_GAP_MS = 6 * 3600e3; // a skipped question isn't asked again for six hours
// What to ask before this video, if anything: last time's open question first, then the next part
// with a question nobody has guessed at or skipped lately. Null when guessing is off.
function preQuestion(p, settingsOn = true) {
  if (!p || !settingsOn || p.learn || p.plan) return null;
  const fresh = g => !g || (g.skipped && Date.now() - g.at > PRE_GAP_MS);
  if (p.openQuestion?.q && !p.openQuestion.closedAt && fresh(p.openQuestion.guessed)) return { partId: "open", q: p.openQuestion.q, open: true };
  const part = (p.map?.parts || []).find(x => x.ask && x.status !== "explained" && !x.closedAt && fresh(x.guessed));
  return part ? { partId: part.id, q: part.ask, title: part.title } : null;
}
// What the one-minute close is about: the latest guess not yet closed, else the next part.
function closeTarget(p) {
  if (!p) return null;
  const open = p.openQuestion?.guessed?.text && !p.openQuestion.closedAt ? { partId: "open", title: p.openQuestion.q, brief: "", guess: p.openQuestion.guessed.text, question: p.openQuestion.q, at: p.openQuestion.guessed.at } : null;
  const parts = (p.map?.parts || []).filter(x => x.guessed?.text && !x.closedAt)
    .map(x => ({ partId: x.id, title: x.title, brief: x.brief, guess: x.guessed.text, question: x.ask || "", at: x.guessed.at }));
  const latest = [open, ...parts].filter(Boolean).sort((a, b) => b.at - a.at)[0];
  if (latest) return latest;
  const next = (p.map?.parts || []).find(x => x.status !== "explained" && !x.closedAt);
  return next ? { partId: next.id, title: next.title, brief: next.brief, guess: "", question: "" } : null;
}

