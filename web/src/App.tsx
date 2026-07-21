import { Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./state/AppContext";
import { NavShell } from "./components/NavShell";
import { Onboarding } from "./pages/Onboarding";
import { ConversationList } from "./pages/ConversationList";
import { ThreadView } from "./pages/ThreadView";
import { Notes } from "./pages/Notes";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";
import { AuthCallback } from "./pages/AuthCallback";

function AppRoutes() {
  const { profile, loadingProfile, apiKeyConfigured, authRequired, sessionReady, signedIn } = useApp();

  if (!sessionReady || loadingProfile) {
    return <div className="app-loading">読み込み中…</div>;
  }

  if (authRequired && !signedIn) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (!profile?.onboardedAt) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }

  return (
    <NavShell apiKeyConfigured={apiKeyConfigured}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Navigate to="/chats" replace />} />
        <Route path="/chats" element={<ConversationList medium="chat" />} />
        <Route path="/chats/:characterId" element={<ThreadView medium="chat" />} />
        <Route path="/mail" element={<ConversationList medium="email" />} />
        <Route path="/mail/:characterId" element={<ThreadView medium="email" />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/chats" replace />} />
      </Routes>
    </NavShell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
