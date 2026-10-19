// In-memory stand-in for TeachBack's tables (the TeachbackDb interface in teachback.ts), for tests.
import { randomUUID } from "node:crypto";

export function memDb(now = () => new Date()) {
  const learners = new Map(), assessments = new Map(), turns = new Map(), progress = [];
  const clone = x => JSON.parse(JSON.stringify(x));
  const touch = id => { assessments.get(id).updated_at = now().toISOString(); };
  return {
    learners, assessments, turns, progress,
    async selfLearner(accountId) {
      for (const [id, l] of learners) if (l.account_id === accountId) return id;
      const id = randomUUID();
      learners.set(id, { account_id: accountId });
      return id;
    },
    async createAssessment({ learnerId, topic, notes, contentType, objectives }) {
      const id = randomUUID(), t = now().toISOString();
      assessments.set(id, { id, learner_id: learnerId, topic, notes, content_type: contentType, objectives,
        status: "active", result: null, created_at: t, updated_at: t });
      turns.set(id, []);
      return id;
    },
    async getAssessment(id) {
      const a = assessments.get(id);
      if (!a) return null;
      return { assessment: clone(a), accountId: learners.get(a.learner_id).account_id, turns: clone(turns.get(id)) };
    },
    async addTurn(id, t) {
      turns.get(id).push({ status: "asked", answer: null, hints: 0, evaluation: null, ...t });
      touch(id);
    },
    async updateTurn(id, seq, patch) {
      Object.assign(turns.get(id).find(t => t.seq === seq), clone(patch));
      touch(id);
    },
    async updateAssessment(id, { status, result }) {
      const a = assessments.get(id);
      if (status) a.status = status;
      if (result) a.result = clone(result);
      touch(id);
    },
    async addProgress(events) { progress.push(...clone(events)); }
  };
}

// Sync's storage, in memory, with the same rules as sync_apply (migration 0004): an item is stored
// only if newer; a browser gets back what others wrote since its cursor, oldest first, a page at a time.
const cloneJson = x => JSON.parse(JSON.stringify(x));
export function memSync(limit = 300) {
  const rows = new Map(); // `${user}|${kind}|${id}` -> row
  let seq = 0;
  return {
    rows,
    async apply(user, device, since, items) {
      for (const it of items) {
        const k = `${user}|${it.kind}|${it.id}`, old = rows.get(k);
        if (!old || old.rev < it.rev) rows.set(k, { user, kind: it.kind, id: it.id, rev: it.rev, data: cloneJson(it.data ?? null), device, seq: ++seq });
      }
      const mine = [...rows.values()].filter(r => r.user === user);
      const changed = mine.filter(r => r.seq > since && r.device !== device).sort((a, b) => a.seq - b.seq).slice(0, limit);
      const more = changed.length >= limit;
      const cursor = more ? changed.at(-1).seq : Math.max(since, ...mine.map(r => r.seq));
      return { items: changed.map(r => ({ kind: r.kind, id: r.id, rev: r.rev, data: cloneJson(r.data) })), cursor, more };
    },
    async erase(user) { for (const [k, r] of rows) if (r.user === user) rows.delete(k); }
  };
}
