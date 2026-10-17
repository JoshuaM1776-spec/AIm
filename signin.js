// Aim — where the sign-in link from the email lands. Hands the session to the background worker,
// which checks it belongs to the sign-in started in Settings, then clears it from the address bar.
const BRAND = chrome.runtime.getManifest().name;
const $ = id => document.getElementById(id);
const { search, hash } = location;
history.replaceState(null, "", location.pathname); // don't leave tokens in the address bar or history
$("settings").onclick = () => chrome.runtime.openOptionsPage();

chrome.runtime.sendMessage({ type: "plus-adopt", search, hash }).catch(() => null).then(r => {
  $("settings").hidden = false;
  if (r && !r.error) {
    document.title = "Signed in";
    $("title").textContent = "You're signed in";
    $("detail").textContent = `${BRAND} Plus is ready${r.email ? ` for ${r.email}` : ""}. You can close this tab.`;
  } else {
    document.title = "Sign-in didn't work";
    $("title").textContent = "Sign-in didn't work";
    $("detail").textContent = r?.error || "Something went wrong. Send a new link from Settings.";
  }
});
