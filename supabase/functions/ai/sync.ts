// Aim Plus sync: the server's half. Each browser sends what changed on it and gets back what other
// browsers changed (see sync.js in the extension, and migration 0004). No AI. The newest change to
// an item wins; the database decides that, so two browsers syncing at once can't undo each other.

export const SYNC_KINDS = ["target", "saved", "settings", "avoid"] as const;
export interface SyncItem { kind: string; id: string; rev: number; data: unknown }
export interface SyncStore {
  apply(userId: string, device: string, since: number, items: SyncItem[]): Promise<{ items: SyncItem[]; cursor: number; more: boolean }>;
  erase(userId: string): Promise<void>; // "Stop syncing and remove the copy on Aim's server"
}

export const SYNC_LIMITS = { items: 100, itemBytes: 64 * 1024 };

export class SyncError extends Error {}

// What a browser may send: a few kinds of item, each a plain object (or null, deleted), none huge.
export function readSyncInput(input: unknown, now: number): { device: string; since: number; items: SyncItem[] } {
  const i = (input || {}) as Record<string, unknown>;
  const device = typeof i.device === "string" && /^[\w-]{8,64}$/.test(i.device) ? i.device : "";
  if (!device) throw new SyncError("Missing device.");
  const since = Number.isSafeInteger(i.since) && (i.since as number) >= 0 ? i.since as number : 0;
  const raw = i.items === undefined ? [] : i.items;
  if (!Array.isArray(raw) || raw.length > SYNC_LIMITS.items) throw new SyncError("Too many items.");
  const items = raw.map((x: Record<string, unknown>) => {
    if (!x || !(SYNC_KINDS as readonly string[]).includes(x.kind as string)) throw new SyncError("Unknown item kind.");
    if (typeof x.id !== "string" || !/^[\w-]{1,64}$/.test(x.id)) throw new SyncError("Bad item id.");
    // A browser's clock can be wrong, but not by more than a day into the future.
    if (!Number.isSafeInteger(x.rev) || (x.rev as number) <= 0 || (x.rev as number) > now + 864e5) throw new SyncError("Bad item time.");
    const data = x.data ?? null;
    if (data !== null && (typeof data !== "object" || Array.isArray(data))) throw new SyncError("Bad item.");
    if (new TextEncoder().encode(JSON.stringify(data)).length > SYNC_LIMITS.itemBytes) throw new SyncError("An item is too large.");
    return { kind: x.kind as string, id: x.id, rev: x.rev as number, data };
  });
  return { device, since, items };
}
