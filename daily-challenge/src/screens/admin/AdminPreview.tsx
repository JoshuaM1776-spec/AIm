import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, ButtonLink, ErrorNote, Notice, Page, Spinner, TopBar } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { PreviewProvider } from "../../lib/challenge.tsx";
import type { Difficulty } from "../../lib/types.ts";
import { useLoad } from "../../lib/useLoad.ts";
import { BriefContent } from "../Brief.tsx";
import { ChallengePreview } from "../Home.tsx";
import { DifficultyPicker } from "../Overview.tsx";
import { StoryFrame } from "../Story.tsx";

/** See a challenge exactly as users will: overview, the five cards and the brief. */
export default function AdminPreview() {
  const { id, card } = useParams();
  const navigate = useNavigate();
  const { data: c, error, loading } = useLoad(() => api.admin.get(id!), [id]);
  const [difficulty, setDifficulty] = useState<Difficulty>("moderate");
  if (loading) return <Page><Spinner /></Page>;
  if (error || !c) return <Page><TopBar back="/admin" /><ErrorNote className="mt-6" message={error?.message ?? "Not found"} /></Page>;
  const base = `/admin/${c.id}/preview`;

  if (card === "brief") {
    return (
      <Page>
        <TopBar back={`${base}/5`} center={<span className="eyebrow">Preview · Mission brief</span>} />
        <h1 className="text-center text-[2rem]">{c.title}</h1>
        <div className="mt-4"><BriefContent c={c} difficulty={difficulty} /></div>
        <ButtonLink to={`/admin/${c.id}`} variant="secondary" className="mt-4">Back to editing</ButtonLink>
      </Page>
    );
  }
  const n = Number(card);
  if (n >= 1 && n <= 5) {
    return (
      <PreviewProvider challenge={c} difficulty={difficulty}>
        <StoryFrame c={c} index={n} difficulty={difficulty} base={base} back={base}
          action={<Button size="lg" className="w-full" arrow onClick={() => navigate(`${base}/brief`)}>Begin Investigation</Button>} />
      </PreviewProvider>
    );
  }
  return (
    <Page>
      <TopBar back={`/admin/${c.id}`} center={<span className="eyebrow">Preview</span>} />
      <Notice className="mb-4 text-center text-xs">Preview of a {c.status} challenge{c.release_date ? `, releasing ${c.release_date} (UTC)` : ""}. Nothing here is saved.</Notice>
      <ChallengePreview c={c} compact />
      <div className="mt-6"><DifficultyPicker value={difficulty} onChange={setDifficulty} expectations={c.expectations} /></div>
      <ButtonLink to={`${base}/1`} size="lg" arrow className="mt-6 w-full">Begin Challenge</ButtonLink>
    </Page>
  );
}
