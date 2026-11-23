import { LogOut, Mail, Settings2, Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Emblem } from "../components/Emblem.tsx";
import { Button, ButtonLink, Card, ErrorNote, Field, inputClass, NavRow, Notice, Page, ScreenTitle, TopBar } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { hasGuestWork, useAuth } from "../lib/auth.tsx";
import { readLocal, writeLocal } from "../lib/local.ts";
import { configured } from "../lib/supabase.ts";
import type { Difficulty } from "../lib/types.ts";
import { DifficultyPicker } from "./Overview.tsx";

export function SignIn() {
  const { session, sendCode, verifyCode, refreshMe } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/") && !params.get("next")?.startsWith("//") ? params.get("next")! : "/";
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to={next} replace />;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendCode(email.trim());
      setStage("code");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send a code. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email.trim(), code);
      await refreshMe();
      navigate(next, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That code didn't work.");
      setBusy(false);
    }
  };

  return (
    <Page>
      <TopBar back="/" />
      <div className="mt-2 flex justify-center"><Emblem size={52} /></div>
      <ScreenTitle title="Sign in" subtitle="Or create your free account. Just your email: we send you a code, no password needed." />
      {!configured && <ErrorNote className="mt-6" message="Accounts aren't set up on this installation yet." />}
      {hasGuestWork() && <Notice className="mt-5">The writing you&rsquo;ve done on this device will move to your account when you sign in.</Notice>}
      {stage === "email" ? (
        <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void send(); }}>
          <Field label="Email address">
            {id => <input id={id} type="email" required autoComplete="email" inputMode="email" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" busy={busy} icon={Mail}>Send me a code</Button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void verify(); }}>
          <p className="text-sm">We sent a 6-digit code to <strong className="text-ink">{email}</strong>. It may take a minute to arrive.</p>
          <Field label="Code">
            {id => <input id={id} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
              className={`${inputClass} text-center font-serif text-2xl tracking-[0.4em]`} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
          <button type="button" className="w-full text-sm font-semibold text-bronze" onClick={() => { setStage("email"); setCode(""); }}>Use a different email</button>
        </form>
      )}
      {error && <ErrorNote className="mt-4" message={error} />}
      <p className="mt-auto pt-10 text-center text-xs text-muted">Your responses are private unless you choose to share one. We never show your email to anyone.</p>
    </Page>
  );
}

const TEXT_SCALE_KEY = "dc.textScale";
export const applyTextScale = (s: number) => document.documentElement.style.setProperty("--text-scale", String(s));
export const storedTextScale = () => readLocal<number>(TEXT_SCALE_KEY) ?? 1;

export function Profile() {
  const { session, email, me, refreshMe, signOut, ready } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("moderate");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(storedTextScale());
  useEffect(() => {
    if (me) {
      setName(me.profile.display_name ?? "");
      setDifficulty(me.profile.preferred_difficulty);
    }
  }, [me]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateProfile(name.trim(), difficulty);
      await refreshMe();
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your settings.");
    } finally {
      setBusy(false);
    }
  };
  const changeScale = (s: number) => {
    setScale(s);
    applyTextScale(s);
    writeLocal(TEXT_SCALE_KEY, s);
  };

  return (
    <Page>
      <TopBar back="/" />
      <ScreenTitle title={session ? "Your Account" : "Settings"} />

      {ready && !session && (
        <Card className="mt-6 px-5 py-5 text-center">
          <p>Sign in to keep your progress, get evaluations and share with the community.</p>
          <Button className="mt-4 w-full" onClick={() => navigate("/signin")}>Sign in or create an account</Button>
        </Card>
      )}

      {session && (
        <Card className="mt-6 space-y-5 px-4 py-5">
          <p className="text-sm">Signed in as <strong className="text-ink">{email}</strong></p>
          <Field label="Display name" hint="Used if you share a response. A pseudonym is fine.">
            {id => <input id={id} className={inputClass} value={name} onChange={e => setName(e.target.value)} maxLength={40} autoComplete="nickname" />}
          </Field>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
          {error && <ErrorNote message={error} />}
          <Button onClick={save} busy={busy} className="w-full">{saved ? "Saved" : "Save settings"}</Button>
        </Card>
      )}

      <Card className="mt-4 px-4 py-4">
        <h2 className="text-lg">Text size</h2>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Text size">
          {[[1, "Standard"], [1.12, "Larger"], [1.25, "Largest"]].map(([v, label]) => (
            <button key={label} type="button" role="radio" aria-checked={scale === v} onClick={() => changeScale(v as number)}
              className={`min-h-11 rounded-xl border text-sm font-semibold ${scale === v ? "border-button bg-button text-[#f8f1e6]" : "border-line bg-card text-ink"}`}>{label}</button>
          ))}
        </div>
      </Card>

      <nav className="mt-4 flex flex-col gap-3">
        <NavRow to="/mission" icon={Sprout}>Our mission</NavRow>
        {me?.profile.is_admin && <NavRow to="/admin" icon={Settings2} hint="Create, preview, schedule and publish">Challenge management</NavRow>}
      </nav>
      {session && (
        <Button variant="ghost" className="mt-6" icon={LogOut} onClick={async () => { await signOut(); navigate("/"); }}>Sign out</Button>
      )}
      <p className="mt-auto pt-8 text-center text-xs text-muted"><Link to="/about" className="underline underline-offset-2">How Daily Challenge works</Link></p>
    </Page>
  );
}

export function Mission() {
  return (
    <Page>
      <TopBar back="/" />
      <div className="flex justify-center"><Emblem size={52} /></div>
      <ScreenTitle title="Our Mission" />
      <div className="mt-5 space-y-4 text-[1.02rem] leading-relaxed">
        <p>
          Daily Challenge exists to strengthen independent thinking: the habit of meeting a hard problem, finding things out for
          yourself, deciding, and explaining your reasoning clearly. One challenge a day, the same for everyone.
        </p>
        <p>
          The app is planned to be supported by a simple subscription (expected to be $2.99 a month). It isn&rsquo;t available yet;
          everything is free while we build.
        </p>
        <h2 className="pt-2 text-[1.5rem]">Beyond the app</h2>
        <p>
          We intend for a portion of future subscription revenue to help develop financially self-sustaining agricultural operations
          that reduce long-term food insecurity, possibly farms owned directly or through a related company.
        </p>
        <p className="text-sm text-muted">
          That plan is at an early stage. The structure, the share of revenue and how it will operate haven&rsquo;t been decided, and
          subscriptions should not be considered charitable donations. We&rsquo;ll share specifics here when they exist.
        </p>
      </div>
    </Page>
  );
}

export function About() {
  return (
    <Page>
      <TopBar back="/" />
      <ScreenTitle title="How It Works" />
      <ol className="mt-6 space-y-4 text-[1.02rem]">
        {[
          ["Encounter a problem", "Each day at 00:00 UTC, everyone receives the same challenge: a role, a situation and real constraints. It's open for that day; then the next one begins. Your past work and feedback stay with you."],
          ["Investigate independently", "The app gives you starting points, not answers. Research however you like, away from the app."],
          ["Decide and explain", "Write your recommendation and defend it with reasoning and evidence, at the difficulty you choose."],
          ["Get constructive feedback", "An AI evaluates understanding, reasoning, clarity and organization, and suggests how to grow. You can revise once."],
          ["Learn from others", "After submitting, see how others approached the same problem. Sharing is always your choice."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-card font-serif text-lg text-ink">{i + 1}</span>
            <div><p className="font-serif text-[1.2rem] text-ink">{t}</p><p className="text-ink-soft">{d}</p></div>
          </li>
        ))}
      </ol>
      <Card className="mt-6 px-4 py-4 text-sm">
        <h2 className="text-lg">About scores</h2>
        <p className="mt-1">
          Scores are an AI&rsquo;s judgement of one written response. They reward reasoning, not agreement with a particular answer,
          and not length or vocabulary. They can vary by a few points, so the feedback matters more than the number. We don&rsquo;t try
          to detect AI-written text; the point is your own thinking.
        </p>
      </Card>
    </Page>
  );
}

export function NotFound() {
  return (
    <Page>
      <TopBar back="/" />
      <ScreenTitle title="Page not found" subtitle="That page doesn't exist." />
      <ButtonLink to="/" className="mt-6" arrow>Go to today&rsquo;s challenge</ButtonLink>
    </Page>
  );
}
