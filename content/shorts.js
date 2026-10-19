// Aim — Shorts from your topics (Settings → Learn something). Shorts stay hidden, except those from
// your Learn something channels and channels you marked Prefer, offered on YouTube's home page as a
// "Quick review" of things you've already learned. Opening one starts a Quick review Target; a Short
// from anywhere else (YouTube's swipe to the next one) waits behind a card that offers your next
// review instead. No AI: Shorts are matched to what you learned by the words they share.

const REVIEW_SHOWN = 5;
const REVIEW_KEY = "aim-review"; // this tab's review queue

const reviewQueue = () => { try { return JSON.parse(sessionStorage.getItem(REVIEW_KEY) || "null"); } catch { return null; } };
const saveReviewQueue = q => { try { sessionStorage.setItem(REVIEW_KEY, JSON.stringify(q)); } catch {} };
const shortThumbs = id => { const e = encodeURIComponent(id); return `url("https://i.ytimg.com/vi/${e}/oar2.jpg"), url("https://i.ytimg.com/vi/${e}/hqdefault.jpg")`; };

// Is this Short from your topics' channels? Known from their Shorts feeds, cached for a day by learn.js.
async function isLearnShort(id) {
  if (!settings.learnShorts || !id) return false;
  if (reviewQueue()?.items?.some(v => v.id === id)) return true;
  const { learn = {} } = await chrome.storage.local.get("learn");
  return learnChannels().some(c => (learn.channels?.[c.handle]?.shorts || []).some(v => v.id === id));
}

// The home page's Quick review row, under Learn something: reviews of what you've learned first.
function fillReview(box, shorts) {
  if (!settings.learnShorts || !shorts?.length) return;
  send({ type: "review-shorts", shorts }).then(ranked => {
    const picks = (Array.isArray(ranked) ? ranked : []).slice(0, REVIEW_SHOWN);
    if (!picks.length || !box.isConnected) return;
    box.append(el("div", { class: "wp-review" },
      el("div", { class: "wp-row-between" },
        el("div", { class: "wp-label" }, "Quick review"),
        el("span", { class: "wp-learn-meta" }, picks.some(v => v.review) ? "Shorts on things you've learned" : "Shorts from your topics")),
      el("div", { class: "wp-review-row" }, ...picks.map((v, i) => el("button", { class: "wp-review-item", title: v.title, onclick: () => startReview(picks, i) },
        el("span", { class: "wp-review-thumb", style: `background-image: ${shortThumbs(v.id)}` }),
        el("span", { class: "wp-mini-title" }, v.title),
        el("span", { class: "wp-learn-meta" }, v.review ? `Reviews: ${v.review}` : v.channel))))));
  });
}

// A Quick review Target with the row's Shorts, played one after another from here.
async function startReview(picks, i) {
  const v = picks[i], about = picks.find(x => x.review)?.review || v.topic;
  const r = await send({ type: "purpose-start", text: `Quick review: ${about}`.slice(0, 300), video: { id: v.id, title: v.title, channel: v.channel },
    learn: { topic: v.topic, videos: picks.map(x => ({ id: x.id, title: x.title, channel: x.channel })) } });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't start that. Try again.");
  saveReviewQueue({ items: picks.map(x => ({ id: x.id, title: x.title, review: x.review })) });
  location.href = `/shorts/${encodeURIComponent(v.id)}`;
}

// The one after this Short; for a Short not in the review, the one after the last you watched.
function nextReview(id) {
  const q = reviewQueue(), items = q?.items || [];
  const at = items.findIndex(v => v.id === id);
  return items[(at < 0 ? q?.pos ?? -1 : at) + 1] || null;
}
async function finishReview() {
  closeNotice();
  await send({ type: "purpose-done", outcome: "yes" });
  saveReviewQueue(null);
  location.href = "/";
}

// On a Short you may watch: where you are in the review, and the way to the next one.
function showReviewBar(id) {
  const q = reviewQueue(), items = q?.items || [], at = items.findIndex(v => v.id === id);
  if (at < 0) return;
  saveReviewQueue({ ...q, pos: at });
  const next = nextReview(id);
  showNotice([
    el("div", { style: "min-width:0" },
      el("div", { class: "wp-strong" }, `Quick review · ${at + 1} of ${items.length}`),
      items[at].review ? el("div", { class: "wp-muted wp-ellipsis" }, `Reviews: ${items[at].review}`) : null),
    next ? el("button", { class: "wp-btn wp-btn-primary", onclick: () => { location.href = `/shorts/${encodeURIComponent(next.id)}`; } }, "Next")
      : el("button", { class: "wp-btn wp-btn-primary", onclick: finishReview }, "Done reviewing")
  ]);
}

// A Short that isn't from your topics, while Shorts from your topics are on: the next review instead.
function reviewCardParts(id) {
  const next = nextReview(id);
  return {
    title: "Only Shorts from your topics",
    actions: next ? [el("button", { class: "wp-btn wp-btn-primary", onclick: () => { location.href = `/shorts/${encodeURIComponent(next.id)}`; } }, "Next review"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: finishReview }, "Done reviewing")] : null
  };
}
