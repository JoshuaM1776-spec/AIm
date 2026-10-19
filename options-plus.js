// Aim — the Aim Plus section of Settings: sign in with a code sent by email, see the plan, sign out.
// All account work happens in the background worker (plus.js); this page only shows it.

const plus = { email: "", step: "email", busy: false };

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter(k => k != null));
  return n;
}
const plusMsg = text => ($("plusMsg").textContent = text || "");
const isPlus = st => st.plan === "plus" || st.plan === "homeschool"; // Homeschool includes Plus

// Runs an account action with the buttons disabled, and shows its error if it fails.
async function plusDo(msg) {
  plus.busy = true;
  for (const b of $("plusBody").querySelectorAll("button, input")) b.disabled = true;
  plusMsg("");
  const r = await send(msg);
  plus.busy = false;
  if (!r || r.error) {
    plusMsg(r?.error || "Something went wrong. Try again.");
    for (const b of $("plusBody").querySelectorAll("button, input")) b.disabled = false;
    return null;
  }
  return r;
}

function emailForm() {
  const input = node("input", { type: "email", id: "plusEmail", placeholder: "Email address", autocomplete: "email", value: plus.email });
  input.setAttribute("aria-label", "Email address");
  const go = node("button", { className: "btn", type: "submit", textContent: "Send sign-in email" });
  const form = node("form", { className: "form", noValidate: true }, input, go);
  form.onsubmit = async e => {
    e.preventDefault();
    const r = await plusDo({ type: "plus-send-code", email: input.value });
    if (!r) return;
    plus.email = r.email;
    plus.step = "code";
    renderPlus();
  };
  return [node("p", { className: "note", textContent: "Sign in to get AI-guided learning paths when Aim Plus launches. Aim Free stays free and keeps working the same, with or without an account." }), form, familyForm()];
}

// A student in a family using Aim Homeschool: connect this browser with the code from the parent's
// Aim page. No email or password.
function familyForm() {
  const code = node("input", { type: "text", id: "familyCode", placeholder: "Code, like ABCD-2345", autocomplete: "off", maxLength: 12 });
  code.setAttribute("aria-label", "Code from your parent's Aim page");
  const go = node("button", { className: "btn tonal", type: "submit", textContent: "Connect" });
  const form = node("form", { className: "form", hidden: true }, code, go);
  form.onsubmit = async e => {
    e.preventDefault();
    const r = await plusDo({ type: "plus-student-pair", code: code.value });
    if (r) { toast(`Connected. Hi, ${r.student}! Today's plan is on YouTube's homepage.`); renderPlus(); }
  };
  const open = node("button", { className: "btn text", type: "button", id: "familyOpen", textContent: "A student? Connect to my family" });
  open.onclick = () => { form.hidden = false; open.hidden = true; code.focus(); };
  return node("div", { style: "margin-top:12px" }, open, form);
}

function studentView(st) {
  const leave = node("button", { className: "btn tonal", type: "button", textContent: "Disconnect this browser" });
  leave.onclick = async () => { if (confirm("Disconnect this browser from your family's plan?") && await plusDo({ type: "plus-sign-out" })) { toast("Disconnected."); renderPlus(); } };
  const refresh = node("button", { className: "btn tonal", type: "button", textContent: "Check for today's plan" });
  refresh.onclick = async () => { const r = await plusDo({ type: "plus-student-refresh" }); if (r) plusMsg(r.result === "error" ? r.message : "Up to date."); renderPlus(true); };
  return [node("div", { className: "setting" }, node("div", { className: "what" }, node("b", { textContent: `Connected to ${st.student.name || "your"}'s family plan` }),
    node("span", { textContent: "Today on YouTube's homepage shows the plan your parent approved. What you finish shows up for them." }))),
    node("div", { className: "form" }, refresh, leave)];
}

function codeForm() {
  const input = node("input", { type: "text", id: "plusCode", placeholder: "Code, or paste the link", autocomplete: "one-time-code", maxLength: 2000 });
  input.setAttribute("aria-label", "Code or sign-in link from the email");
  const go = node("button", { className: "btn", type: "submit", textContent: "Sign in" });
  const back = node("button", { className: "btn tonal", type: "button", textContent: "Use a different email" });
  back.onclick = () => { plus.step = "email"; plusMsg(""); renderPlus(); };
  const resend = node("button", { className: "btn tonal", type: "button", textContent: "Send a new email" });
  resend.onclick = async () => { if (await plusDo({ type: "plus-send-code", email: plus.email })) { plusMsg("Sent. Check your email."); renderPlus(true); } };
  const form = node("form", { className: "form" }, input, go, back, resend);
  form.onsubmit = async e => {
    e.preventDefault();
    if (!(await plusDo({ type: "plus-verify", email: plus.email, code: input.value }))) return;
    plus.step = "email";
    toast("Signed in.");
    renderPlus();
  };
  setTimeout(() => input.focus());
  return [node("p", { className: "note", textContent: `We sent an email to ${plus.email}. It may take a minute to arrive. ` +
    "Open it on this computer and click the sign-in link, or enter the code it shows. If the link opens in another browser, copy the link instead (right-click → Copy Link) and paste it here." }), form];
}

function accountView(st) {
  const planName = st.plan === "homeschool" ? "Aim Homeschool" : isPlus(st) ? "Aim Plus" : "Aim Free";
  const lines = [node("div", { className: "setting" },
    node("div", { className: "what" }, node("b", { textContent: st.email || "Signed in" }),
      node("span", { textContent: st.offline ? "Couldn't reach Aim's server just now." : `Plan: ${planName}` })))];
  // The subscription: renewing, ending, or a card to fix; or the way to subscribe.
  const b = st.billing;
  const day = iso => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  if (isPlus(st) && b?.manage) {
    const when = b.renewsAt ? (b.cancelAtPeriodEnd ? `Ends ${day(b.renewsAt)}. You can turn renewal back on until then.` : `Renews ${day(b.renewsAt)}.`) : "Active.";
    lines.push(node("div", { className: "setting" }, node("div", { className: "what" }, node("b", { textContent: "Subscription" }),
      node("span", { textContent: b.status === "past_due" ? "Payment didn't go through. Update your card to keep Aim Plus." : when }))));
  }
  if (!isPlus(st) && b?.available) {
    lines.push(node("div", { className: "note" },
      node("b", { textContent: "Aim Plus" }),
      node("div", { textContent: "Study sessions built from your syllabus, TeachBack checks, Put it to work, Pathways, and the librarian with a bigger daily allowance." })));
  }
  if (isPlus(st) && st.usage && st.limits) {
    lines.push(node("div", { className: "setting" }, node("div", { className: "what" }, node("b", { textContent: "AI use, last 24 hours" }),
      node("span", { textContent: `${st.usage.calls} of ${st.limits.dayCalls} requests` }))));
  }
  const buttons = node("div", { className: "form" });
  const tour = node("button", { className: "btn tonal", type: "button", textContent: isPlus(st) ? "Everything in Plus" : "What's in Plus" });
  tour.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("plus.html") });
  if (!isPlus(st) && b?.available) {
    const up = node("button", { className: "btn accent", type: "button", textContent: "Upgrade to Plus" });
    up.onclick = async () => { if (await plusDo({ type: "plus-subscribe" })) plusMsg("Stripe's secure checkout opened in a new tab. When you're done, come back here."); };
    buttons.append(up);
  }
  if (b?.manage) {
    const mg = node("button", { className: "btn tonal", type: "button", textContent: "Manage subscription" });
    mg.onclick = () => plusDo({ type: "plus-manage" });
    buttons.append(mg);
  }
  if (isPlus(st)) {
    const tb = node("button", { className: "btn", type: "button", textContent: "Test my understanding" });
    tb.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("teachback.html") });
    buttons.append(tb);
    const pw = node("button", { className: "btn tonal", type: "button", textContent: "Pathways" });
    pw.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("pathways.html") });
    buttons.append(pw);
    const check = node("button", { className: "btn tonal", type: "button", textContent: "Check connection" });
    check.onclick = async () => {
      const r = await plusDo({ type: "plus-check" });
      if (r) { plusMsg("Connected. Aim's AI is ready."); renderPlus(true); }
    };
    buttons.append(check);
  }
  buttons.append(tour);
  const out = node("button", { className: "btn tonal", type: "button", textContent: "Sign out" });
  out.onclick = async () => { if (await plusDo({ type: "plus-sign-out" })) { toast("Signed out."); renderPlus(); } };
  buttons.append(out);
  return [...lines, ...(isPlus(st) && st.sync?.available ? [syncView(st.sync)] : []), buttons, yourData()];
}

// Sync across devices: off until turned on here. Says what it carries and when it last ran.
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(ts).toLocaleDateString();
}
function syncView(sy) {
  const sw = node("input", { type: "checkbox", id: "plusSync", checked: !!sy.on });
  sw.setAttribute("aria-label", "Sync across devices");
  sw.onchange = async () => {
    const r = await plusDo({ type: "plus-sync-set", on: sw.checked });
    if (r?.result === "error") plusMsg(r.message);
    else if (r) plusMsg(sw.checked ? "Synced. Turn it on in your other browsers too." : "Sync is off. What's already synced stays on Aim's server until you remove it.");
    renderPlus(true);
  };
  const state = sy.on ? (sy.error ? `Last try didn't work: ${sy.error}` : sy.lastAt ? `Last synced ${ago(sy.lastAt)}.` : "Syncing…") : "";
  const box = node("div", { className: "setting", style: "display:block" },
    node("div", { className: "setting", style: "padding:0;border:0" },
      node("div", { className: "what" }, node("b", { textContent: "Sync across devices" }),
        node("span", { textContent: "Your Targets, study sessions and learning record, Saved for later, settings and channel rules, in every browser where you sign in. Kept on Aim's server with your account. Time spent per day stays in each browser." })),
      node("label", { className: "switch" }, sw, node("i"))));
  if (state) box.append(node("p", { className: "note", id: "plusSyncState", textContent: state }));
  const row = node("div", { className: "form" });
  if (sy.on) {
    const now = node("button", { className: "btn tonal", type: "button", id: "plusSyncNow", textContent: "Sync now" });
    now.onclick = async () => { const r = await plusDo({ type: "plus-sync-now" }); if (r) { plusMsg(r.result === "error" ? r.message : "Synced."); renderPlus(true); } };
    row.append(now);
  }
  const erase = node("button", { className: "btn text", type: "button", id: "plusSyncErase", textContent: "Remove synced copy from Aim's server" });
  erase.onclick = async () => { if (await plusDo({ type: "plus-sync-erase" })) { plusMsg("Removed from Aim's server, and sync is off. Everything in this browser stays."); renderPlus(true); } };
  row.append(erase);
  box.append(row);
  return box;
}

// Your data: download all of it, or delete the account. Deleting asks you to type DELETE.
function yourData() {
  const download = node("button", { className: "btn tonal", type: "button", id: "plusExport", textContent: "Download my data" });
  download.onclick = async () => {
    const r = await plusDo({ type: "plus-export" });
    if (!r) return;
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
    const a = node("a", { href: URL.createObjectURL(blob), download: `aim-data-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    plusMsg("Downloaded. The file has your account, AI use, TeachBack sessions and progress, and Aim's data in this browser.");
    renderPlus(true);
  };
  const del = node("button", { className: "btn text danger", type: "button", id: "plusDelete", textContent: "Delete account…" });
  const confirmBox = node("div", { className: "confirm", hidden: true });
  const typed = node("input", { type: "text", id: "plusDeleteConfirm", placeholder: "Type DELETE", autocomplete: "off" });
  typed.setAttribute("aria-label", "Type DELETE to confirm");
  const really = node("button", { className: "btn", type: "button", id: "plusDeleteGo", textContent: "Delete my account", disabled: true });
  typed.oninput = () => { really.disabled = typed.value.trim() !== "DELETE"; };
  really.onclick = async () => {
    if (!(await plusDo({ type: "plus-delete", confirm: typed.value.trim() }))) return;
    plus.step = "email";
    toast("Your account and its data on Aim's server are deleted.");
    renderPlus();
  };
  const cancel = node("button", { className: "btn text", type: "button", textContent: "Cancel" });
  cancel.onclick = () => { confirmBox.hidden = true; typed.value = ""; really.disabled = true; };
  del.onclick = () => { confirmBox.hidden = false; setTimeout(() => typed.focus()); };
  confirmBox.append(
    node("p", { className: "note", textContent: "This permanently deletes your Aim account and everything stored with it on Aim's server: your plan, AI use, TeachBack sessions and progress. Aim's data in this browser (Targets, history, settings) stays. It can't be undone." }),
    node("div", { className: "form" }, typed, really, cancel));
  return node("div", { className: "setting", style: "display:block" },
    node("div", { className: "what" }, node("b", { textContent: "Your data" }),
      node("span", { textContent: "Download everything Aim has stored for you, or delete your account." })),
    node("div", { className: "form", style: "margin-top:8px" }, download, del),
    confirmBox);
}

// keepMsg leaves the last message in place (for "Connected." and "Sent.").
async function renderPlus(keepMsg = false) {
  const st = await send({ type: "plus-status" });
  if (!st || !st.configured) { $("plus").hidden = true; return; }
  $("plus").hidden = false;
  if (!keepMsg) plusMsg(st.error && !st.signedIn ? st.error : "");
  plus.signedIn = !!st.signedIn;
  if (st.signedIn) plus.step = "email"; // signing out later starts from the email form
  const body = st.student ? studentView(st) : st.signedIn ? accountView(st) : plus.step === "code" ? codeForm() : emailForm();
  $("plusBody").replaceChildren(...body);
}

renderPlus();
// Signing in from the emailed link, or subscribing on Stripe, happens in another tab; catch up when
// this one is looked at again.
window.addEventListener("focus", () => { if ((plus.step === "code" || plus.signedIn) && !plus.busy) renderPlus(true); });
