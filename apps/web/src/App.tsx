import { useEffect, useState } from "react";
import { AuthScreen } from "./pages/AuthScreen";
import { Dashboard } from "./pages/Dashboard";
import { getCurrentUser, getSetupStatus, type User } from "./services/api";

type View = "loading" | "setup" | "login" | "dashboard";

export function App() {
  const [view, setView] = useState<View>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getSetupStatus()
      .then(async ({ needsSetup }) => {
        if (needsSetup) {
          setView("setup");
          return;
        }

        try {
          const response = await getCurrentUser();
          setUser(response.user);
          setView("dashboard");
        } catch {
          setView("login");
        }
      })
      .catch(() => setView("login"));
  }, []);

  if (view === "loading") {
    return <main className="loading-screen"><div className="loading-mark" />Checking secure access...</main>;
  }

  if (view === "setup" || view === "login") {
    return (
      <AuthScreen
        mode={view}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setView("dashboard");
        }}
      />
    );
  }

  return user ? <Dashboard user={user} onLoggedOut={() => { setUser(null); setView("login"); }} /> : null;
}
