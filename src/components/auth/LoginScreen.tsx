import { type FormEvent, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail, Moon, ShieldCheck, Sun, Zap } from "lucide-react";

import { useAuth } from "./AuthProvider";
import { useTheme } from "@/components/layout/ThemeProvider";

export function LoginScreen() {
  const { login, sessionError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetSecondFactor = () => {
    setNeedsOtp(false);
    setOtp("");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (needsOtp && !/^\d{6}$/.test(otp.trim())) {
      setError("Informe o código de 6 dígitos do autenticador.");
      return;
    }

    setBusy(true);
    setError(null);
    const err = await login(email, password, needsOtp ? otp : undefined);
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
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
        className="absolute right-4 top-4 grid size-9 place-items-center rounded-md text-primary transition-colors hover:bg-secondary"
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center text-primary">
            <Zap className="size-9" />
          </span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">RC GERADORES</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">SCADA · Acesso seguro ao sistema</p>
        </div>

        {sessionError && (
          <p className="mb-3 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-[12px] text-alert">
            Não foi possível verificar uma sessão existente: {sessionError}. Você ainda pode tentar
            entrar novamente.
          </p>
        )}

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-panel)]"
        >
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {needsOtp ? "Verificação em duas etapas" : "Login"}
          </h2>

          <label className="mt-4 block text-[12px] font-semibold text-muted-foreground">
            E-mail
            <span className="mt-1.5 flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
              <Mail className="size-4 shrink-0 text-primary" />
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  resetSecondFactor();
                }}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="admin@rcgeradores.local"
                required
              />
            </span>
          </label>

          <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
            Senha
            <span className="mt-1.5 flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
              <Lock className="size-4 shrink-0 text-primary" />
              <input
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                  resetSecondFactor();
                }}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                className="text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          </label>

          {needsOtp && (
            <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
              Código do autenticador
              <span className="mt-1.5 flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
                <ShieldCheck className="size-4 shrink-0 text-primary" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setError(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm tracking-[0.3em] outline-none"
                  placeholder="000000"
                  aria-label="Código 2FA de 6 dígitos"
                  autoFocus
                  required
                />
              </span>
            </label>
          )}

          {error && (
            <p className="mt-3 rounded-md border border-offline/40 bg-offline/10 px-3 py-2 text-[12px] text-offline">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Validando…" : needsOtp ? "Validar código" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
