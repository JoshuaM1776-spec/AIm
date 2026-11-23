import { Emblem } from "../components/Emblem.tsx";
import { Card, Page, ScreenTitle } from "../components/ui.tsx";

/** Shown when the app was built without a server to talk to. */
export default function Setup() {
  return (
    <Page>
      <div className="mt-8 flex justify-center"><Emblem size={60} /></div>
      <ScreenTitle title="Daily Challenge" subtitle="This copy of the app isn't connected to a server yet." />
      <Card className="mt-6 space-y-2 px-4 py-4 text-sm">
        <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>), then rebuild.</p>
        <p>For local development without Supabase, run <code>npm run dev:local</code>.</p>
      </Card>
    </Page>
  );
}
