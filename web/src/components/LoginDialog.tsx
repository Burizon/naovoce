import { type FormEvent, useState } from "react";
import { type Session, api } from "../api.ts";

interface Props {
  onClose: () => void;
  onSession: (session: Session) => void;
}

export function LoginDialog({ onClose, onSession }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSession(await api.login(username, password));
    } catch {
      setError("Přihlášení se nepovedlo. Zkontrolujte jméno a heslo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="login-title">Přihlášení</h2>
        <label className="field">
          <span>Uživatelské jméno</span>
          <input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="field">
          <span>Heslo</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="notice">{error}</p>}
        <div className="row">
          <button type="submit" className="button" disabled={busy || !username || !password}>
            Přihlásit se
          </button>
          <button type="button" className="button ghost" onClick={onClose}>
            Zrušit
          </button>
        </div>
      </form>
    </div>
  );
}
