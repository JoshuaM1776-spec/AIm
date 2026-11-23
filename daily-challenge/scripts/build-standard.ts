// Copies docs/challenge-standard.md (the Challenge Creation & Quality Standard) into the drafting
// service, which uses it as its instructions. Run after editing the standard: npm run standard:build
import { readFileSync, writeFileSync } from "node:fs";

const text = readFileSync(new URL("../docs/challenge-standard.md", import.meta.url), "utf8");
writeFileSync(new URL("../supabase/functions/_shared/generation/standard.ts", import.meta.url),
  `// Generated from docs/challenge-standard.md by scripts/build-standard.ts. Edit the Markdown, then: npm run standard:build\nexport const CHALLENGE_STANDARD = ${JSON.stringify(text)};\n`);
console.log("Wrote supabase/functions/_shared/generation/standard.ts");
