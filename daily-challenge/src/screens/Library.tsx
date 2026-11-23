import { ChevronRight, Share2 } from "lucide-react";
import { Link } from "react-router";
import { ButtonLink, Card, ErrorNote, Page, ScreenTitle, Spinner, TopBar } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { DIFFICULTY_LABEL, formatDate } from "../lib/text.ts";
import { useLoad } from "../lib/useLoad.ts";

export default function Library() {
  const { session, ready } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.library(), [session?.user.id], Boolean(session));
  return (
    <Page>
      <TopBar back="/progress" />
      <ScreenTitle title="Completed Challenges" subtitle="A record of your intellectual work." />
      {ready && !session && (
        <Card className="mt-6 px-5 py-6 text-center">
          <p>Sign in to keep a library of your responses and feedback.</p>
          <ButtonLink to="/signin?next=/library" className="mt-4 w-full" arrow>Sign in</ButtonLink>
        </Card>
      )}
      {loading && <Spinner />}
      {error && <ErrorNote className="mt-6" message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <Card className="mt-6 px-5 py-6 text-center">
          <p>Your completed challenges will appear here.</p>
          <ButtonLink to="/" className="mt-4 w-full" arrow>Today&rsquo;s challenge</ButtonLink>
        </Card>
      )}
      {data && data.length > 0 && (
        <ul className="mt-6 space-y-3">
          {data.map(item => {
            const first = item.initial?.overall;
            const rev = item.revision?.overall;
            return (
              <li key={item.number}>
                <Link to={`/c/${item.number}/evaluation`} className="flex items-center gap-4 rounded-2xl border border-line bg-card/80 px-4 py-3 transition hover:border-bronze-soft">
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">Day {item.number}</p>
                    <p className="font-serif text-[1.25rem] leading-snug text-ink">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(item.submitted_at)} · {DIFFICULTY_LABEL[item.difficulty]}
                      {item.revision ? " · Revised" : ""}
                      {item.shared && <> · <Share2 size={11} className="inline" aria-hidden /> Shared</>}
                    </p>
                  </div>
                  <div className="text-right">
                    {first != null ? (
                      <>
                        <p className="font-serif text-2xl font-semibold leading-none text-ink">{rev ?? first}</p>
                        {rev != null && <p className="text-xs text-muted">from {first}</p>}
                      </>
                    ) : (
                      <p className="text-xs text-muted">{item.initial?.status === "failed" ? "Not evaluated" : "Awaiting evaluation"}</p>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
