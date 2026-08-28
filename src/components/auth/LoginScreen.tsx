import { type FormEvent, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail, Moon, Sun, Zap } from "lucide-react";

import { useAuth } from "./AuthProvider";
import { useTheme } from "@/components/layout/ThemeProvider";

export function LoginScreen() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@admin.cm");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = login(email, password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
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
          <p className="mt-1 text-[12px] text-muted-foreground">SCADA · Acesso ao sistema</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-panel)]"
        >
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">Login</h2>

          <label className="mt-4 block text-[12px] font-semibold text-muted-foreground">
            Usuário
            <span className="mt-1.5 flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3">
              <Mail className="size-4 shrink-0 text-primary" />
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="admin@admin.cm"
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
                }}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="••••••••"
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
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
