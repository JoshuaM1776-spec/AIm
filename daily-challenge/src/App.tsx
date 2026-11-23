import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { Page, Spinner } from "./components/ui.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import { ChallengeLayout } from "./lib/challenge.tsx";
import { configured } from "./lib/supabase.ts";
import { About, Mission, NotFound, Profile, SignIn } from "./screens/Account.tsx";
import { AdminGate } from "./screens/admin/AdminGate.tsx";
import Brief from "./screens/Brief.tsx";
import Community from "./screens/Community.tsx";
import Evaluation from "./screens/Evaluation.tsx";
import Home from "./screens/Home.tsx";
import Library from "./screens/Library.tsx";
import Overview, { Continue } from "./screens/Overview.tsx";
import Results from "./screens/Results.tsx";
import Setup from "./screens/Setup.tsx";
import Story from "./screens/Story.tsx";
import Write from "./screens/Write.tsx";

// Charts and the admin tools load only when needed.
const Progress = lazy(() => import("./screens/Progress.tsx"));
const AdminList = lazy(() => import("./screens/admin/Admin.tsx"));
const AdminEdit = lazy(() => import("./screens/admin/AdminEdit.tsx"));
const AdminPreview = lazy(() => import("./screens/admin/AdminPreview.tsx"));

export default function App() {
  if (!configured) return <Setup />;
  return (
    <AuthProvider>
      <BrowserRouter>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
        <Suspense fallback={<Page><Spinner /></Page>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/c/:number" element={<ChallengeLayout />}>
              <Route index element={<Overview />} />
              <Route path="continue" element={<Continue />} />
              <Route path="story/:card" element={<Story />} />
              <Route path="brief" element={<Brief />} />
              <Route path="write" element={<Write kind="initial" />} />
              <Route path="revise" element={<Write kind="revision" />} />
              <Route path="evaluation" element={<Evaluation />} />
              <Route path="community" element={<Community />} />
              <Route path="results" element={<Results />} />
            </Route>
            <Route path="/progress" element={<Progress />} />
            <Route path="/library" element={<Library />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/mission" element={<Mission />} />
            <Route path="/about" element={<About />} />
            <Route path="/admin" element={<AdminGate><AdminList /></AdminGate>} />
            <Route path="/admin/new" element={<AdminGate><AdminEdit /></AdminGate>} />
            <Route path="/admin/:id" element={<AdminGate><AdminEdit /></AdminGate>} />
            <Route path="/admin/:id/preview" element={<AdminGate><AdminPreview /></AdminGate>} />
            <Route path="/admin/:id/preview/:card" element={<AdminGate><AdminPreview /></AdminGate>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
