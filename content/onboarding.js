// Aim — first-time help on YouTube: a few one-time tips pointing at the parts of Aim you're about
// to use, and the Homeschool student's guided tour of Today. What's been shown is kept in
// `onboarding` (see setOnboarding in store.js); with no record at all (Aim from before onboarding),
// nothing shows.

let coach = null; // { bubble, ring, target, place }

function closeCoach() {
  if (!coach) return;
  coach.bubble.remove(); coach.ring?.remove();
  removeEventListener("resize", coach.place); removeEventListener("scroll", coach.place, true);
  coach = null;
}

// A speech bubble next to `target`. With `spotlight`, the rest of the page dims around it.
function showCoach(target, { title, body, step, of, primary, onPrimary, onBack, onSkip, spotlight }) {
  closeCoach();
  const bubble = el("div", { class: `wp wp-coach${spotlight ? " wp-coach-tour" : ""}`, role: "dialog", "aria-live": "polite", "aria-label": title },
    el("div", { class: "wp-coach-arrow" }),
    of > 1 ? el("div", { class: "wp-coach-step" }, `${step} of ${of}`) : null,
    el("div", { class: "wp-coach-title" }, title),
    el("div", { class: "wp-coach-body" }, body),
    el("div", { class: "wp-coach-actions" },
      onSkip ? el("button", { class: "wp-btn wp-btn-text wp-coach-skip", onclick: onSkip }, "Skip tour") : null,
      onBack ? el("button", { class: "wp-btn wp-btn-text", onclick: onBack }, "Back") : null,
      el("button", { class: "wp-btn wp-btn-primary wp-coach-next", onclick: onPrimary }, primary)));
  const ring = spotlight ? el("div", { class: "wp wp-coach-ring" }) : null;
  document.body.append(...[ring, bubble].filter(Boolean));
  const place = () => {
    if (!target.isConnected) return closeCoach();
    const r = target.getBoundingClientRect(), b = bubble.getBoundingClientRect();
    const fitsBelow = r.bottom + 12 + b.height < innerHeight - 8, fitsAbove = r.top - b.height - 12 > 8;
    const arrow = bubble.querySelector(".wp-coach-arrow");
    // A tall target (a whole column) gets the bubble beside it, wherever there's room.
    if (!fitsBelow && !fitsAbove && (r.left > b.width + 24 || innerWidth - r.right > b.width + 24)) {
      const onLeft = r.left > b.width + 24;
      const top = Math.max(12, Math.min(r.top + 24, innerHeight - b.height - 12));
      Object.assign(bubble.style, { top: `${top}px`, left: `${onLeft ? r.left - b.width - 14 : r.right + 14}px` });
      bubble.className = bubble.className.replace(/ wp-coach-(above|left|right)/g, "") + (onLeft ? " wp-coach-left" : " wp-coach-right");
      Object.assign(arrow.style, { left: "", top: "24px" });
    } else {
      const below = fitsBelow || !fitsAbove;
      const top = below ? Math.min(r.bottom + 12, innerHeight - b.height - 8) : r.top - b.height - 12;
      const left = Math.max(12, Math.min(r.left + Math.min(24, r.width / 2) - 20, innerWidth - b.width - 12));
      Object.assign(bubble.style, { top: `${top}px`, left: `${left}px` });
      bubble.className = bubble.className.replace(/ wp-coach-(above|left|right)/g, "") + (below ? "" : " wp-coach-above");
      Object.assign(arrow.style, { top: "", left: `${Math.max(16, Math.min(r.left + Math.min(24, r.width / 2) - left - 6, b.width - 28))}px` });
    }
    if (ring) Object.assign(ring.style, { top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  };
  coach = { bubble, ring, target, place };
  addEventListener("resize", place); addEventListener("scroll", place, true);
  const rect = target.getBoundingClientRect();
  if (rect.top < 64 || rect.bottom > innerHeight - 160) target.scrollIntoView({ block: "center" });
  place();
  requestAnimationFrame(place);
  bubble.querySelector(".wp-coach-next").focus({ preventScroll: true });
}

const tipSeen = key => !status.onboarding || !!status.onboarding.tips?.[key];
async function markTip(key) {
  const r = await send({ type: "onboarding", tip: key });
  if (r?.onboarding) status.onboarding = r.onboarding;
}

// After a page settles: the one tip (or tour) it calls for, if it hasn't been shown yet.
function showTips() {
  if (coach || modal || !status.onboarding || brk) return;
  const today = $("#wp-home.wp-today");
  if (today) return status.onboarding.hsTour ? null : startStudentTour();
  const home = $("#wp-home.wp-home-card .wp-home-search");
  if (home && !tipSeen("home")) {
    return showCoach(home, { title: "Start here", step: 1, of: 2, primary: "Next",
      body: `Tell ${BRAND} what you're looking for, the way you'd ask a librarian. That becomes your aim, and ${BRAND} keeps YouTube on it.`,
      onPrimary: async () => { await markTip("home"); closeCoach(); showTips(); } });
  }
  const chip = $("#wp-chip .wp-pill");
  if (chip && tipSeen("home") && !tipSeen("chip") && location.pathname === "/") {
    return showCoach(chip, { title: "Your aim lives here", step: 2, of: 2, primary: "Got it",
      body: "Open this anytime to take a break, change your aim, or say you're done. It's the only button to remember.",
      onPrimary: async () => { await markTip("chip"); closeCoach(); } });
  }
}

// ---------- the Homeschool student's tour of Today ----------
// Five stops, in the order a student meets them. Replay it from "Take the tour" on Today.
function studentSteps() {
  const name = status.homeschool?.student || "there";
  return [
    [".wp-today-hello", `Hi ${name}! This is Today`, "Everything your parent planned for today is here, in order. No feed, nothing extra."],
    [".wp-plan-next", "Start with the highlighted one", "Each lesson opens right here on YouTube, with your plan beside the video so you always know what's next."],
    [".wp-plan-item .wp-plan-dot", "Check things off", "Tap a circle when you finish something. Videos check themselves off when you watch to the end."],
    [".wp-today-ask", "Stuck or curious? Ask Aim", "Ask a question the way you'd ask a librarian. Aim finds a good video for it."],
    [".wp-plan-side", "See what's coming", "Projects, field trips and check-ins for this week. When everything today is checked off, you're done for the day."]
  ];
}

function startStudentTour(i = 0) {
  const steps = studentSteps().filter(([sel]) => $(sel));
  if (!steps.length) return;
  i = Math.max(0, Math.min(i, steps.length - 1));
  const [sel, title, body] = steps[i];
  const end = async () => {
    closeCoach();
    const r = await send({ type: "onboarding", hsTour: true });
    if (r?.onboarding) status.onboarding = r.onboarding;
  };
  showCoach($(sel), { title, body, step: i + 1, of: steps.length, spotlight: true,
    primary: i === steps.length - 1 ? "Let's start" : "Next",
    onPrimary: () => (i === steps.length - 1 ? end() : startStudentTour(i + 1)),
    onBack: i ? () => startStudentTour(i - 1) : null,
    onSkip: i < steps.length - 1 ? end : null });
}
