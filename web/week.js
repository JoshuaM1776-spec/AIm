// Aim Homeschool — the weekly plan. Aim proposes a week inside the approved curriculum; the parent
// reviews its essentials, edits anything (or asks in plain words), decides where videos come from
// when no preferred channel covers a subject (one grouped decision), and approves the whole week.
// Changing an approved week marks it "changed": the student keeps the approved copy until the parent
// approves again. PARENT_WEBSITE.md §5–6.

import { call } from "./api.js";
import { h, btn, busyBtn, act, toast, S, fmtDate, addDays, minutes, KIND_WORDS, suggestedChannels, parseChannel } from "./ui.js";

const STATUS = {
  proposed: ["Proposed: needs your approval", "warn"], approved: ["Approved", "ok"],
  changed: ["Changed since you approved it", "warn"], none: ["Not planned yet", ""]
};

export const weekOf = (l, weekStart) => l.weeks.find(w => w.weekStart === weekStart) || null;

async function saveWeek(l, w, draft, done) {
  return act("hs-week-save", { learnerId: l.id, weekStart: w.weekStart, draft, version: w.version }, { done });
}

// Where a subject's videos come from, decided once for the week (and for later weeks).
function gapCard(l, w) {
  if (!w.gaps.length) return null;
  const ch = S.home.channels;
  const saveChannels = (patch, done) => act("hs-channels-save", { bySubject: ch.bySubject || {}, outsideSubjects: ch.outsideSubjects || [], outsideOk: !!ch.outsideOk, version: ch.version, ...patch }, { done });
  return h("div", { class: "card", id: "gaps" },
    h("h2", {}, "Choose where videos come from"),
    h("p", { class: "muted small" }, "These lessons have no preferred channel yet. Decide once per subject; it applies to later weeks too. Aim can't approve the week until each one has a source."),
    w.gaps.map(g => {
      const picks = suggestedChannels(g.subject);
      const link = h("input", { type: "text", placeholder: "Or paste a channel link (youtube.com/@…)", "aria-label": `Channel for ${g.subject}`, style: "flex:1 1 240px" });
      return h("div", { class: "note", "data-gap": g.subject },
        h("b", {}, `${g.subject}: ${g.items.length} video lesson${g.items.length === 1 ? "" : "s"}`),
        picks.length ? h("div", {}, h("p", { class: "small" }, `Prefer channels for ${g.subject}. Hand-picked by Aim; choose any:`),
          h("div", { class: "chips" }, picks.map(c => h("button", { class: "chip", type: "button", onclick: () =>
            saveChannels({ bySubject: { ...(ch.bySubject || {}), [g.subject]: [...((ch.bySubject || {})[g.subject] || []), c] } }, `${c.name} preferred for ${g.subject}.`) }, `+ ${c.name}`)))) : null,
        h("div", { class: "row", style: "margin-top:8px" }, link, btn("Prefer it", "tonal small", () => {
          const c = parseChannel(link.value);
          if (!c) return toast("Paste a link like youtube.com/@channelname.");
          saveChannels({ bySubject: { ...(ch.bySubject || {}), [g.subject]: [...((ch.bySubject || {})[g.subject] || []), c] } }, `Preferred for ${g.subject}.`);
        })),
        h("div", { class: "row", style: "margin-top:8px" },
          btn(`Let Aim choose ${g.subject} videos from any channel`, "tonal small", () => saveChannels({ outsideSubjects: [...(ch.outsideSubjects || []), g.subject] }, `Aim will choose ${g.subject} videos.`)),
          btn("I'll pick each video", "text small", () => document.querySelector(`.item.gap`)?.scrollIntoView({ behavior: "smooth", block: "center" }))));
    }),
    h("label", { class: "check" }, h("input", { type: "checkbox", onchange: e => e.target.checked && saveChannels({ outsideOk: true }, "Aim will choose suitable videos when no preferred channel fits.") }),
      h("span", { class: "small" }, "From now on, let Aim choose suitable videos from any channel when none of my preferred channels fit (every subject).")));
}

function itemCard(l, w, draft, di, ii, gapIds) {
  const it = draft.days[di].items[ii], day = draft.days[di];
  const editing = h("div", { hidden: true });
  const pickBox = h("div", { hidden: true, class: "row", style: "margin-top:6px" });
  const card = h("div", { class: `item${gapIds.has(it.id) ? " gap" : ""}`, "data-item": it.id },
    h("div", { class: "kind" }, `${KIND_WORDS[it.kind]} · ${it.subject}${it.together ? " · together" : ""}`),
    h("div", { class: "t" }, it.title),
    h("div", { class: "small" }, it.detail),
    it.objective ? h("div", { class: "small why" }, "For: ", it.objective) : null,
    it.why ? h("div", { class: "small why" }, "Why: ", it.why) : null,
    h("div", { class: "small muted" }, minutes(it.minutes)),
    it.kind === "video" ? h("div", { class: "video small" }, it.video ? [h("b", {}, "Video: "), `${it.video.title} (${it.video.channel})`]
      : [h("b", {}, "Finds: "), `“${it.search}”`, ((S.home.channels.bySubject || {})[it.subject] || []).length ? ` · from ${(S.home.channels.bySubject[it.subject]).map(c => c.name).join(", ")} first` : ""]) : null,
    editing, pickBox,
    h("div", { class: "acts no-print" },
      h("button", { type: "button", "aria-label": `Move ${it.title} up`, disabled: ii === 0, onclick: () => { const a = draft.days[di].items; a.splice(ii - 1, 0, a.splice(ii, 1)[0]); saveWeek(l, w, draft); } }, "↑"),
      h("button", { type: "button", "aria-label": `Move ${it.title} down`, disabled: ii === day.items.length - 1, onclick: () => { const a = draft.days[di].items; a.splice(ii + 1, 0, a.splice(ii, 1)[0]); saveWeek(l, w, draft); } }, "↓"),
      h("select", { "aria-label": `Move ${it.title} to another day`, style: "height:26px;padding:0 6px;border-radius:13px;font-size:12px", onchange: e => {
        const to = draft.days.findIndex(d => d.day === e.target.value); draft.days[to].items.push(draft.days[di].items.splice(ii, 1)[0]); saveWeek(l, w, draft, `Moved to ${e.target.value}.`);
      } }, draft.days.map(d => h("option", { value: d.day, selected: d.day === day.day }, d.day))),
      h("button", { type: "button", onclick: () => { editing.hidden = !editing.hidden; } }, "Edit"),
      it.kind === "video" ? h("button", { type: "button", onclick: () => { pickBox.hidden = !pickBox.hidden; pickBox.querySelector("input")?.focus(); } }, it.video ? "Change video" : "Pick a video") : null,
      h("button", { type: "button", onclick: () => act("hs-week-revise", { learnerId: l.id, weekStart: w.weekStart,
        request: `Replace the ${KIND_WORDS[it.kind].toLowerCase()} “${it.title}” on ${day.day} with a different one for the same objective. Keep everything else the same.` }, { done: "Here's another." }) }, "Find another"),
      h("button", { type: "button", onclick: () => { draft.days[di].items.splice(ii, 1); saveWeek(l, w, draft, "Removed."); } }, "Remove")));
  // Edit in place: title, what to do, time.
  const t = h("input", { type: "text", value: it.title, "aria-label": "Title" }), d = h("textarea", { rows: 2, "aria-label": "What the student does" }), m = h("input", { type: "number", value: it.minutes, min: 5, max: 180, "aria-label": "Minutes", style: "width:80px" });
  d.value = it.detail;
  editing.append(t, d, h("div", { class: "row" }, m, h("span", { class: "small" }, "min"), btn("Save", "small", () => { Object.assign(it, { title: t.value, detail: d.value, minutes: Number(m.value) || it.minutes }); saveWeek(l, w, draft, "Saved."); })));
  // A specific video, by its link (YouTube's own title and channel, checked by Aim).
  const link = h("input", { type: "text", placeholder: "Paste a YouTube video link", "aria-label": "Video link", style: "flex:1;min-width:0" });
  pickBox.append(link, btn("Use it", "small", async () => {
    try { const r = await call("hs-video-info", { url: link.value }); it.video = r.video; await saveWeek(l, w, draft, "Video chosen for this lesson."); }
    catch (e) { toast(e.message, { error: true }); }
  }));
  return card;
}

function projectCard(p, { withStatus } = {}) {
  if (!p) return null;
  const owned = new Set(S.home.materials.owned || []);
  return h("div", { class: "card project" },
    h("div", { class: "spread" }, h("div", {}, h("div", { class: "small muted" }, `${p.subject} · ${p.day} · ${minutes(p.minutes)} · ${p.involvement === "together" ? "do it together" : p.involvement === "some" ? "some help from you" : "on their own"}`),
      h("h2", {}, p.title)), withStatus ? h("span", { class: "pill learn" }, { proposed: "Proposed", approved: "Approved", ready: "Materials ready", completed: "Completed" }[p.status]) : null),
    p.objective ? h("p", { class: "small" }, "Shows: ", p.objective) : null,
    p.materials.length ? h("div", {}, h("h3", { style: "margin-top:10px" }, "Materials"), h("ul", { class: "small" }, p.materials.map(m => h("li", {}, `${m.name}${m.qty ? ` (${m.qty})` : ""}${owned.has(m.name.toLowerCase()) ? " · you have it" : ""}`)))) : null,
    p.deliverables.length ? h("p", { class: "small" }, h("b", {}, "Deliverables: "), p.deliverables.join("; ")) : null,
    p.prep.length ? h("p", { class: "small" }, h("b", {}, "Before the day: "), p.prep.join("; ")) : null,
    p.safety ? h("p", { class: "small note warn" }, h("b", {}, "Safety: "), p.safety) : null);
}
export { projectCard };

// The week's review. compact: inside setup.
export function weekReview(l, weekStart, { onApproved } = {}) {
  const w = weekOf(l, weekStart);
  const box = h("div", { class: "stack" });
  if (!l.curriculum?.approved) return h("div", { class: "card" }, h("p", {}, "Weeks are planned from the approved curriculum. "), h("a", { href: "#/curriculum" }, "Review and approve the curriculum"));
  if (!w) {
    box.append(h("div", { class: "card" }, h("h2", {}, `Plan the week of ${fmtDate(weekStart)}`),
      h("p", { class: "muted" }, "Aim proposes lessons, a TeachBack check and a featured project from the approved curriculum. You review and approve."),
      busyBtn("Propose this week", "", () => act("hs-week-propose", { learnerId: l.id, weekStart }, { done: "Here's a proposed week. Look it over." }), { working: "Planning the week…", attrs: { id: "proposeWeek" } })));
    return box;
  }
  const draft = structuredClone(w.draft), gapIds = new Set(w.gaps.flatMap(g => g.items));
  const [label, tone] = STATUS[w.status] || STATUS.none;
  const items = draft.days.flatMap(d => d.items), total = items.reduce((n, i) => n + i.minutes, 0) + (draft.project?.minutes || 0);
  const objectives = [...new Set(items.map(i => i.objective).filter(Boolean))];
  box.append(h("div", { class: "card" },
    h("div", { class: "spread" },
      h("div", {}, h("span", { class: `pill ${tone}`, id: "weekStatus" }, label),
        h("p", { class: "small muted", style: "margin-top:6px" }, `${items.length} lessons · ${minutes(total)} in all${w.approvedAt ? ` · approved ${fmtDate(w.approvedAt.slice(0, 10))}` : ""}`)),
      h("div", { class: "row" },
        w.status === "changed" ? btn("Undo my changes", "text", () => saveWeek(l, w, structuredClone(w.approved), "Back to the approved week.")) : null,
        w.status !== "approved" ? busyBtn(w.status === "changed" ? "Approve changes" : "Approve this week", "", async () => {
          await act("hs-week-approve", { learnerId: l.id, weekStart, version: w.version }, { done: `Approved. ${l.name} will see it on Today.` });
          onApproved?.();
        }, { attrs: { id: "approveWeek", disabled: w.gaps.length > 0, title: w.gaps.length ? "Choose where videos come from first" : "" } }) : null)),
    w.status === "changed" ? h("div", { class: "note warn small" }, `You changed this week after approving it. ${l.name} still sees the approved version until you approve again.`) : null,
    objectives.length ? h("div", {}, h("h3", { style: "margin-top:10px" }, "This week's objectives"), h("ul", { class: "small" }, objectives.map(o => h("li", {}, o)))) : null,
    w.draft.note ? h("p", { class: "small note learn" }, w.draft.note) : null));
  const gaps = gapCard(l, w);
  if (gaps) box.append(gaps);
  const ask = h("textarea", { rows: 2, placeholder: "Ask for a change, like “We're camping Wednesday, make science outdoors” or “More review of fractions”", "aria-label": "Ask for a change" });
  box.append(h("div", { class: "card no-print" }, h("h3", {}, "Ask for a change"), ask,
    busyBtn("Ask Aim", "tonal", () => act("hs-week-revise", { learnerId: l.id, weekStart, request: ask.value }, { done: "Updated. Look it over." }), { working: "Revising…", attrs: { style: "margin-top:8px" } })));
  const schoolDays = S.home.household.settings.schoolDays || ["Mon", "Tue", "Wed", "Thu", "Fri"];
  box.append(h("div", { class: "days" }, draft.days.filter(d => d.items.length || schoolDays.includes(d.day)).map((d, i0) => {
    const di = draft.days.indexOf(d);
    return h("section", { class: `day${schoolDays.includes(d.day) ? "" : " off"}`, "aria-label": d.day },
      h("h3", {}, d.day, h("span", {}, `${fmtDate(d.date)} · ${minutes(d.items.reduce((n, x) => n + x.minutes, 0))}`)),
      d.items.map((_, ii) => itemCard(l, w, draft, di, ii, gapIds)),
      draft.project?.day === d.day ? h("div", { class: "item" }, h("div", { class: "kind" }, "Project"), h("div", { class: "t" }, draft.project.title)) : null);
  })));
  if (draft.project) box.append(projectCard(draft.project));
  return box;
}

export function weekPage(weekStart) {
  const l = S.home.learners.find(x => x.id === S.learnerId);
  if (!l) return h("p", { class: "empty" }, "Add a student first (Settings).");
  weekStart ||= S.home.thisWeek;
  return h("div", {},
    h("div", { class: "head" },
      h("div", {}, h("h1", {}, `Week of ${fmtDate(weekStart, { month: "long", day: "numeric" })}`), h("p", { class: "lede" }, `${l.name}'s plan. Approve the whole week once it looks right; you don't need to approve each lesson.`)),
      h("div", { class: "row no-print" }, h("a", { class: "btn tonal small", href: `#/week/${addDays(weekStart, -7)}` }, "‹ Previous"),
        weekStart !== S.home.thisWeek ? h("a", { class: "btn tonal small", href: "#/week" }, "This week") : null,
        h("a", { class: "btn tonal small", href: `#/week/${addDays(weekStart, 7)}` }, "Next ›"))),
    weekReview(l, weekStart));
}
