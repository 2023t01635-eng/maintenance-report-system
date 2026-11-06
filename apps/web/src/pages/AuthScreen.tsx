import { LockKeyhole, Wrench } from "lucide-react";
import { useState, type FormEvent } from "react";
import { login, setupAdmin, type User } from "../services/api";

type AuthScreenProps = {
  mode: "setup" | "login";
  onAuthenticated: (user: User) => void;
};

export function AuthScreen({ mode, onAuthenticated }: AuthScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isSetup = mode === "setup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = isSetup
        ? await setupAdmin({ name, email, password })
        : await login(email, password);
      onAuthenticated(response.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to continue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <div className="brand-mark" aria-hidden="true"><Wrench /></div>
        <p className="eyebrow">University of Colombo - Faculty of Technology</p>
        <h1>Maintenance Request Reporting System</h1>
        <p>Secure access for maintenance records, approvals, alerts, service work, evidence, and reports.</p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <LockKeyhole aria-hidden="true" />
        <p className="eyebrow">{isSetup ? "First-time setup" : "Authorized users"}</p>
        <h2 id="auth-heading">{isSetup ? "Create administrator" : "Sign in"}</h2>
        <p className="muted">
          {isSetup ? "Create the first protected account to begin managing the system." : "Use your assigned account to continue."}
        </p>

        <form className="form-stack" onSubmit={submit}>
          {isSetup && (
            <label>
              Full name
              <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
            </label>
          )}
          <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={isSetup ? 8 : undefined} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Please wait..." : isSetup ? "Create administrator" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
