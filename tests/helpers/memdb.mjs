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
