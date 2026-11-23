import { CircleCheck, CircleX, Eye, Plus, Sparkles, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CONSTRAINT_ICONS } from "../../components/icons.tsx";
import { Button, ButtonLink, Card, cx, ErrorNote, Field, inputClass, Notice, Page, Spinner, TopBar } from "../../components/ui.tsx";
import { ILLUSTRATIONS, Illustration } from "../../illustrations/index.tsx";
import { api, ApiError } from "../../lib/api.ts";
import { DIFFICULTY_LABEL, EDITORIAL_LABEL, formatDate, paragraphs, SCENARIO_LABEL, TASK_HEADING, TYPE_LABEL, WORTH_IT } from "../../lib/text.ts";
import {
  type AdminResponse, type CardKind, type ChallengeAdmin, type ChallengeType, type Difficulty, type EditorialStatus, type ImageRef,
  QUALITY_CRITERIA, type Quality, type QualityCriterion, type Reference, type ScenarioKind,
} from "../../lib/types.ts";

const KINDS: CardKind[] = ["role", "situation", "constraints", "investigation", "decision"];
const CARD_LABEL: Record<CardKind, string> = { role: "1 · Your Role", situation: "2 · The Situation", constraints: "3 · The Constraints", investigation: "4 · Your Investigation", decision: "5 · The Task" };
const LEVELS: Difficulty[] = ["easy", "moderate", "hard"];

const CRITERION_LABEL: Record<QualityCriterion, [string, string]> = {
  intrigue: ["Intrigue", "Does it create genuine curiosity?"],
  responsibility: ["Responsibility", "Does the user's role matter?"],
  research_depth: ["Research depth", "Is independent investigation necessary?"],
  integration: ["Interdisciplinary integration", "Do multiple fields meaningfully interact?"],
  reasoning: ["Reasoning quality", "Does it require genuine analysis and judgement?"],
  researchability: ["Researchability", "Can users realistically find useful evidence?"],
  clarity: ["Clarity", "Is the problem understandable and well defined?"],
  articulation: ["Articulation potential", "Can users develop a meaningful written response?"],
};

type Question = { text: string; priority: "essential" | "exploratory" };
type Doc = {
  id?: string; number: number; slug: string; title: string; summary: string; subjects: string[];
  challenge_type: ChallengeType; research_minutes: number | null; scenario_kind: ScenarioKind; scenario_note: string;
  role: { title: string; body: string }; situation: string; final_task: string; expectations: Record<Difficulty, string>;
  cards: { kind: CardKind; image: ImageRef | null; direction: string }[];
  constraints: { label: string; detail: string; icon: string }[];
  investigation: { title: string; questions: Question[] }[];
  reference: Reference;
  quality: Quality;
};

const blankReference = (): Reference => ({
  background: "", core_knowledge: "", uncertainties: "", investigation_map: "", approaches: [{ title: "", summary: "" }],
  critical_reasoning: "", misconceptions: [], evidence_expectations: "", difficulty_guide: {}, fairness_notes: "", evaluator_notes: "", sources: [],
});

const blank = (): Doc => ({
  number: 0, slug: "", title: "", summary: "", subjects: [], challenge_type: "decide", research_minutes: 45,
  scenario_kind: "fictional", scenario_note: "", role: { title: "", body: "" }, situation: "", final_task: "",
  expectations: {
    easy: "Identify a plausible approach, explain the basic reasoning, and recognise at least one limitation.",
    moderate: "Compare meaningful alternatives, support your recommendation with evidence, and consider the important trade-offs.",
    hard: "Integrate knowledge across fields, examine assumptions and uncertainty, consider second-order consequences, and answer credible objections.",
  },
  cards: KINDS.map(kind => ({ kind, image: null, direction: "" })),
  constraints: [{ label: "", detail: "", icon: "coins" }, { label: "", detail: "", icon: "hourglass" }, { label: "", detail: "", icon: "scale" }],
  investigation: [0, 1, 2].map(() => ({ title: "", questions: [{ text: "", priority: "essential" as const }] })),
  reference: blankReference(),
  quality: { scores: {}, weaknesses: "", assessed_by: "editor" },
});

const fromAdmin = (c: ChallengeAdmin): Doc => ({
  id: c.id, number: c.number, slug: c.slug, title: c.title, summary: c.summary, subjects: c.subjects,
  challenge_type: c.challenge_type, research_minutes: c.research_minutes, scenario_kind: c.scenario_kind, scenario_note: c.scenario_note,
  role: c.role, situation: c.situation, final_task: c.final_task, expectations: c.expectations,
  cards: KINDS.map(kind => ({ kind, image: c.cards.find(k => k.kind === kind)?.image ?? null, direction: c.card_directions?.[kind] ?? "" })),
  constraints: c.constraints,
  investigation: c.investigation.map((a, i) => ({ title: a.title, questions: a.questions.map((text, j) => ({ text, priority: c.question_priorities?.[i]?.[j] ?? "essential" })) })),
  reference: { ...blankReference(), ...(c.reference ?? {}) },
  quality: c.quality ?? { scores: {}, weaknesses: "", assessed_by: "editor" },
});

const slugify = (t: string) => t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const qualityTotal = (q: Quality) => QUALITY_CRITERIA.reduce((n, k) => n + (q.scores[k] ?? 0), 0);

function Section({ title, children, hint, id }: { title: string; children: ReactNode; hint?: string; id?: string }) {
  return (
    <Card as="section" className="space-y-4 px-4 py-4">
      <div id={id}>
        <h2 className="text-[1.35rem]">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function Text({ label, value, onChange, rows, hint, max }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; max?: number }) {
  return (
    <Field label={label} hint={hint}>
      {id => rows
        ? <textarea id={id} rows={rows} maxLength={max} className={inputClass} value={value} onChange={e => onChange(e.target.value)} />
        : <input id={id} maxLength={max} className={inputClass} value={value} onChange={e => onChange(e.target.value)} />}
    </Field>
  );
}

function Remove({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} aria-label={label} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-paper-deep hover:text-danger"><Trash2 size={16} /></button>;
}

function StatusChip({ status }: { status: EditorialStatus }) {
  const style = { approved: "border-ok/40 text-ok", needs_revision: "border-bronze-soft text-bronze", rejected: "border-danger/40 text-danger", pending_verification: "border-bronze-soft text-bronze" }[status];
  return <span className={cx("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold", style)}>{EDITORIAL_LABEL[status]}</span>;
}

function ImagePicker({ value, onChange, kind, direction, onDirection }: {
  value: ImageRef | null; onChange: (v: ImageRef | null) => void; kind: CardKind; direction: string; onDirection: (v: string) => void;
}) {
  const mode = value?.src !== undefined ? "url" : value?.key ? "key" : "none";
  return (
    <div className="space-y-2 rounded-xl border border-line-soft p-3">
      <p className="text-sm font-semibold text-ink">{CARD_LABEL[kind]}</p>
      <textarea aria-label={`Image direction for ${CARD_LABEL[kind]}`} rows={2} maxLength={600} className={`${inputClass} text-sm`}
        placeholder="Image direction: what the picture should show" value={direction} onChange={e => onDirection(e.target.value)} />
      <select aria-label={`Picture for ${CARD_LABEL[kind]}`} className={inputClass}
        value={mode === "key" ? value!.key : mode === "url" ? "__url" : ""}
        onChange={e => {
          const v = e.target.value;
          if (!v) onChange(null);
          else if (v === "__url") onChange({ src: "", alt: value?.alt ?? "" });
          else onChange({ key: v, alt: value?.alt ?? "" });
        }}>
        <option value="">No picture</option>
        {Object.entries(ILLUSTRATIONS).map(([k, i]) => <option key={k} value={k}>{i.name}</option>)}
        <option value="__url">Image from a URL…</option>
      </select>
      {mode === "url" && <input aria-label="Image URL (https)" placeholder="https://…" className={inputClass} value={value!.src ?? ""} onChange={e => onChange({ ...value!, src: e.target.value })} />}
      {mode !== "none" && (
        <>
          <input aria-label="Description of the picture (alt text)" placeholder="Describe the picture for screen readers" className={inputClass} value={value!.alt} onChange={e => onChange({ ...value!, alt: e.target.value })} />
          {mode === "url" && <input aria-label="Credit" placeholder="Credit / licence" className={inputClass} value={value!.credit ?? ""} onChange={e => onChange({ ...value!, credit: e.target.value })} />}
          <Illustration image={value} className="aspect-[400/260] w-40 overflow-hidden rounded-lg border border-line" />
        </>
      )}
    </div>
  );
}

function FeedbackSummary({ c }: { c: ChallengeAdmin }) {
  const total = c.feedback?.count ?? 0;
  return (
    <Section title="Was this challenge worth their time?" hint="Answers from people who completed it. Private to editors.">
      {total === 0 ? <p className="text-sm text-muted">No answers yet.</p> : (
        <ul className="space-y-1.5">
          {WORTH_IT.map(o => {
            const n = c.feedback.ratings[String(o.rating) as "1" | "2" | "3" | "4"] ?? 0;
            return (
              <li key={o.rating} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="text-ink">{o.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-bronze-wash"><span className="block h-full rounded-full bg-bronze" style={{ width: `${(n / total) * 100}%` }} /></span>
                <span className="text-right tabular-nums text-muted">{n}</span>
              </li>
            );
          })}
        </ul>
      )}
      {c.feedback_comments.length > 0 && (
        <ul className="space-y-2 text-sm">
          {c.feedback_comments.slice(0, 20).map((f, i) => (
            <li key={i} className="rounded-lg bg-paper-deep/60 px-3 py-2">“{f.comment}” <span className="text-xs text-muted">· {WORTH_IT.find(o => o.rating === f.rating)?.label}</span></li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Responses({ id }: { id: string }) {
  const [items, setItems] = useState<AdminResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      setItems(await api.admin.responses(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load responses.");
    }
  };
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = async (r: AdminResponse, patch: Parameters<typeof api.admin.updateResponse>[1]) => {
    try {
      await api.admin.updateResponse(r.id, patch);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't update.");
    }
  };
  return (
    <Section title="Community responses" hint="Curate Selected Approaches for intellectual diversity, not scores. Hide abusive responses.">
      {error && <ErrorNote message={error} />}
      {!items && !error && <Spinner />}
      {items?.length === 0 && <p className="text-sm text-muted">No responses yet.</p>}
      <ul className="space-y-3">
        {items?.map(r => (
          <li key={r.id} className={cx("rounded-xl border p-3 text-sm", r.hidden ? "border-danger/30 bg-danger-wash/40" : "border-line-soft")}>
            <p className="font-semibold text-ink">{r.title || "Untitled"} <span className="font-normal text-muted">· {r.is_sample ? "Sample" : r.display_name} · {formatDate(r.created_at)}</span></p>
            <details className="mt-1">
              <summary className="cursor-pointer text-bronze">Read</summary>
              <div className="mt-1 space-y-2">{paragraphs(r.body).map((p, i) => <p key={i} className="prose-response">{p}</p>)}</div>
            </details>
            {r.reports.length > 0 && (
              <ul className="mt-1 text-xs text-danger">{r.reports.map((rp, i) => <li key={i}>Reported: {rp.reason.replace("_", " ")} ({rp.status}){rp.details ? `: ${rp.details}` : ""}</li>)}</ul>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input aria-label="Selected approach label" placeholder="Selected label, e.g. The Conservation Plan" defaultValue={r.selected_label ?? ""} className={`${inputClass} max-w-64 py-1.5 text-sm`}
                onBlur={e => { const v = e.target.value.trim(); if (v !== (r.selected_label ?? "")) void update(r, v ? { selected_label: v, selected_position: r.selected_position ?? 9 } : { clear_selection: true }); }} />
              <Button variant="ghost" onClick={() => update(r, { hidden: !r.hidden })}>{r.hidden ? "Restore" : "Hide"}</Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CircleCheck size={17} className="mt-0.5 shrink-0 text-ok" aria-label="Done" /> : <CircleX size={17} className="mt-0.5 shrink-0 text-danger" aria-label="Not yet" />}
      <span>{children}</span>
    </li>
  );
}

export default function AdminEdit() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc | null>(isNew ? blank() : null);
  const [saved, setSaved] = useState<ChallengeAdmin | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (isNew) { setDoc(blank()); setSaved(null); return; }
    api.admin.get(id!).then(c => { setSaved(c); setDoc(fromAdmin(c)); setDate(c.release_date ?? ""); })
      .catch(e => setLoadError(e instanceof ApiError ? e.message : "Couldn't load the challenge."));
  }, [id, isNew]);

  if (loadError) return <Page><TopBar back="/admin" /><ErrorNote className="mt-6" message={loadError} /></Page>;
  if (!doc) return <Page><Spinner /></Page>;

  const set = <K extends keyof Doc>(k: K, v: Doc[K]) => { setDoc({ ...doc, [k]: v }); setMessage(null); setDirty(true); };
  const setRef = <K extends keyof Reference>(k: K, v: Reference[K]) => set("reference", { ...doc.reference, [k]: v });
  const setScore = (k: QualityCriterion, v: number) => set("quality", { ...doc.quality, scores: { ...doc.quality.scores, [k]: v }, assessed_by: "editor" });
  const setArea = (i: number, patch: Partial<Doc["investigation"][number]>) => set("investigation", doc.investigation.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const run = async (fn: () => Promise<ChallengeAdmin>, done: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const c = await fn();
      setSaved(c);
      setDoc(fromAdmin(c));
      setDate(c.release_date ?? "");
      setDirty(false);
      setMessage(done);
      if (isNew) navigate(`/admin/${c.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(() => api.admin.save({ ...doc, slug: doc.slug || slugify(doc.title), number: doc.number || null,
    subjects: doc.subjects.map(s => s.trim()).filter(Boolean),
    reference: { ...doc.reference, misconceptions: doc.reference.misconceptions.map(m => m.trim()).filter(Boolean) },
    quality: { ...doc.quality, assessed_at: new Date().toISOString() } }), "Saved.");

  const total = qualityTotal(doc.quality);
  const scored = QUALITY_CRITERIA.every(k => doc.quality.scores[k]);
  const unverified = doc.reference.sources.filter(s => s.critical && !s.verified).length;

  return (
    <Page wide>
      <TopBar back="/admin" center={<span className="eyebrow">{isNew ? "New challenge" : `Day ${saved?.number} · ${saved?.status}`}</span>}
        right={saved && <ButtonLink to={`/admin/${saved.id}/preview`} variant="ghost"><Eye size={16} /> Preview</ButtonLink>} />
      <h1 className="text-center text-[2rem]">{doc.title || "Untitled challenge"}</h1>
      {saved && <div className="mt-1 flex justify-center gap-2"><StatusChip status={saved.editorial_status} />{saved.origin === "ai" && <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted"><Sparkles size={12} /> AI draft</span>}</div>}
      {saved?.origin === "ai" && saved.editorial_status !== "approved" && (
        <Notice className="mt-4">
          Drafted by AI following the Challenge Standard. Read it critically: check every factual claim against the sources (and find better ones where needed),
          mark sources verified only once you have checked them, review the quality scores honestly, then approve, revise or reject.
        </Notice>
      )}

      <div className="mt-5 space-y-4">
        <Section title="Basics">
          <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
            <Field label="Day number" hint="Blank: next number">
              {fid => <input id={fid} type="number" min={1} className={inputClass} value={doc.number || ""} onChange={e => set("number", Number(e.target.value))} />}
            </Field>
            <Text label="Title" value={doc.title} onChange={v => { setDoc({ ...doc, title: v, slug: isNew ? slugify(v) : doc.slug }); setDirty(true); }} max={80} hint="Short, memorable, intriguing." />
          </div>
          <Text label="Short preview" value={doc.summary} onChange={v => set("summary", v)} rows={2} max={400} hint="One or two sentences that create curiosity without revealing the solution. Shown on the home screen." />
          <Field label="Primary disciplines" hint="Two or three fields that genuinely interact, separated by commas.">
            {fid => <input id={fid} className={inputClass} value={doc.subjects.join(", ")} onChange={e => set("subjects", e.target.value.split(",").map(s => s.trimStart()))} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Challenge type">
              {fid => (
                <select id={fid} className={inputClass} value={doc.challenge_type} onChange={e => set("challenge_type", e.target.value as ChallengeType)}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
            </Field>
            <Field label="Research time (minutes)" hint="An estimate, not a limit.">
              {fid => <input id={fid} type="number" min={10} max={600} className={inputClass} value={doc.research_minutes ?? ""} onChange={e => set("research_minutes", e.target.value ? Number(e.target.value) : null)} />}
            </Field>
            <Field label="Scenario classification">
              {fid => (
                <select id={fid} className={inputClass} value={doc.scenario_kind} onChange={e => set("scenario_kind", e.target.value as ScenarioKind)}>
                  {Object.entries(SCENARIO_LABEL).map(([k, v]) => <option key={k} value={k}>{v.replace(/ (scenario|case)$/, "")}</option>)}
                </select>
              )}
            </Field>
          </div>
          <Text label="Scenario note" value={doc.scenario_note} onChange={v => set("scenario_note", v)} max={300} hint="Distinguish documented facts from invented details." />
        </Section>

        <Section title="The story" hint="Second person, concise enough to read comfortably on a phone. No spoilers.">
          <Text label="Role title" value={doc.role.title} onChange={v => set("role", { ...doc.role, title: v })} max={60} />
          <Text label="Role" value={doc.role.body} onChange={v => set("role", { ...doc.role, body: v })} rows={3} max={600} hint="Who am I, and what responsibility do I have?" />
          <Text label="The situation" value={doc.situation} onChange={v => set("situation", v)} rows={5} max={1200} hint="What is happening, and why does it matter?" />
          <Text label={`The task (card 5: ${TASK_HEADING[doc.challenge_type]})`} value={doc.final_task} onChange={v => set("final_task", v)} rows={3} max={800}
            hint="Specific enough to know what to produce, open enough to need independent reasoning." />
        </Section>

        <Section title="Constraints" hint="Three to five. Each must meaningfully affect the options; no arbitrary difficulty.">
          {doc.constraints.map((x, i) => (
            <div key={i} className="flex flex-wrap items-start gap-2">
              <select aria-label="Icon" className={`${inputClass} w-36`} value={x.icon} onChange={e => set("constraints", doc.constraints.map((y, j) => (j === i ? { ...y, icon: e.target.value } : y)))}>
                {Object.keys(CONSTRAINT_ICONS).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <input aria-label={`Constraint ${i + 1}`} placeholder="Limited funds" className={`${inputClass} min-w-40 flex-1`} value={x.label} maxLength={80}
                onChange={e => set("constraints", doc.constraints.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
              <input aria-label={`Detail for constraint ${i + 1}`} placeholder="Optional detail" className={`${inputClass} min-w-48 flex-[2]`} value={x.detail} maxLength={300}
                onChange={e => set("constraints", doc.constraints.map((y, j) => (j === i ? { ...y, detail: e.target.value } : y)))} />
              <Remove label={`Remove constraint ${i + 1}`} onClick={() => set("constraints", doc.constraints.filter((_, j) => j !== i))} />
            </div>
          ))}
          {doc.constraints.length < 6 && <Button variant="ghost" icon={Plus} onClick={() => set("constraints", [...doc.constraints, { label: "", detail: "", icon: "circle" }])}>Add constraint</Button>}
        </Section>

        <Section title="Your Investigation" hint="Three or four areas, one or two questions each. Never reveal or imply the answer. Essential and exploratory labels are for editors only.">
          {doc.investigation.map((a, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line-soft p-3">
              <div className="flex gap-2">
                <input aria-label={`Area ${i + 1}`} placeholder="Water Distribution" className={inputClass} value={a.title} maxLength={60} onChange={e => setArea(i, { title: e.target.value })} />
                <Remove label={`Remove area ${i + 1}`} onClick={() => set("investigation", doc.investigation.filter((_, j) => j !== i))} />
              </div>
              {a.questions.map((q, j) => (
                <div key={j} className="flex flex-wrap gap-2">
                  <input aria-label={`Area ${i + 1}, question ${j + 1}`} className={`${inputClass} min-w-56 flex-1`} value={q.text} maxLength={300}
                    onChange={e => setArea(i, { questions: a.questions.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} />
                  <select aria-label={`Area ${i + 1}, question ${j + 1}, priority`} className={`${inputClass} w-36`} value={q.priority}
                    onChange={e => setArea(i, { questions: a.questions.map((x, k) => (k === j ? { ...x, priority: e.target.value as Question["priority"] } : x)) })}>
                    <option value="essential">Essential</option><option value="exploratory">Exploratory</option>
                  </select>
                  {a.questions.length > 1 && <Remove label={`Remove area ${i + 1}, question ${j + 1}`} onClick={() => setArea(i, { questions: a.questions.filter((_, k) => k !== j) })} />}
                </div>
              ))}
              {a.questions.length < 2 && <Button variant="ghost" icon={Plus} onClick={() => setArea(i, { questions: [...a.questions, { text: "", priority: "exploratory" }] })}>Add question</Button>}
            </div>
          ))}
          {doc.investigation.length < 4 && <Button variant="ghost" icon={Plus} onClick={() => set("investigation", [...doc.investigation, { title: "", questions: [{ text: "", priority: "essential" }] }])}>Add area</Button>}
        </Section>

        <Section title="Difficulty guidance (shown to users)" hint="Same scenario for everyone. Difficulty changes the depth of reasoning expected, not the facts.">
          {LEVELS.map(d => <Text key={d} label={DIFFICULTY_LABEL[d]} value={doc.expectations[d]} rows={2} onChange={v => set("expectations", { ...doc.expectations, [d]: v })} />)}
        </Section>

        <Section title="Pictures" hint="A direction for every card, then a picture. Directly relevant, accurate to the setting, different on each card. No generic scenery.">
          <div className="grid gap-3 sm:grid-cols-2">
            {doc.cards.map((card, i) => (
              <ImagePicker key={card.kind} kind={card.kind} value={card.image} direction={card.direction}
                onChange={v => set("cards", doc.cards.map((k, j) => (j === i ? { ...k, image: v } : k)))}
                onDirection={v => set("cards", doc.cards.map((k, j) => (j === i ? { ...k, direction: v } : k)))} />
            ))}
          </div>
        </Section>

        <Section title="Private evaluation guide" hint="Never shown to users. The evaluator relies on it, so every fact must be accurate.">
          <Text label="Factual reference guide" value={doc.reference.background} onChange={v => setRef("background", v)} rows={8} hint="Verified facts, principles and assumptions. Required before approval." />
          <Text label="Core knowledge" value={doc.reference.core_knowledge} onChange={v => setRef("core_knowledge", v)} rows={3} />
          <Text label="Important uncertainties" value={doc.reference.uncertainties} onChange={v => setRef("uncertainties", v)} rows={3} />
          <Text label="Investigation map" value={doc.reference.investigation_map} onChange={v => setRef("investigation_map", v)} rows={3} hint="Essential and exploratory questions, and how the fields connect." />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">Plausible approaches <span className="font-normal text-muted">(at least three when the problem allows)</span></p>
            {doc.reference.approaches.map((a, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line-soft p-3">
                <div className="flex gap-2">
                  <input aria-label={`Approach ${i + 1} title`} placeholder="Title" className={inputClass} value={a.title}
                    onChange={e => setRef("approaches", doc.reference.approaches.map((b, j) => (j === i ? { ...b, title: e.target.value } : b)))} />
                  <Remove label={`Remove approach ${i + 1}`} onClick={() => setRef("approaches", doc.reference.approaches.filter((_, j) => j !== i))} />
                </div>
                {(["summary", "strengths", "weaknesses", "conditions"] as const).map(k => (
                  <input key={k} aria-label={`Approach ${i + 1} ${k}`} placeholder={k === "conditions" ? "Works when…" : k[0].toUpperCase() + k.slice(1)} className={inputClass}
                    value={a[k] ?? ""} onChange={e => setRef("approaches", doc.reference.approaches.map((b, j) => (j === i ? { ...b, [k]: e.target.value } : b)))} />
                ))}
              </div>
            ))}
            <Button variant="ghost" icon={Plus} onClick={() => setRef("approaches", [...doc.reference.approaches, { title: "", summary: "" }])}>Add approach</Button>
          </div>
          <Text label="Critical reasoning" value={doc.reference.critical_reasoning} onChange={v => setRef("critical_reasoning", v)} rows={3} hint="What separates a superficial answer from an excellent one." />
          <Text label="Common mistakes (one per line)" rows={4} value={doc.reference.misconceptions.join("\n")} onChange={v => setRef("misconceptions", v.split("\n"))} />
          <Text label="Evidence expectations" value={doc.reference.evidence_expectations} onChange={v => setRef("evidence_expectations", v)} rows={3} />
          {LEVELS.map(d => (
            <Text key={d} label={`What evaluators look for at ${DIFFICULTY_LABEL[d]}`} rows={2} value={doc.reference.difficulty_guide[d] ?? ""}
              onChange={v => setRef("difficulty_guide", { ...doc.reference.difficulty_guide, [d]: v })} />
          ))}
          <Text label="Fairness safeguards" value={doc.reference.fairness_notes} onChange={v => setRef("fairness_notes", v)} rows={2} />
          <Text label="Other notes for the evaluator" value={doc.reference.evaluator_notes} onChange={v => setRef("evaluator_notes", v)} rows={2} />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">Sources</p>
            <p className="text-xs text-muted">Mark a source verified only after checking it yourself. A challenge can&rsquo;t be approved while a critical source is unverified.</p>
            {doc.reference.sources.map((s, i) => {
              const patch = (p: Partial<typeof s>) => setRef("sources", doc.reference.sources.map((b, j) => (j === i ? { ...b, ...p } : b)));
              return (
                <div key={i} className="space-y-2 rounded-xl border border-line-soft p-3">
                  <div className="flex gap-2">
                    <input aria-label={`Source ${i + 1}`} placeholder="Title" className={inputClass} value={s.title} onChange={e => patch({ title: e.target.value })} />
                    <Remove label={`Remove source ${i + 1}`} onClick={() => setRef("sources", doc.reference.sources.filter((_, j) => j !== i))} />
                  </div>
                  <input aria-label={`Source ${i + 1} URL`} placeholder="https://…" className={inputClass} value={s.url ?? ""} onChange={e => patch({ url: e.target.value })} />
                  <input aria-label={`Source ${i + 1} note`} placeholder="What it supports" className={inputClass} value={s.note} onChange={e => patch({ note: e.target.value })} />
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#3b281b]" checked={Boolean(s.critical)} onChange={e => patch({ critical: e.target.checked })} /> Critical claim</label>
                    <label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#3b281b]" checked={Boolean(s.verified)} onChange={e => patch({ verified: e.target.checked })} /> I have verified it</label>
                  </div>
                </div>
              );
            })}
            <Button variant="ghost" icon={Plus} onClick={() => setRef("sources", [...doc.reference.sources, { title: "", note: "", url: "", verified: false, critical: true }])}>Add source</Button>
          </div>
        </Section>

        <Section title="Quality assessment" hint="Score honestly from 1 to 5. Publication bar: at least 4 on every criterion and 35 of 40 overall. A high score doesn't override a serious weakness.">
          <div className="grid gap-2 sm:grid-cols-2">
            {QUALITY_CRITERIA.map(k => (
              <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft px-3 py-2">
                <span className="text-sm"><span className="font-semibold text-ink">{CRITERION_LABEL[k][0]}</span><br /><span className="text-xs text-muted">{CRITERION_LABEL[k][1]}</span></span>
                <select aria-label={CRITERION_LABEL[k][0]} className={`${inputClass} w-20`} value={doc.quality.scores[k] ?? ""} onChange={e => setScore(k, Number(e.target.value))}>
                  <option value="">–</option>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className={cx("text-sm font-semibold", scored && total >= 35 && QUALITY_CRITERIA.every(k => (doc.quality.scores[k] ?? 0) >= 4) ? "text-ok" : "text-ink")}>
            Total {total} / 40{doc.quality.assessed_by === "ai" ? " · scored by the AI that drafted it" : ""}
          </p>
          <Text label="Identified weaknesses" value={doc.quality.weaknesses ?? ""} onChange={v => set("quality", { ...doc.quality, weaknesses: v, assessed_by: "editor" })} rows={3} />
          {doc.quality.tests && doc.quality.tests.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-bronze">The AI&rsquo;s quality tests</summary>
              <ul className="mt-2 space-y-1">{doc.quality.tests.map((t, i) => <li key={i}>{t.passed ? "Passed" : "Failed"}: <strong className="text-ink">{t.test}</strong>{t.note ? `. ${t.note}` : ""}</li>)}</ul>
            </details>
          )}
        </Section>

        {error && <ErrorNote message={error} />}
        {message && <Notice>{message}</Notice>}
        <Button size="lg" className="w-full" busy={busy} onClick={save}>{isNew ? "Create draft" : "Save changes"}</Button>

        {saved && (
          <Section title="Editorial review" hint="Only an Approved challenge can be published. Approving applies the standard's bar.">
            <div className="flex items-center gap-2 text-sm">Status: <StatusChip status={saved.editorial_status} /></div>
            <ul className="space-y-1.5">
              <Check ok={Boolean(saved.reference?.background.trim())}>Factual reference guide written</Check>
              <Check ok={unverified === 0}>{unverified === 0 ? "No unverified critical sources" : `${unverified} critical source${unverified === 1 ? "" : "s"} not yet verified`}</Check>
              <Check ok={!saved.quality_problem}>{saved.quality_problem ?? "Meets the quality bar"}</Check>
            </ul>
            {dirty && <p className="text-xs text-muted">Save your changes first; the checks above reflect the last saved version.</p>}
            <div className="flex flex-wrap gap-2">
              {(["approved", "needs_revision", "pending_verification", "rejected"] as EditorialStatus[]).filter(s => s !== saved.editorial_status).map(s => (
                <Button key={s} variant={s === "approved" ? "primary" : s === "rejected" ? "danger" : "secondary"} busy={busy} disabled={dirty}
                  onClick={() => run(() => api.admin.setEditorial(saved.id, s), `Marked ${EDITORIAL_LABEL[s]}.`)}>
                  {s === "approved" ? "Approve" : s === "rejected" ? "Reject" : `Mark ${EDITORIAL_LABEL[s].toLowerCase()}`}
                </Button>
              ))}
            </div>
          </Section>
        )}

        {saved && (
          <Section title="Schedule and publish" hint="A published challenge appears to everyone at 00:00 UTC on its release date and stays open until the next one is released.">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Release date (UTC)">
                {fid => <input id={fid} type="date" className={`${inputClass} w-48`} value={date} onChange={e => setDate(e.target.value)} />}
              </Field>
              <Button variant="secondary" busy={busy} disabled={!date || date === saved.release_date} onClick={() => run(() => api.admin.schedule(saved.id, date), `Scheduled for ${formatDate(date)}.`)}>Set date</Button>
              {saved.release_date && saved.status !== "published" && (
                <Button variant="ghost" busy={busy} onClick={() => run(() => api.admin.schedule(saved.id, null), "Date removed.")}>Clear date</Button>
              )}
            </div>
            <p className="text-sm">Status: <strong className="text-ink">{saved.status}</strong>{saved.release_date ? ` · releases ${formatDate(saved.release_date)}` : " · no release date"}</p>
            <div className="flex flex-wrap gap-2">
              {saved.status !== "published" && <Button busy={busy} disabled={saved.editorial_status !== "approved"} onClick={() => run(() => api.admin.setStatus(saved.id, "published"), "Published.")}>Publish</Button>}
              {saved.status === "published" && <Button variant="secondary" busy={busy} onClick={() => run(() => api.admin.setStatus(saved.id, "draft"), "Unpublished: back to draft.")}>Unpublish</Button>}
              {saved.status !== "archived" && <Button variant="ghost" busy={busy} onClick={() => run(() => api.admin.setStatus(saved.id, "archived"), "Archived.")}>Archive</Button>}
            </div>
            {saved.status !== "published" && saved.editorial_status !== "approved" && <p className="text-xs text-muted">Approve the challenge before publishing it.</p>}
          </Section>
        )}

        {saved && <FeedbackSummary c={saved} />}
        {saved && <Responses id={saved.id} />}
      </div>
    </Page>
  );
}
