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
    async createAssessment({ learnerId, topic, notes, contentType, objectives, planObjective = null }) {
      const id = randomUUID(), t = now().toISOString();
      assessments.set(id, { id, learner_id: learnerId, topic, notes, content_type: contentType, objectives, plan_objective: planObjective,
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
    async addProgress(events) { progress.push(...clone(events).map(e => ({ source: "teachback", at: now().toISOString(), ...e }))); }
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

// Aim Homeschool's storage (the HsDb interface in homeschool.ts), in memory, sharing learners and
// progress with a memDb so a student's TeachBack shows up in the parent's progress. Pass the plans
// each account has (owner id → plan) to getPlan through `plans`.
export function memHs(db, { now = () => new Date(), videos = {} } = {}) {
  const households = new Map(), docs = new Map(), uploads = new Map(), devices = new Map(), codes = new Map();
  const clone = x => JSON.parse(JSON.stringify(x));
  // A paired device's TeachBack is its learner's.
  const selfLearner = db.selfLearner;
  db.selfLearner = async accountId => devices.get(accountId)?.learnerId || selfLearner(accountId);
  const hs = {
    store: { households, docs, uploads, devices, codes },
    async household(owner) { return [...households.values()].find(h => h.owner === owner) || null; },
    async createHousehold(owner) { const h = { id: randomUUID(), owner, name: "Our family", settings: {} }; households.set(h.id, h); return clone(h); },
    async saveHousehold(id, { name, settings }) { const h = households.get(id); if (name) h.name = name; if (settings) h.settings = clone(settings); },
    async learners(hid) { return [...db.learners].filter(([, l]) => l.household_id === hid).map(([id, l]) => ({ id, name: l.name, levels: l.levels || {}, interests: l.interests || "" })); },
    async saveLearner(hid, owner, l) {
      const id = l.id || randomUUID();
      db.learners.set(id, { ...(db.learners.get(id) || { account_id: owner }), household_id: hid, name: l.name, levels: clone(l.levels), interests: l.interests });
      return id;
    },
    async removeLearner(hid, id) { if (db.learners.get(id)?.household_id === hid) db.learners.delete(id); },
    async docs(hid, kind, prefix = "") { return [...docs.values()].filter(d => d.hid === hid && d.kind === kind && d.key.startsWith(prefix)).map(d => clone({ key: d.key, data: d.data, version: d.version })); },
    async saveDoc(hid, kind, key, data, expect) {
      const k = `${hid}|${kind}|${key}`, d = docs.get(k);
      if (!expect) { if (d) return null; docs.set(k, { hid, kind, key, data: clone(data), version: 1 }); return 1; }
      if (!d || d.version !== expect) return null;
      d.data = clone(data); d.version++;
      return d.version;
    },
    async uploads(hid) { return [...uploads.values()].filter(u => u.hid === hid).map(u => ({ id: u.id, title: u.title, kind: u.kind, chars: u.text.length, createdAt: u.at })); },
    async uploadTexts(hid, ids) { return ids.map(id => uploads.get(id)).filter(u => u && u.hid === hid).map(u => ({ id: u.id, title: u.title, text: u.text })); },
    async addUpload(hid, u) { const id = randomUUID(); uploads.set(id, { ...u, id, hid, at: now().toISOString() }); return id; },
    async deleteUpload(hid, id) { if (uploads.get(id)?.hid === hid) uploads.delete(id); },
    async devices(hid) { return [...devices].filter(([, d]) => db.learners.get(d.learnerId)?.household_id === hid).map(([userId, d]) => ({ userId, learnerId: d.learnerId, pairedAt: d.at })); },
    async removeDevice(hid, userId) { if (db.learners.get(devices.get(userId)?.learnerId)?.household_id === hid) devices.delete(userId); },
    async createPairCode(learnerId, hash, expiresAt) { codes.set(hash, { learnerId, expiresAt }); },
    async consumePairCode(hash, userId, at) {
      const c = codes.get(hash);
      codes.delete(hash);
      if (!c || c.expiresAt < at || !db.learners.has(c.learnerId)) return null;
      devices.set(userId, { learnerId: c.learnerId, at: at.toISOString() });
      return c.learnerId;
    },
    async deviceOf(userId) {
      const d = devices.get(userId), l = d && db.learners.get(d.learnerId), h = l && households.get(l.household_id);
      return h ? { learnerId: d.learnerId, householdId: h.id, ownerId: h.owner } : null;
    },
    async progress(ids) {
      return db.progress.filter(e => ids.includes(e.learnerId)).map(e => ({ learnerId: e.learnerId, source: e.source || "teachback", kind: e.kind, topic: e.topic,
        objective: e.objective ?? null, planObjective: e.planObjective ?? null, planItem: e.planItem ?? null, evidence: e.evidence ?? null, at: e.at || now().toISOString() }));
    },
    async addProgress(events) { db.progress.push(...clone(events).map(e => ({ ...e, at: now().toISOString() }))); },
    async videoInfo(id) { return videos[id] || null; }
  };
  return hs;
}
