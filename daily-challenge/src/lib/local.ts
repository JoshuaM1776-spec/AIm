// Small, safe wrappers around localStorage. Storage can be missing or full (private windows,
// blocked site data), so every access is guarded and the app keeps working without it.
import type { Difficulty } from "./types.ts";

export function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

// A visitor who isn't signed in can explore and write; their work lives on this device until they sign in.
export interface GuestAttempt {
  number: number;
  difficulty: Difficulty;
  card_position: number;
  briefing_done: boolean;
  draft: string;
  draft_saved_at: string | null;
  started_at: string;
}

const guestKey = (n: number) => `dc.guest.${n}`;
export const guest = {
  get: (n: number) => readLocal<GuestAttempt>(guestKey(n)),
  set: (a: GuestAttempt) => writeLocal(guestKey(a.number), a),
  clear: (n: number) => removeLocal(guestKey(n)),
  all(): GuestAttempt[] {
    const out: GuestAttempt[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("dc.guest.")) {
          const a = readLocal<GuestAttempt>(k);
          if (a) out.push(a);
        }
      }
    } catch {
      /* storage unavailable */
    }
    return out;
  },
};

// A copy of every keystroke's text, so nothing is lost if the network drops or the tab closes
// before the server has the latest version.
export interface DraftBackup { body: string; saved_at: string }
const backupKey = (scope: string, kind: string) => `dc.draft.${scope}.${kind}`;
export const backup = {
  get: (scope: string, kind: string) => readLocal<DraftBackup>(backupKey(scope, kind)),
  set: (scope: string, kind: string, body: string) => writeLocal(backupKey(scope, kind), { body, saved_at: new Date().toISOString() }),
  clear: (scope: string, kind: string) => removeLocal(backupKey(scope, kind)),
};
