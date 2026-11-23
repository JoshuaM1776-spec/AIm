import { Eye, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CONSTRAINT_ICONS } from "../../components/icons.tsx";
import { Button, ButtonLink, Card, cx, ErrorNote, Field, inputClass, Notice, Page, Spinner, TopBar } from "../../components/ui.tsx";
import { ILLUSTRATIONS, Illustration } from "../../illustrations/index.tsx";
import { api, ApiError } from "../../lib/api.ts";
import { DIFFICULTY_LABEL, formatDate, paragraphs } from "../../lib/text.ts";
import type { AdminResponse, CardKind, ChallengeAdmin, Difficulty, ImageRef } from "../../lib/types.ts";

const KINDS: CardKind[] = ["role", "situation", "constraints", "investigation", "decision"];
const CARD_LABEL: Record<CardKind, string> = { role: "1 · Your Role", situation: "2 · The Situation", constraints: "3 · The Constraints", investigation: "4 · Your Investigation", decision: "5 · Your Decision" };

type Doc = Omit<ChallengeAdmin, "id" | "status" | "release_date" | "reference" | "cards" | "is_open" | "closes_at"> & {
  id?: string;
  cards: { kind: CardKind; image: ImageRef | null }[];
  reference: NonNullable<ChallengeAdmin["reference"]>;
};

const blank = (): Doc => ({
  number: 0, slug: "", title: "", summary: "", subjects: [], scenario_kind: "fictional", scenario_note: "",
  role: { title: "", body: "" }, situation: "", final_task: "",
  expectations: {
    easy: "Recommend a reasonable solution and explain why it should work.",
    moderate: "Compare alternatives, justify your recommendation, and explain the most important trade-offs.",
    hard: "Evaluate competing approaches, address uncertainty and second-order consequences, and defend your recommendation against the strongest objection.",
  },
  cards: KINDS.map(kind => ({ kind, image: null })),
  constraints: [{ label: "", detail: "", icon: "coins" }, { label: "", detail: "", icon: "hourglass" }],
  investigation: [{ title: "", questions: [""] }, { title: "", questions: [""] }],
  reference: { background: "", approaches: [{ title: "", summary: "" }], misconceptions: [], evaluator_notes: "", sources: [] },
});

const fromAdmin = (c: ChallengeAdmin): Doc => ({
  ...c,
  cards: KINDS.map(kind => ({ kind, image: c.cards.find(k => k.kind === kind)?.image ?? null })),
  reference: c.reference ?? blank().reference,
});

const QUALITY = [
  "Intrigue: would someone want to find out more?",
  "Realism: facts verified; fiction clearly labelled as fiction.",
  "Intellectual depth: no answer can be looked up in one step.",
  "Interdisciplinary: the fields genuinely interact in the decision.",
  "Researchable: a curious person can find what they need.",
  "Several defensible approaches exist.",
  "The final task is clear and suits a written response.",
];

const slugify = (t: string) => t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <Card as="section" className="space-y-4 px-4 py-4">
      <div>
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

function ImagePicker({ value, onChange, kind }: { value: ImageRef | null; onChange: (v: ImageRef | null) => void; kind: CardKind }) {
  const mode = value?.src !== undefined ? "url" : value?.key ? "key" : "none";
  return (
    <div className="space-y-2 rounded-xl border border-line-soft p-3">
      <p className="text-sm font-semibold text-ink">{CARD_LABEL[kind]}</p>
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

  useEffect(() => {
    if (isNew) { setDoc(blank()); setSaved(null); return; }
    api.admin.get(id!).then(c => { setSaved(c); setDoc(fromAdmin(c)); setDate(c.release_date ?? ""); })
      .catch(e => setLoadError(e instanceof ApiError ? e.message : "Couldn't load the challenge."));
  }, [id, isNew]);

  if (loadError) return <Page><TopBar back="/admin" /><ErrorNote className="mt-6" message={loadError} /></Page>;
  if (!doc) return <Page><Spinner /></Page>;

  const set = <K extends keyof Doc>(k: K, v: Doc[K]) => { setDoc({ ...doc, [k]: v }); setMessage(null); };
  const setRef = <K extends keyof Doc["reference"]>(k: K, v: Doc["reference"][K]) => set("reference", { ...doc.reference, [k]: v });

  const run = async (fn: () => Promise<ChallengeAdmin>, done: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const c = await fn();
      setSaved(c);
      setDoc(fromAdmin(c));
      setDate(c.release_date ?? "");
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
    reference: { ...doc.reference, misconceptions: doc.reference.misconceptions.map(m => m.trim()).filter(Boolean) } }), "Saved.");

  return (
    <Page wide>
      <TopBar back="/admin" center={<span className="eyebrow">{isNew ? "New challenge" : `Day ${saved?.number} · ${saved?.status}`}</span>}
        right={saved && <ButtonLink to={`/admin/${saved.id}/preview`} variant="ghost"><Eye size={16} /> Preview</ButtonLink>} />
      <h1 className="text-center text-[2rem]">{doc.title || "Untitled challenge"}</h1>

      <div className="mt-5 space-y-4">
        <Section title="Basics">
          <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
            <Field label="Day number" hint="Blank: next number">
              {fid => <input id={fid} type="number" min={1} className={inputClass} value={doc.number || ""} onChange={e => set("number", Number(e.target.value))} />}
            </Field>
            <Text label="Title" value={doc.title} onChange={v => setDoc({ ...doc, title: v, slug: isNew ? slugify(v) : doc.slug })} max={80} />
          </div>
          <Text label="Short description" value={doc.summary} onChange={v => set("summary", v)} rows={2} max={400} hint="Shown on the home screen. One or two sentences." />
          <Field label="Subjects" hint="1 to 4, separated by commas. The fields of knowledge the problem genuinely needs.">
            {fid => <input id={fid} className={inputClass} value={doc.subjects.join(", ")} onChange={e => set("subjects", e.target.value.split(",").map(s => s.trimStart()))} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <Field label="Scenario type">
              {fid => (
                <select id={fid} className={inputClass} value={doc.scenario_kind} onChange={e => set("scenario_kind", e.target.value as Doc["scenario_kind"])}>
                  <option value="fictional">Fictional</option><option value="historical">Historical case</option><option value="hypothetical">Hypothetical</option>
                </select>
              )}
            </Field>
            <Text label="Scenario note" value={doc.scenario_note} onChange={v => set("scenario_note", v)} max={300} hint="Say plainly what is invented and what is real." />
          </div>
        </Section>

        <Section title="The story">
          <Text label="Role title" value={doc.role.title} onChange={v => set("role", { ...doc.role, title: v })} max={60} />
          <Text label="Role" value={doc.role.body} onChange={v => set("role", { ...doc.role, body: v })} rows={3} max={600} />
          <Text label="The situation" value={doc.situation} onChange={v => set("situation", v)} rows={5} max={1200} />
          <Text label="The decision (final task)" value={doc.final_task} onChange={v => set("final_task", v)} rows={3} max={800} />
        </Section>

        <Section title="Constraints" hint="2 to 6. Each must genuinely shape the decision.">
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

        <Section title="Your Investigation" hint="2 to 5 areas, each with 1 to 3 questions. Starting points for discovery, never answers.">
          {doc.investigation.map((a, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line-soft p-3">
              <div className="flex gap-2">
                <input aria-label={`Area ${i + 1}`} placeholder="Engineering" className={inputClass} value={a.title} maxLength={60}
                  onChange={e => set("investigation", doc.investigation.map((b, j) => (j === i ? { ...b, title: e.target.value } : b)))} />
                <Remove label={`Remove area ${i + 1}`} onClick={() => set("investigation", doc.investigation.filter((_, j) => j !== i))} />
              </div>
              <textarea aria-label={`Questions for area ${i + 1}, one per line`} rows={3} className={inputClass} placeholder="One question per line"
                value={a.questions.join("\n")} onChange={e => set("investigation", doc.investigation.map((b, j) => (j === i ? { ...b, questions: e.target.value.split("\n").slice(0, 3) } : b)))} />
            </div>
          ))}
          {doc.investigation.length < 5 && <Button variant="ghost" icon={Plus} onClick={() => set("investigation", [...doc.investigation, { title: "", questions: [""] }])}>Add area</Button>}
        </Section>

        <Section title="Difficulty expectations" hint="Same scenario for everyone. Only what the written response must do changes.">
          {(["easy", "moderate", "hard"] as Difficulty[]).map(d => (
            <Text key={d} label={DIFFICULTY_LABEL[d]} value={doc.expectations[d]} rows={2} onChange={v => set("expectations", { ...doc.expectations, [d]: v })} />
          ))}
        </Section>

        <Section title="Pictures" hint="Use pictures directly relevant to each card. Avoid generic backdrops.">
          <div className="grid gap-3 sm:grid-cols-2">
            {doc.cards.map((card, i) => (
              <ImagePicker key={card.kind} kind={card.kind} value={card.image}
                onChange={v => set("cards", doc.cards.map((k, j) => (j === i ? { ...k, image: v } : k)))} />
            ))}
          </div>
        </Section>

        <Section title="Reference material for the evaluator" hint="Never shown to users. Verify every fact. Required before publishing.">
          <Text label="Verified background" value={doc.reference.background} onChange={v => setRef("background", v)} rows={8} />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">Defensible approaches</p>
            {doc.reference.approaches.map((a, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input aria-label={`Approach ${i + 1} title`} placeholder="Title" className={`${inputClass} min-w-40 flex-1`} value={a.title}
                  onChange={e => setRef("approaches", doc.reference.approaches.map((b, j) => (j === i ? { ...b, title: e.target.value } : b)))} />
                <input aria-label={`Approach ${i + 1} summary`} placeholder="Summary" className={`${inputClass} min-w-56 flex-[3]`} value={a.summary}
                  onChange={e => setRef("approaches", doc.reference.approaches.map((b, j) => (j === i ? { ...b, summary: e.target.value } : b)))} />
                <Remove label={`Remove approach ${i + 1}`} onClick={() => setRef("approaches", doc.reference.approaches.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button variant="ghost" icon={Plus} onClick={() => setRef("approaches", [...doc.reference.approaches, { title: "", summary: "" }])}>Add approach</Button>
          </div>
          <Text label="Common misconceptions (one per line)" rows={4} value={doc.reference.misconceptions.join("\n")} onChange={v => setRef("misconceptions", v.split("\n"))} />
          <Text label="Notes for the evaluator" rows={4} value={doc.reference.evaluator_notes} onChange={v => setRef("evaluator_notes", v)} />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">Sources (for authors and reviewers)</p>
            {doc.reference.sources.map((s, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input aria-label={`Source ${i + 1}`} placeholder="Title" className={`${inputClass} min-w-48 flex-[2]`} value={s.title}
                  onChange={e => setRef("sources", doc.reference.sources.map((b, j) => (j === i ? { ...b, title: e.target.value } : b)))} />
                <input aria-label={`Source ${i + 1} note`} placeholder="What it covers" className={`${inputClass} min-w-40 flex-1`} value={s.note}
                  onChange={e => setRef("sources", doc.reference.sources.map((b, j) => (j === i ? { ...b, note: e.target.value } : b)))} />
                <Remove label={`Remove source ${i + 1}`} onClick={() => setRef("sources", doc.reference.sources.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button variant="ghost" icon={Plus} onClick={() => setRef("sources", [...doc.reference.sources, { title: "", note: "" }])}>Add source</Button>
          </div>
        </Section>

        {error && <ErrorNote message={error} />}
        {message && <Notice>{message}</Notice>}
        <Button size="lg" className="w-full" busy={busy} onClick={save}>{isNew ? "Create draft" : "Save changes"}</Button>

        {saved && (
          <Section title="Schedule and publish" hint="A published challenge appears to everyone at 00:00 UTC on its release date, and stays available afterwards.">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Release date (UTC)">
                {fid => <input id={fid} type="date" className={`${inputClass} w-48`} value={date} onChange={e => setDate(e.target.value)} />}
              </Field>
              <Button variant="secondary" busy={busy} disabled={!date || date === saved.release_date} onClick={() => run(() => api.admin.schedule(saved.id, date), `Scheduled for ${formatDate(date)}.`)}>Set date</Button>
              {saved.release_date && saved.status !== "published" && (
                <Button variant="ghost" busy={busy} onClick={() => run(() => api.admin.schedule(saved.id, null), "Date removed.")}>Clear date</Button>
              )}
            </div>
            <details className="rounded-xl border border-line-soft px-3 py-2 text-sm">
              <summary className="cursor-pointer font-semibold text-ink">Before publishing: the quality bar</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {QUALITY.map(q => <li key={q}>{q}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">Reject a challenge whose disciplines are decorative or that has no real research component. Never publish AI-generated drafts without human review.</p>
            </details>
            <p className="text-sm">Status: <strong className="text-ink">{saved.status}</strong>{saved.release_date ? ` · releases ${formatDate(saved.release_date)}` : " · no release date"}</p>
            <div className="flex flex-wrap gap-2">
              {saved.status !== "published" && <Button busy={busy} onClick={() => run(() => api.admin.setStatus(saved.id, "published"), "Published.")}>Publish</Button>}
              {saved.status === "published" && <Button variant="secondary" busy={busy} onClick={() => run(() => api.admin.setStatus(saved.id, "draft"), "Unpublished: back to draft.")}>Unpublish</Button>}
              {saved.status !== "archived" && <Button variant="ghost" busy={busy} onClick={() => run(() => api.admin.setStatus(saved.id, "archived"), "Archived.")}>Archive</Button>}
            </div>
          </Section>
        )}

        {saved && <Responses id={saved.id} />}
      </div>
    </Page>
  );
}
