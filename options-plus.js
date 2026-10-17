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
  const go = node("button", { className: "btn", type: "submit", textContent: "Send code" });
  const form = node("form", { className: "form", noValidate: true }, input, go);
  form.onsubmit = async e => {
    e.preventDefault();
    const r = await plusDo({ type: "plus-send-code", email: input.value });
    if (!r) return;
    plus.email = r.email;
    plus.step = "code";
    renderPlus();
  };
  return [node("p", { className: "note", textContent: "Sign in to get AI-guided learning paths when Aim Plus launches. Aim Free stays free and keeps working the same, with or without an account." }), form];
}

function codeForm() {
  const input = node("input", { type: "text", id: "plusCode", className: "code", placeholder: "Code", inputMode: "numeric", autocomplete: "one-time-code", maxLength: 10 });
  input.setAttribute("aria-label", "Code from the email");
  const go = node("button", { className: "btn", type: "submit", textContent: "Sign in" });
  const back = node("button", { className: "btn tonal", type: "button", textContent: "Use a different email" });
  back.onclick = () => { plus.step = "email"; plusMsg(""); renderPlus(); };
  const resend = node("button", { className: "btn tonal", type: "button", textContent: "Send a new code" });
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
  return [node("p", { className: "note", textContent: `Enter the code we sent to ${plus.email}. It may take a minute to arrive.` }), form];
}

function accountView(st) {
  const planName = st.plan === "plus" ? "Aim Plus" : "Aim Free";
  const lines = [node("div", { className: "row" },
    node("div", { className: "what" }, node("b", { textContent: st.email || "Signed in" }),
      node("span", { textContent: st.offline ? "Couldn't reach Aim's server just now." : `Plan: ${planName}` })))];
  if (st.plan === "plus" && st.usage && st.limits) {
    lines.push(node("div", { className: "row" }, node("div", { className: "what" }, node("b", { textContent: "AI use, last 24 hours" }),
      node("span", { textContent: `${st.usage.calls} of ${st.limits.dayCalls} requests` }))));
  }
  const buttons = node("div", { className: "form" });
  if (st.plan === "plus") {
    const tb = node("button", { className: "btn", type: "button", textContent: "Test my understanding" });
    tb.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("teachback.html") });
    buttons.append(tb);
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
  return [...lines, buttons];
}

// keepMsg leaves the last message in place (for "Connected." and "Sent.").
async function renderPlus(keepMsg = false) {
  const st = await send({ type: "plus-status" });
  if (!st || !st.configured) { $("plus").hidden = true; return; }
  $("plus").hidden = false;
  if (!keepMsg) plusMsg(st.error && !st.signedIn ? st.error : "");
  const body = st.signedIn ? accountView(st) : plus.step === "code" ? codeForm() : emailForm();
  $("plusBody").replaceChildren(...body);
}

renderPlus();
