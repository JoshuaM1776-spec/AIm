// Copies what the parent website (web/) shares with the extension into web/shared/: Aim's colors
// and fonts, the mark, Learn something's channel list (the suggested channels per subject) and the
// file reader (curriculum uploads are read in the parent's browser). tests/web.test.mjs checks the
// copies are current. Run: node tools/build-web.mjs
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const SHARED = [["tokens.css", "tokens.css"], ["fonts/Inter-Regular.woff2", "fonts/Inter-Regular.woff2"], ["fonts/Inter-Medium.woff2", "fonts/Inter-Medium.woff2"],
  ["fonts/InterDisplay-SemiBold.woff2", "fonts/InterDisplay-SemiBold.woff2"], ["fonts/InterDisplay-Bold.woff2", "fonts/InterDisplay-Bold.woff2"], ["fonts/OFL.txt", "fonts/OFL.txt"],
  ["icons/mark.svg", "mark.svg"], ["icons/128.png", "icon.png"], ["content/topics.js", "topics.js"], ["content/filetext.js", "filetext.js"]];
export const stale = () => SHARED.filter(([from, to]) => { try { return !readFileSync(root + from).equals(readFileSync(root + "web/shared/" + to)); } catch { return true; } }).map(([, to]) => to);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(root + "web/shared/fonts", { recursive: true });
  for (const [from, to] of SHARED) copyFileSync(root + from, root + "web/shared/" + to);
  console.log(`Copied ${SHARED.length} files into web/shared/.`);
}
