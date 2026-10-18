// Aim — the Aim Plus section of Settings: sign in with a code sent by email, see the plan, sign out.
// All account work happens in the background worker (plus.js); this page only shows it.

const plus = { email: "", step: "email", busy: false };

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter(k => k != null));
  return n;
}
const plusMsg = text => ($("plusMsg").textContent = text || "");

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
// Signing in from the emailed link happens in another tab; catch up when this one is looked at again.
window.addEventListener("focus", () => { if (plus.step === "code" && !plus.busy) renderPlus(true); });
  };
  return [node("p", { className: "note", textContent: "Sign in to get AI-guided learning paths when Aim Plus launches. Aim Free stays free and keeps working the same, with or without an account." }), form];
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
// Signing in from the emailed link happens in another tab; catch up when this one is looked at again.
window.addEventListener("focus", () => { if (plus.step === "code" && !plus.busy) renderPlus(true); });
  };
  setTimeout(() => input.focus());
  return [node("p", { className: "note", textContent: `We sent an email to ${plus.email}. It may take a minute to arrive. ` +
    "Open it on this computer and click the sign-in link, or enter the code it shows. If the link opens in another browser, copy the link instead (right-click → Copy Link) and paste it here." }), form];
}

function accountView(st) {
  const planName = st.plan === "plus" ? "Aim Plus" : "Aim Free";
  const lines = [node("div", { className: "setting" },
    node("div", { className: "what" }, node("b", { textContent: st.email || "Signed in" }),
      node("span", { textContent: st.offline ? "Couldn't reach Aim's server just now." : `Plan: ${planName}` })))];
  if (st.plan === "plus" && st.usage && st.limits) {
    lines.push(node("div", { className: "setting" }, node("div", { className: "what" }, node("b", { textContent: "AI use, last 24 hours" }),
      node("span", { textContent: `${st.usage.calls} of ${st.limits.dayCalls} requests` }))));
  }
  const buttons = node("div", { className: "form" });
  if (st.plan === "plus") {
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
  const out = node("button", { className: "btn tonal", type: "button", textContent: "Sign out" });
  out.onclick = async () => { if (await plusDo({ type: "plus-sign-out" })) { toast("Signed out."); renderPlus(); } };
  buttons.append(out);
  return [...lines, buttons, yourData()];
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
  if (st.signedIn) plus.step = "email"; // signing out later starts from the email form
  const body = st.signedIn ? accountView(st) : plus.step === "code" ? codeForm() : emailForm();
  $("plusBody").replaceChildren(...body);
}

renderPlus();
// Signing in from the emailed link happens in another tab; catch up when this one is looked at again.
window.addEventListener("focus", () => { if (plus.step === "code" && !plus.busy) renderPlus(true); });
