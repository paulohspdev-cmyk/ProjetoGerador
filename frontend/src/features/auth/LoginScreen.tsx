import { type FormEvent, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BellRing,
  Eye,
  EyeOff,
  Fuel,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Wrench,
} from "lucide-react";

import { useTheme } from "@/layout/ThemeProvider";
import { rcApi } from "@/lib/api";
import { useAuth } from "./AuthProvider";

function presentAccessError(message: string) {
  const text = message.trim();
  if (/^HTTP\s+\d+/i.test(text)) {
    return "Não foi possível concluir o acesso. Tente novamente em instantes.";
  }
  if (/failed to fetch|networkerror|tempo limite da requisição/i.test(text)) {
    return "Sem conexão com a central. Verifique a rede e tente novamente.";
  }
  return text;
}

function LoginNotice({
  id,
  tone,
  children,
}: {
  id?: string;
  tone: "fault" | "warn" | "ok";
  children: string;
}) {
  return (
    <p id={id} className={`rc-login-notice is-${tone}`} role="alert">
      {children}
    </p>
  );
}

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
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const resetSecondFactor = () => {
    setNeedsOtp(false);
    setOtp("");
  };

  const requestReset = async () => {
    const email = username.trim();
    if (!email) {
      setError("Informe seu e-mail para solicitar a recuperação.");
      return;
    }
    setResetBusy(true);
    setError(null);
    setResetMessage(null);
    try {
      await rcApi.auth.requestReset(email);
      setResetMessage(
        "Se a conta existir e o e-mail estiver configurado, enviaremos um link de recuperação.",
      );
    } catch (err) {
      setError(
        presentAccessError(
          err instanceof Error ? err.message : "Não foi possível solicitar a recuperação.",
        ),
      );
    } finally {
      setResetBusy(false);
    }
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
      setError(presentAccessError(err));
      return;
    }
    void navigate({ to: "/p/geradores" });
  };

  const features = [
    {
      icon: Activity,
      title: "Monitoramento em tempo real",
      text: "Acompanhe geradores, comunicação e indicadores operacionais.",
      tone: "text-chart-2",
    },
    {
      icon: BellRing,
      title: "Alarmes e eventos",
      text: "Priorize ocorrências e mantenha histórico auditável das decisões.",
      tone: "text-primary",
    },
    {
      icon: Wrench,
      title: "Manutenção e energia",
      text: "Planeje intervenções e acompanhe a disponibilidade do parque.",
      tone: "text-online",
    },
  ];

  return (
    <main className="rc-login grid min-h-dvh lg:grid-cols-[minmax(0,1.55fr)_minmax(430px,.8fr)]">
      <section className="rc-login-hero hidden h-full min-h-0 flex-col justify-between overflow-hidden p-8 lg:flex xl:p-10">
        <div className="rc-login-plant" aria-hidden="true" />
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-4">
            <span className="rc-login-brand-mark grid size-14 place-items-center rounded-md border text-sm font-black tracking-[-0.04em]">
              RC
            </span>
            <div>
              <p className="text-3xl font-black tracking-[0.025em] text-white xl:text-4xl">
                RC GERADORES
              </p>
              <p className="mt-1 text-sm font-semibold uppercase tracking-[0.09em] text-slate-400">
                Console SCADA industrial
              </p>
            </div>
          </div>

          <div className="mt-10 max-w-2xl xl:mt-12">
            <div className="mb-5 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">
              <span className="h-px w-10 bg-primary" />
              Supervisão · operação · manutenção
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-white xl:text-5xl">
              Supervisão e operação
              <span className="mt-1 block font-black text-primary">de grupos geradores.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
              Telemetria, alarmes, eventos e comandos homologados em uma única plataforma
              operacional auditável.
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <div className="grid max-w-4xl gap-3 xl:grid-cols-3">
            {features.map((item) => (
              <article key={item.title} className="rc-login-feature rounded-xl p-5">
                <item.icon className={`size-7 ${item.tone}`} />
                <h2 className="mt-4 text-sm font-extrabold text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.text}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 inline-flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-300 backdrop-blur">
            <span className="size-2.5 rounded-full bg-online shadow-[0_0_14px_var(--online)]" />
            <b className="text-white">Sistema operacional</b>
            <span className="h-4 w-px bg-white/10" />
            <span>Acesso seguro à central RC Geradores</span>
          </div>
        </div>
      </section>

      <section className="rc-login-auth flex h-full min-h-0 flex-col px-5 py-4 sm:px-8 lg:px-8">
        <div className="flex shrink-0 justify-end">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            className="rc-theme-toggle flex h-10 items-center gap-2 rounded-full px-3 backdrop-blur transition-colors"
          >
            <Sun className={theme === "light" ? "size-4 text-primary" : "size-4"} />
            <span className="relative h-5 w-10 rounded-full bg-primary/90 p-0.5">
              <span
                className={`block size-4 rounded-full bg-white shadow transition-transform ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`}
              />
            </span>
            <Moon className={theme === "dark" ? "size-4 text-primary" : "size-4"} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center py-4">
          <div className="w-full max-w-[560px]">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <span className="rc-login-brand-mark grid size-10 place-items-center rounded-md border text-[11px] font-black tracking-[-0.04em]">
                RC
              </span>
              <div>
                <p className="text-lg font-black tracking-wide text-white">RC GERADORES</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">
                  Console SCADA industrial
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="rc-login-form-card rounded-[22px] p-5 sm:p-6">
              <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-primary/30 bg-primary/5 text-primary shadow-[0_0_32px_rgba(255,107,0,.08)]">
                <ShieldCheck className="size-8" />
              </div>
              <div className="mt-4 text-center">
                <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  {needsOtp ? "Confirmar acesso" : "Acesso ao centro de operação"}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  Autenticação para acesso à supervisão, alarmes e funções operacionais autorizadas.
                </p>
              </div>

              {sessionError && (
                <LoginNotice tone="warn">
                  Não foi possível recuperar a sessão anterior. Entre novamente.
                </LoginNotice>
              )}

              <div className="mt-5 space-y-3">
                <label className="rc-login-input flex min-h-15 items-center gap-3 rounded-xl px-4">
                  <Mail className="size-5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      E-mail
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
                      placeholder="usuario@empresa.com"
                      className="mt-0.5 w-full bg-transparent text-sm outline-none"
                      aria-label="E-mail"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "login-error" : undefined}
                      required
                      autoFocus
                    />
                  </span>
                </label>

                <label className="rc-login-input flex min-h-15 items-center gap-3 rounded-xl px-4">
                  <Lock className="size-5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Senha
                    </span>
                    <input
                      type={show ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError(null);
                        resetSecondFactor();
                      }}
                      placeholder="Digite sua senha"
                      className="mt-0.5 w-full bg-transparent text-sm outline-none"
                      aria-label="Senha"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "login-error" : undefined}
                      required
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => setShow((value) => !value)}
                    aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                    className="grid size-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </label>

                <label className="rc-login-input flex min-h-15 items-center gap-3 rounded-xl px-4">
                  <ShieldCheck className="size-5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      <span>Código do autenticador</span>
                      {!needsOtp && (
                        <span className="rounded-md border border-current/20 px-1.5 py-0.5 text-[9px] normal-case tracking-normal opacity-70">
                          Opcional
                        </span>
                      )}
                    </span>
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
                      placeholder="— — — — — —"
                      className="mt-0.5 w-full bg-transparent text-base tracking-[0.35em] outline-none"
                      aria-label="Código 2FA de 6 dígitos"
                      aria-invalid={needsOtp && error ? true : undefined}
                      aria-describedby={error ? "login-error" : undefined}
                      required={needsOtp}
                    />
                  </span>
                </label>
              </div>

              {error && (
                <LoginNotice id="login-error" tone="fault">
                  {error}
                </LoginNotice>
              )}
              {resetMessage && <LoginNotice tone="ok">{resetMessage}</LoginNotice>}

              <button
                type="button"
                disabled={resetBusy || busy}
                onClick={() => void requestReset()}
                className="mt-3 w-full text-center text-sm font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {resetBusy ? "Solicitando…" : "Esqueci minha senha"}
              </button>

              <button
                type="submit"
                disabled={busy}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-extrabold text-primary-foreground shadow-[0_12px_32px_rgba(255,107,0,.18)] transition-all hover:-translate-y-px hover:bg-primary/90 disabled:translate-y-0 disabled:opacity-60"
              >
                {busy ? "Entrando…" : needsOtp ? "Confirmar acesso" : "Entrar"}
                {!busy && <ArrowRight className="size-5" />}
              </button>

              <div className="mt-4 border-t border-white/8 pt-3 text-center text-xs text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="size-4" />
                  Acesso seguro · autenticação em dois fatores quando habilitada
                </span>
              </div>
            </form>

            <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-slate-600">
              <span>RC Geradores</span>
              <span className="inline-flex items-center gap-1.5">
                <Fuel className="size-3.5" /> SCADA · Operação · Manutenção
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
