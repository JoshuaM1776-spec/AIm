// Aim Homeschool — the parent website. Overview, Curriculum, Weekly Plan, Projects & Materials and
// Progress, with Settings for the family and a calm, resumable setup (PARENT_WEBSITE.md §3, §10a).
// Each page draws from the family's data (hs-home) and changes it through Aim's server.

import { configured, session, sendCode, verify, adoptLink, signOut, call, ApiError } from "./api.js";
import { h, btn, busyBtn, act, toast, S, reload, learner, fmtDate, addDays, minutes, STATUS_WORDS, suggestedChannels, parseChannel, KIND_WORDS } from "./ui.js";
import { curriculumEditor, curriculumPage, uploadBox, uploadsList, buildFromUploads } from "./curriculum.js";
import { weekPage, weekReview, weekOf } from "./week.js";
import { projectsPage } from "./projects.js";
import { progressPage } from "./progress.js";

const app = document.getElementById("app");
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SUBJECTS = ["Math", "Science", "English", "History"];

// ---------- signing in ----------
const signin = { email: "", step: "email" };
function signInPage(err = "") {
  const msg = h("p", { class: "small", role: "status", style: "color:var(--danger)" }, err);
  if (signin.step === "code") {
    const code = h("input", { type: "text", id: "code", inputmode: "numeric", autocomplete: "one-time-code", placeholder: "6-digit code", "aria-label": "Code from the email" });
    return h("div", { class: "narrow card" }, h("h1", {}, "Check your email"),
      h("p", { class: "muted" }, `We sent a sign-in email to ${signin.email}. Enter its code, or click its link on this computer.`),
      h("form", { class: "row", onsubmit: async e => { e.preventDefault(); try { await verify(signin.email, code.value); start(); } catch (x) { msg.textContent = x.message; } } },
        code, h("button", { class: "btn", type: "submit" }, "Sign in")),
      msg, btn("Use a different email", "text small", () => { signin.step = "email"; start(); }));
  }
  const email = h("input", { type: "email", id: "email", autocomplete: "email", placeholder: "you@example.com", "aria-label": "Email address", value: signin.email });
  return h("div", { class: "narrow" },
    h("div", { class: "card" }, h("h1", {}, "Aim Homeschool"),
      h("p", { class: "lede" }, "You set the direction. Aim plans the week, finds the videos, and shows you what your child understood."),
      h("form", { class: "row", style: "margin-top:16px", onsubmit: async e => {
        e.preventDefault();
        try { signin.email = await sendCode(email.value); signin.step = "code"; start(); } catch (x) { msg.textContent = x.message; }
      } }, email, h("button", { class: "btn", type: "submit" }, "Send sign-in email")), msg,
      h("p", { class: "small muted" }, "Use the same account as Aim's extension, if you have one.")));
}

// ---------- the header ----------
function header() {
  const nav = document.getElementById("nav"), who = document.getElementById("who");
  const signedIn = !!S.home;
  nav.hidden = !signedIn;
  const route = location.hash.split("/")[1] || "overview";
  for (const a of nav.querySelectorAll("a")) a.getAttribute("href") === `#/${route}` ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  who.replaceChildren();
  if (!signedIn) return;
  if (S.home.learners.length > 1) who.append(h("select", { "aria-label": "Student", onchange: e => { S.learnerId = e.target.value; render(); } },
    S.home.learners.map(l => h("option", { value: l.id, selected: l.id === S.learnerId }, l.name))));
  who.append(h("a", { href: "#/settings" }, "Settings"), btn("Sign out", "text small", async () => { await signOut(); S.home = null; location.hash = ""; start(); }));
}

// ---------- overview ----------
// One place that says what to do next (PARENT_WEBSITE.md §3: under a minute to the next action).
function attention(l) {
  const out = [], tw = S.home.thisWeek, w = weekOf(l, tw), nw = weekOf(l, addDays(tw, 7));
  const set = S.home.household.settings;
  if (!set.setupDone) out.push(["Finish setting up", `Step ${Math.min(7, (set.setupStep || 0) + 1)} of 7.`, h("a", { class: "btn", href: "#/setup" }, "Continue setup")]);
  if (l.curriculum?.pending) out.push(["The curriculum has changes to approve", "New weeks follow the approved version.", h("a", { class: "btn tonal", href: "#/curriculum" }, "Review")]);
  if (l.curriculum?.approved) {
    if (!w) out.push(["This week isn't planned", "Aim proposes it from the curriculum; you approve.", busyBtn("Plan this week", "", () => act("hs-week-propose", { learnerId: l.id, weekStart: tw }, { done: "Proposed. Review it in Weekly Plan." }), { working: "Planning…" })]);
    else if (w.gaps.length) out.push([`Choose where ${w.gaps.map(g => g.subject).join(" and ")} videos come from`, "Then you can approve the week.", h("a", { class: "btn", href: "#/week" }, "Decide")]);
    else if (w.status === "proposed") out.push(["Approve this week's plan", `${w.draft.days.flatMap(d => d.items).length} lessons are waiting for you.`, h("a", { class: "btn", href: "#/week" }, "Review the week")]);
    else if (w.status === "changed") out.push(["Approve your changes to this week", `${l.name} still sees the approved version.`, h("a", { class: "btn", href: "#/week" }, "Review")]);
    if (!nw && new Date().getDay() >= 4) out.push(["Plan next week", "Look it over before Monday.", h("a", { class: "btn tonal", href: `#/week/${addDays(tw, 7)}` }, "Next week")]);
    else if (nw && nw.status !== "approved") out.push(["Next week is waiting for approval", "", h("a", { class: "btn tonal", href: `#/week/${addDays(tw, 7)}` }, "Review")]);
  }
  const owned = new Set(S.home.materials.owned || []);
  const soon = [w, nw].filter(Boolean).map(x => (x.approved || x.draft).project).filter(p => p && p.status !== "completed");
  const missing = new Set(soon.flatMap(p => p.materials).map(m => m.name.toLowerCase()).filter(n => !owned.has(n)));
  if (missing.size) out.push([`${missing.size} supplies to get for upcoming projects`, soon.map(p => p.title).join(", "), h("a", { class: "btn tonal", href: "#/projects" }, "See the list")]);
  if (!l.devices.length && set.setupDone) out.push([`Connect ${l.name}'s Chrome`, "So Today on YouTube shows the approved plan.", h("a", { class: "btn tonal", href: "#/settings" }, "Connect")]);
  return out;
}

function overview() {
  const l = learner();
  if (!l) { location.hash = "#/setup"; return h("div"); }
  const tw = S.home.thisWeek, w = weekOf(l, tw), plan = w?.approved;
  const items = plan ? plan.days.flatMap(d => d.items) : [];
  const done = new Set(l.done);
  const todo = attention(l);
  const counts = { demonstrated: 0, developing: 0, needs_review: 0 };
  for (const s of l.curriculum?.approved?.subjects || []) for (const u of s.units) for (const o of u.objectives) if (counts[l.objectives[o.id]?.status] !== undefined) counts[l.objectives[o.id].status]++;
  const project = [w, weekOf(l, addDays(tw, 7))].filter(Boolean).map(x => ({ p: (x.approved || x.draft).project, ws: x.weekStart })).find(x => x.p && x.p.status !== "completed");
  const today = new Date().toISOString().slice(0, 10), todays = plan?.days.find(d => d.date === today)?.items || [];
  return h("div", {},
    h("div", { class: "head" }, h("div", {}, h("h1", {}, `Hi${S.home.household.name && S.home.household.name !== "Our family" ? `, ${S.home.household.name}` : ""}`),
      h("p", { class: "lede" }, `${l.name}'s week of ${fmtDate(tw, { month: "long", day: "numeric" })}.`))),
    h("div", { class: "card", id: "attention" }, h("h2", {}, "Needs your attention"),
      todo.length ? h("ul", { class: "attention" }, todo.map(([t, sub, action]) => h("li", {}, h("div", {}, h("b", {}, t), sub ? h("div", { class: "small muted" }, sub) : null), action)))
        : h("p", { class: "muted" }, "Nothing needs you right now. The week is approved and on its way.")),
    h("div", { class: "grid2", style: "margin-top:16px" },
      h("div", { class: "card" }, h("h2", {}, "This week"),
        plan ? [h("p", { class: "muted small" }, `${items.filter(i => done.has(i.id)).length} of ${items.length} lessons done · ${minutes(items.reduce((n, i) => n + i.minutes, 0))} planned`),
          h("h3", { style: "margin-top:12px" }, "Today"),
          todays.length ? h("ul", { class: "small" }, todays.map(i => h("li", {}, `${done.has(i.id) ? "✓ " : ""}${i.subject}: ${i.title}`))) : h("p", { class: "small muted" }, "Nothing planned today.")]
          : h("p", { class: "muted small" }, w ? "Planned, waiting for your approval." : "Not planned yet."),
        h("a", { href: "#/week", class: "small" }, "Open the weekly plan")),
      h("div", { class: "card" }, h("h2", {}, "Next project"),
        project ? [h("p", {}, h("b", {}, project.p.title), h("span", { class: "muted small" }, ` · ${project.p.subject} · ${project.p.day}, week of ${fmtDate(project.ws)}`)),
          h("p", { class: "small muted" }, project.p.objective)] : h("p", { class: "muted small" }, "None planned yet."),
        h("a", { href: "#/projects", class: "small" }, "Projects & Materials")),
      h("div", { class: "card" }, h("h2", {}, "What they've shown"),
        h("div", { class: "stat" }, h("div", {}, h("b", {}, counts.demonstrated), h("span", { class: "small muted" }, "Demonstrated")),
          h("div", {}, h("b", {}, counts.developing), h("span", { class: "small muted" }, "Developing")), h("div", {}, h("b", {}, counts.needs_review), h("span", { class: "small muted" }, "Needs review"))),
        h("p", { class: "small muted" }, "From TeachBack checks and projects. Watching a video doesn't count."),
        h("a", { href: "#/progress", class: "small" }, "See progress"))));
}

// ---------- settings ----------
function studentForm(l, { onSaved, compact } = {}) {
  const name = h("input", { type: "text", value: l?.name || "", placeholder: "Student's first name", "aria-label": "Student's name", id: "studentName" });
  const subjects = [...new Set([...(S.home.household.settings.subjects || []), ...Object.keys(l?.levels || {}), ...(l ? [] : SUBJECTS)])];
  const rows = h("div", {});
  const addRow = (subject = "", level = "", on = true) => rows.append(h("div", { class: "row", style: "margin-top:6px", "data-subject-row": "" },
    h("input", { type: "checkbox", checked: on, "aria-label": `Include ${subject || "subject"}` }),
    h("input", { type: "text", value: subject, placeholder: "Subject", "aria-label": "Subject", style: "width:160px" }),
    h("input", { type: "text", value: level, placeholder: "Level, like Grade 6", "aria-label": `${subject || "Subject"} level`, style: "width:180px" })));
  for (const s of subjects) addRow(s, l?.levels?.[s] || "", true);
  const interests = h("input", { type: "text", value: l?.interests || "", placeholder: "Volcanoes, drawing, airplanes…", "aria-label": "Interests", style: "width:100%" });
  const save = async () => {
    const levels = {}, chosen = [];
    for (const r of rows.querySelectorAll("[data-subject-row]")) {
      const [on, s, lv] = r.querySelectorAll("input");
      if (on.checked && s.value.trim()) { chosen.push(s.value.trim()); if (lv.value.trim()) levels[s.value.trim()] = lv.value.trim(); }
    }
    const r = await act("hs-learner-save", { id: l?.id, name: name.value, levels, interests: interests.value }, { done: "Saved." });
    await act("hs-household-save", { settings: { subjects: chosen } }, { quiet: true });
    S.learnerId = r.id;
    onSaved?.(r.id);
  };
  return h("div", {}, h("label", { class: "field" }, "Name", name),
    h("div", { class: "field" }, h("span", {}, "Subjects, and their level in each"), h("span", { class: "small muted" }, "A level per subject: ahead in math and newer at writing is normal."), rows,
      btn("+ Subject", "text small", () => addRow("", "", true))),
    h("label", { class: "field" }, "Interests (optional)", interests),
    busyBtn(compact ? "Save and continue" : "Save", "", save, { attrs: { id: "saveStudent" } }));
}

function pairBox(l) {
  const out = h("div", {});
  return h("div", {},
    l.devices.length ? h("ul", { class: "materials" }, l.devices.map(d => h("li", {}, h("span", { style: "flex:1" }, `Chrome connected ${fmtDate(d.pairedAt.slice(0, 10))}`),
      btn("Disconnect", "text small danger", () => confirm(`Disconnect this browser from ${l.name}? It stops showing the plan.`) && act("hs-device-remove", { userId: d.userId }, { done: "Disconnected." }))))) : h("p", { class: "small muted" }, "No browser connected yet."),
    busyBtn(`Connect ${l.name}'s Chrome`, "tonal", async () => {
      const r = await call("hs-pair-code", { learnerId: l.id });
      out.replaceChildren(h("div", { class: "note learn" }, h("p", {}, "On ", h("b", {}, `${l.name}'s computer`), ": install Aim in Chrome, open Aim's Settings, choose ", h("b", {}, "Connect to my family"), ", and enter:"),
        h("p", { style: "font: 700 28px var(--font-display); letter-spacing: .08em", id: "pairCode" }, r.code),
        h("p", { class: "small muted" }, `Works once, for the next hour. ${l.name} doesn't need an email or a password. Today on YouTube's homepage then shows the approved plan.`)));
    }), out);
}

function channelsEditor() {
  const ch = S.home.channels, by = structuredClone(ch.bySubject || {});
  const subjects = [...new Set([...(S.home.household.settings.subjects || []), ...S.home.learners.flatMap(l => (l.curriculum?.approved?.subjects || l.curriculum?.draft?.subjects || []).map(s => s.name)), ...Object.keys(by)])];
  const save = (patch, done) => act("hs-channels-save", { bySubject: by, outsideSubjects: ch.outsideSubjects || [], outsideOk: !!ch.outsideOk, version: ch.version, ...patch }, { done });
  if (!subjects.length) return h("p", { class: "small muted" }, "Add subjects first.");
  return h("div", {}, subjects.map(s => {
    const mine = by[s] || [], have = new Set(mine.map(c => c.handle || c.id));
    const link = h("input", { type: "text", placeholder: "Paste a channel link", "aria-label": `Channel link for ${s}`, style: "flex:1 1 200px" });
    return h("div", { style: "margin-top:14px", "data-channels": s }, h("h3", {}, s),
      mine.length ? h("div", { class: "chips", style: "margin-top:6px" }, mine.map((c, i) => h("button", { class: "chip", "aria-pressed": "true", title: "Remove", type: "button",
        onclick: () => { by[s] = mine.filter((_, j) => j !== i); save({}, `Removed ${c.name}.`); } }, `${c.name} ✕`))) : h("p", { class: "small muted" }, "None yet."),
      h("div", { class: "chips", style: "margin-top:6px" }, suggestedChannels(s).filter(c => !have.has(c.handle)).map(c => h("button", { class: "chip", type: "button",
        onclick: () => { by[s] = [...mine, c]; save({}, `${c.name} preferred for ${s}.`); } }, `+ ${c.name}`))),
      h("div", { class: "row", style: "margin-top:6px" }, link, btn("Add", "tonal small", () => {
        const c = parseChannel(link.value); if (!c) return toast("Paste a link like youtube.com/@channelname."); by[s] = [...mine, c]; save({}, "Added.");
      })),
      (ch.outsideSubjects || []).includes(s) ? h("p", { class: "small muted" }, "Aim may also choose videos from other channels for this subject. ",
        btn("Stop that", "text small", () => save({ outsideSubjects: (ch.outsideSubjects || []).filter(x => x !== s) }))) : null);
  }), h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!ch.outsideOk, onchange: e => save({ outsideOk: e.target.checked }, "Saved.") }),
    h("span", { class: "small" }, "When none of my preferred channels fit, let Aim choose suitable videos from any channel (every subject).")));
}

function settingsPage() {
  const set = S.home.household.settings;
  const days = new Set(set.schoolDays || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const famName = h("input", { type: "text", value: S.home.household.name, "aria-label": "Family name" });
  const mins = h("input", { type: "number", min: 30, max: 480, value: set.minutesPerDay || 180, "aria-label": "Minutes per school day", style: "width:100px" });
  const newStudent = h("div", { hidden: true });
  return h("div", {},
    h("div", { class: "head" }, h("h1", {}, "Settings")),
    h("div", { class: "grid2" },
      h("div", { class: "stack" },
        h("div", { class: "card" }, h("h2", {}, "Family"), h("label", { class: "field" }, "Family name", famName),
          h("div", { class: "field" }, "School days", h("div", { class: "chips" }, DAYS.map(d => h("button", { class: "chip", type: "button", "aria-pressed": String(days.has(d)), onclick: e => {
            days.has(d) ? days.delete(d) : days.add(d); e.target.setAttribute("aria-pressed", String(days.has(d))); } }, d)))),
          h("label", { class: "field" }, "About how long a school day is (minutes)", mins),
          busyBtn("Save", "", () => act("hs-household-save", { name: famName.value, settings: { schoolDays: DAYS.filter(d => days.has(d)), minutesPerDay: Number(mins.value) } }, { done: "Saved." }))),
        h("div", { class: "card" }, h("h2", {}, "Students"),
          S.home.learners.map(l => h("details", { style: "margin-top:10px" }, h("summary", {}, h("b", {}, l.name), h("span", { class: "muted small" }, ` · ${Object.entries(l.levels).map(([s, v]) => `${s}: ${v}`).join(", ") || "no levels set"}`)),
            studentForm(l), h("div", { class: "divider" }), h("h3", {}, "Chrome"), pairBox(l), h("div", { class: "divider" }),
            btn(`Remove ${l.name}`, "text small danger", () => confirm(`Remove ${l.name}, with their curriculum, weeks and progress? This can't be undone.`) && act("hs-learner-remove", { id: l.id }, { done: "Removed." })))),
          btn("+ Add a student", "tonal small", () => { newStudent.hidden = false; newStudent.replaceChildren(studentForm(null)); }, { style: "margin-top:12px" }), newStudent)),
      h("div", { class: "stack" },
        h("div", { class: "card" }, h("h2", {}, "Preferred channels"), h("p", { class: "small muted" }, "Per subject. Aim looks to these first for video lessons when a video fits; nothing is preferred unless you choose it."), channelsEditor()),
        h("div", { class: "card" }, h("h2", {}, "Curriculum files"), uploadsList() || h("p", { class: "small muted" }, "None. Add one from the Curriculum page.")),
        h("div", { class: "card" }, h("h2", {}, "Account"), h("p", { class: "small" }, session()?.email || ""),
          h("div", { class: "row" },
            busyBtn("Download my data", "tonal small", async () => {
              const r = await call("account-export");
              const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" })), download: `aim-homeschool-${new Date().toISOString().slice(0, 10)}.json` });
              document.body.append(a); a.click(); a.remove();
            }),
            btn("Delete account…", "text small danger", async () => {
              const typed = prompt("This deletes your account and everything with it: your family, students, plans, curriculum files and progress. Type DELETE to confirm.");
              if (typed !== "DELETE") return;
              try { await call("account-delete", { confirm: "DELETE" }); await signOut(); S.home = null; location.hash = ""; start(); } catch (e) { toast(e.message); }
            }))))));
}

// ---------- setup (PARENT_WEBSITE.md §10a) ----------
const STEPS = 7;
async function goStep(n) { await act("hs-household-save", { settings: { setupStep: n, ...(n >= STEPS ? { setupDone: true } : {}) } }, { quiet: true }); if (n >= STEPS) location.hash = "#/overview"; }
function setupPage() {
  const set = S.home.household.settings, step = Math.min(STEPS - 1, set.setupStep || 0), l = learner();
  const nav = (next, { skip, label = "Continue" } = {}) => h("div", { class: "row", style: "margin-top:20px" },
    step > 0 ? btn("Back", "text", () => goStep(step - 1)) : null, next ? busyBtn(label, "", next, { attrs: { id: "next" } }) : null,
    skip ? btn("Skip for now", "text", () => goStep(step + 1)) : null);
  const frame = (title, lede, ...body) => h("div", { class: "narrow", style: "max-width:860px" },
    h("div", { class: "steps", "aria-label": `Step ${step + 1} of ${STEPS}` }, Array.from({ length: STEPS }, (_, i) => h("span", { class: i <= step ? "on" : "" }))),
    h("p", { class: "small muted" }, `Step ${step + 1} of ${STEPS} · you can stop and come back any time`), h("h1", {}, title), lede ? h("p", { class: "lede" }, lede) : null, ...body);
  switch (step) {
    case 0: return frame("Welcome to Aim Homeschool", "You set the direction. Aim plans the week, finds the videos, and shows you what your child understood.",
      h("div", { class: "card", style: "margin-top:16px" }, h("p", {}, "Setup takes about 15 minutes:"),
        h("ol", {}, h("li", {}, "Your student, and their level in each subject"), h("li", {}, "Aim's role, and the curriculum you use"), h("li", {}, "The big picture for the year"),
          h("li", {}, "Channels you trust (optional)"), h("li", {}, "Your first week"), h("li", {}, "Your student's Chrome")),
        h("p", { class: "small muted" }, "Aim proposes; you decide. Nothing reaches your student until you approve it.")),
      nav(() => goStep(1), { label: "Let's start" }));
    case 1: return frame("Your student", "Add one now; you can add brothers and sisters later in Settings.",
      h("div", { class: "card", style: "margin-top:16px" }, studentForm(l, { compact: true, onSaved: () => goStep(2) })), nav(null));
    case 2: {
      const role = set.role || "supplement";
      const pick = r => act("hs-household-save", { settings: { role: r } }, { quiet: true });
      return frame("Aim's role, and your curriculum", "Aim plans from a curriculum you already have the right to use. It organizes it and plans the weeks; it never invents the core curriculum.",
        h("div", { class: "card", style: "margin-top:16px" }, h("h2", {}, "What should Aim do?"),
          [["supplement", "Supplement what we use", "Videos, activities and checks alongside your existing curriculum."], ["selected", "Lead some subjects", "Aim plans the subjects you choose, from your curriculum."],
            ["primary", "The whole plan", "Not offered yet: Aim's own curriculum is still being developed with educators."]].map(([v, t, d]) =>
            h("label", { class: "check" }, h("input", { type: "radio", name: "role", value: v, checked: role === v, disabled: v === "primary", onchange: () => pick(v) }), h("span", {}, h("b", {}, t), h("br"), h("span", { class: "small muted" }, d))))),
        uploadsList() ? h("div", { class: "card" }, h("h2", {}, "Added"), uploadsList()) : null,
        uploadBox(),
        nav(() => goStep(3), { label: S.home.uploads.length ? "Continue" : "Continue without a file (type it next)" }));
    }
    case 3: {
      if (!l) { goStep(1); return h("div"); }
      const has = !!l.curriculum?.draft?.subjects.length;
      return frame("The big picture", "Your curriculum, organized into subjects, units and objectives, with about how long each unit takes. Change anything. When it looks right, approve it; you can change it later, and Aim shows what a change affects.",
        !has ? h("div", { class: "card", style: "margin-top:16px" },
          S.home.uploads.length ? busyBtn("Organize my curriculum", "", () => buildFromUploads(l), { working: "Reading your curriculum… (about a minute)", attrs: { id: "build" } }) : null,
          btn("Start with empty subjects and type it in", "text", () => call("hs-curriculum-save", { learnerId: l.id, draft: { startDate: S.home.thisWeek,
            subjects: (set.subjects?.length ? set.subjects : Object.keys(l.levels)).map(name => ({ name, level: l.levels[name] || "", units: [] })) } }).then(() => reload()).then(() => window.dispatchEvent(new Event("aim:render"))))) : null,
        has ? h("div", { style: "margin-top:16px" }, h("div", { class: "note learn small" }, "Lines marked “check this” are ones Aim read from your curriculum's wording rather than stated outright. Try moving a unit above one it builds on to see how Aim warns you."),
          curriculumEditor(l, { onApproved: () => goStep(4) })) : null,
        nav(l.curriculum?.approved ? () => goStep(4) : null));
    }
    case 4: return frame("Channels you trust (optional)", "Pick a few per subject, from Aim's hand-picked suggestions or your own. Aim looks to them first for video lessons, when a video fits. Skip this and Aim asks when a week needs a decision.",
      h("div", { class: "card", style: "margin-top:16px" }, channelsEditor()), nav(() => goStep(5), { skip: true }));
    case 5: return frame("Your first week", "Look over the essentials: the lessons, the TeachBack check, the project and its materials. Edit or ask for changes, then approve the whole week.",
      h("div", { style: "margin-top:16px" }, l ? weekReview(l, S.home.thisWeek, { onApproved: () => goStep(6) }) : null), nav(weekOf(l, S.home.thisWeek)?.status === "approved" ? () => goStep(6) : null, { skip: true }));
    default: return frame(`Set up ${l?.name || "your student"}'s Chrome`, "Your student uses Aim's extension in Chrome. Today on YouTube's homepage shows the plan you approved; they check things off as they go, and you see it here.",
      h("div", { class: "card", style: "margin-top:16px" }, l ? pairBox(l) : null), nav(() => goStep(STEPS), { label: "Finish setup", skip: false }));
  }
}

// ---------- routing ----------
const ROUTES = { overview, curriculum: curriculumPage, week: weekPage, projects: projectsPage, progress: progressPage, settings: settingsPage, setup: setupPage };
function render() {
  if (!S.home) return;
  const [, route = "overview", arg] = location.hash.split("/");
  if (!S.home.learners.length && route !== "setup") { location.hash = "#/setup"; return; }
  const view = ROUTES[route] || overview;
  const y = scrollY;
  app.replaceChildren(view(arg));
  header();
  scrollTo(0, y);
}
window.addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
window.addEventListener("aim:render", render);

async function start() {
  header();
  if (!configured()) { app.replaceChildren(h("div", { class: "narrow card" }, h("h1", {}, "Not set up yet"), h("p", {}, "This copy of Aim Homeschool doesn't name a server. Fill in config.js (see docs/SETUP.md)."))); return; }
  try { await adoptLink(); } catch (e) { app.replaceChildren(signInPage(e.message)); return; }
  if (!session()) { app.replaceChildren(signInPage()); return; }
  app.replaceChildren(h("p", { class: "muted" }, "Loading…"));
  try { await reload(); }
  catch (e) {
    if (e instanceof ApiError && e.code === "auth") { await signOut(); app.replaceChildren(signInPage(e.message)); return; }
    if (e instanceof ApiError && e.code === "plan") { app.replaceChildren(h("div", { class: "narrow card" }, h("h1", {}, "Aim Homeschool isn't on for this account"),
      h("p", {}, `You're signed in as ${session()?.email}. Aim Homeschool is in a private pilot; ask Aim to turn it on for this account.`), btn("Sign out", "tonal", async () => { await signOut(); start(); }))); return; }
    app.replaceChildren(h("div", { class: "narrow card" }, h("p", {}, e.message), btn("Try again", "", start)));
    return;
  }
  if (!location.hash || location.hash === "#") location.hash = S.home.household.settings.setupDone ? "#/overview" : "#/setup";
  render();
}
start();
