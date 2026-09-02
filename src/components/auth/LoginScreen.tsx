import { type FormEvent, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Lock, Moon, ShieldCheck, Sun, UserRound, Zap } from "lucide-react";

import { useAuth } from "./AuthProvider";
import { useTheme } from "@/components/layout/ThemeProvider";

export function LoginScreen() {
  const { login, sessionError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (needsOtp && !/^\d{6}$/.test(otp.trim())) {
      setError("Informe o código de 6 dígitos.");
      return;
    }

    setBusy(true);
    setError(null);
    const err = await login(username, password, needsOtp ? otp : undefined);
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
    <div className="relative grid min-h-dvh place-items-center bg-background px-5 py-10">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
        className="absolute right-5 top-5 grid size-10 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-primary/12 text-primary">
            <Zap className="size-7" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-[0.08em]">RC GERADORES</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Central de monitoramento</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-panel)] sm:p-7"
        >
          <div className="mb-6 flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <h2 className="text-base font-bold">
              {needsOtp ? "Confirmar acesso" : "Entrar no sistema"}
            </h2>
          </div>

          {sessionError && (
            <p className="mb-4 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-alert">
              Não foi possível recuperar a sessão anterior. Entre novamente.
            </p>
          )}

          <label className="block text-sm font-semibold">
            Usuário
            <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-primary">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                  resetSecondFactor();
                }}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                aria-label="Usuário"
                required
                autoFocus
              />
            </span>
          </label>

          <label className="mt-4 block text-sm font-semibold">
            Senha
            <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-primary">
              <Lock className="size-4 shrink-0 text-muted-foreground" />
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
                aria-label="Senha"
                required
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                className="grid size-8 place-items-center text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          </label>

          {needsOtp && (
            <label className="mt-4 block text-sm font-semibold">
              Código do autenticador
              <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-primary">
                <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
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
                  className="min-w-0 flex-1 bg-transparent text-base tracking-[0.35em] outline-none"
                  aria-label="Código 2FA de 6 dígitos"
                  autoFocus
                  required
                />
              </span>
            </label>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-offline/40 bg-offline/10 px-3 py-2 text-sm text-offline">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-extrabold tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Entrando…" : needsOtp ? "Confirmar" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
