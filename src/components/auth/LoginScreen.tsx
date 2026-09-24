import { type FormEvent, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole, Moon, ShieldCheck, Sun } from "lucide-react";

import { useTheme } from "@/components/layout/ThemeProvider";
import { useAuth } from "./AuthProvider";
import "./login-screen.css";

export function LoginScreen() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetSecondFactor = () => {
    setNeedsOtp(false);
    setOtp("");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    if ((needsOtp || otp.trim()) && !/^\d{6}$/.test(otp.trim())) {
      setError("Informe o código de 6 dígitos.");
      return;
    }

    setBusy(true);
    setError(null);

    const err = await login(
      username,
      password,
      /^\d{6}$/.test(otp.trim()) ? otp.trim() : undefined,
    );

    setBusy(false);

    if (err) {
      if (!needsOtp && /2fa|totp|código.*obrigatório/i.test(err)) {
        setNeedsOtp(true);
        setError(null);
        return;
      }
      setError(err);
      return;
    }

    void navigate({ to: "/" });
  };

  return (
    <main className="rc-auth-screen">
      <section className="rc-auth-visual" aria-label="RC Geradores — Central de monitoramento" />

      <section className="rc-auth-access">
        <button
          type="button"
          onClick={toggleTheme}
          className="rc-auth-theme-toggle rc-theme-toggle"
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
        >
          <Sun className={theme === "light" ? "is-active" : ""} />
          <span className="rc-auth-theme-track" aria-hidden="true">
            <span
              className={`rc-auth-theme-knob ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`}
            />
          </span>
          <Moon className={theme === "dark" ? "is-active" : ""} />
        </button>

        <div className="rc-auth-mobile-brand">
          <img src="/images/auth/rc-bolt.svg" alt="" />
          <div>
            <strong>RC GERADORES</strong>
            <span>Central de monitoramento</span>
          </div>
        </div>

        <form className="rc-auth-card" onSubmit={onSubmit}>
          <div className="rc-auth-lock">
            <span className="rc-auth-lock-line rc-auth-lock-line-left" />
            <span className="rc-auth-lock-frame">
              <LockKeyhole />
            </span>
            <span className="rc-auth-lock-line rc-auth-lock-line-right" />
          </div>

          <header className="rc-auth-card-header">
            <h1>{needsOtp ? "Confirmar acesso" : "Entrar no sistema"}</h1>
            <p>
              {needsOtp
                ? "Informe o código do autenticador para concluir o acesso."
                : "Acesse a central de monitoramento de geradores."}
            </p>
          </header>

          <div className="rc-auth-fields">
            <label className="rc-auth-field">
              <span className="rc-auth-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                </svg>
              </span>
              <input
                type="email"
                autoComplete="username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError(null);
                  resetSecondFactor();
                }}
                placeholder="Usuário"
                aria-label="E-mail"
                required
                autoFocus
              />
            </label>

            <label className="rc-auth-field">
              <LockKeyhole className="rc-auth-field-lucide" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                  resetSecondFactor();
                }}
                placeholder="Senha"
                aria-label="Senha"
                required
              />
              <button
                type="button"
                className="rc-auth-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </label>

            <label className="rc-auth-field rc-auth-field-otp">
              <ShieldCheck className="rc-auth-field-lucide" />
              <div className="rc-auth-otp-input">
                <span>Código do autenticador</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => {
                    setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setError(null);
                  }}
                  placeholder="—  —  —  —  —  —"
                  aria-label="Código do autenticador"
                  required={needsOtp}
                />
              </div>
              {!needsOtp && <span className="rc-auth-optional">Opcional</span>}
            </label>
          </div>

          {error && <div className="rc-auth-message is-error">{error}</div>}

          <button type="submit" className="rc-auth-submit" disabled={busy}>
            {busy ? "Entrando…" : needsOtp ? "Confirmar acesso" : "Entrar"}
          </button>

          <div className="rc-auth-security">
            <ShieldCheck />
            <span>Acesso seguro com autenticação em dois fatores</span>
          </div>
        </form>
      </section>
    </main>
  );
}
