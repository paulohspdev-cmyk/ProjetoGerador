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
  Zap,
} from "lucide-react";

import { useTheme } from "@/components/layout/ThemeProvider";
import { useAuth } from "./AuthProvider";

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
    if (busy) return;
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
      <section className="rc-login-hero hidden min-h-dvh flex-col justify-between p-8 lg:flex xl:p-12 2xl:p-16">
        <div className="rc-login-plant" aria-hidden="true" />
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-4">
            <span className="rc-sidebar-logo-mark grid size-16 place-items-center text-primary">
              <Zap className="size-14 fill-primary/15 stroke-[1.8]" />
            </span>
            <div>
              <p className="text-3xl font-black tracking-[0.025em] text-white xl:text-4xl">
                RC GERADORES
              </p>
              <p className="mt-1 text-base text-slate-300">Central de monitoramento</p>
            </div>
          </div>

          <div className="mt-14 max-w-2xl xl:mt-20">
            <div className="mb-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-300">
              <span className="h-px w-12 bg-primary" />
              Monitoramento · confiabilidade · continuidade
            </div>
            <h1 className="text-4xl font-light leading-[1.05] tracking-tight text-white xl:text-6xl">
              Mais que energia,
              <span className="mt-1 block font-extrabold text-primary">é continuidade.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 xl:text-lg">
              Tecnologia, monitoramento e inteligência para manter grupos geradores disponíveis
              quando a operação mais precisa.
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

      <section className="relative flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,#061724_0%,#04111b_100%)] px-5 py-10 sm:px-8 lg:px-10">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          className="absolute right-5 top-5 flex h-10 items-center gap-2 rounded-full border border-white/10 bg-slate-950/35 px-3 text-slate-300 backdrop-blur transition-colors hover:text-white"
        >
          <Sun className="size-4" />
          <span className="h-5 w-9 rounded-full bg-primary/90 p-0.5">
            <span className="block size-4 translate-x-4 rounded-full bg-white transition-transform" />
          </span>
          <Moon className="size-4" />
        </button>

        <div className="w-full max-w-[560px]">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <Zap className="size-9 text-primary" />
            <div>
              <p className="text-xl font-black tracking-wide text-white">RC GERADORES</p>
              <p className="text-xs text-slate-400">Central de monitoramento</p>
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            className="rc-login-form-card rounded-[22px] p-6 sm:p-8 xl:p-10"
          >
            <div className="mx-auto grid size-20 place-items-center rounded-2xl border border-primary/30 bg-primary/5 text-primary shadow-[0_0_32px_rgba(255,107,0,.08)]">
              <ShieldCheck className="size-10" />
            </div>
            <div className="mt-6 text-center">
              <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {needsOtp ? "Confirmar acesso" : "Entrar no sistema"}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
                Acesse a central de monitoramento e operação dos geradores.
              </p>
            </div>

            {sessionError && (
              <p className="mt-6 rounded-xl border border-alert/35 bg-alert/10 px-4 py-3 text-sm text-alert">
                Não foi possível recuperar a sessão anterior. Entre novamente.
              </p>
            )}

            <div className="mt-7 space-y-4">
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
                    className="mt-0.5 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                    aria-label="E-mail"
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
                    className="mt-0.5 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                    aria-label="Senha"
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

              {needsOtp && (
                <label className="rc-login-input flex min-h-15 items-center gap-3 rounded-xl px-4">
                  <ShieldCheck className="size-5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Código do autenticador
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
                      placeholder="000000"
                      className="mt-0.5 w-full bg-transparent text-base tracking-[0.35em] text-white outline-none placeholder:text-slate-600"
                      aria-label="Código 2FA de 6 dígitos"
                      autoFocus
                      required
                    />
                  </span>
                </label>
              )}
            </div>

            {error && (
              <p className="mt-4 rounded-xl border border-offline/35 bg-offline/10 px-4 py-3 text-sm text-offline">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-extrabold text-primary-foreground shadow-[0_12px_32px_rgba(255,107,0,.18)] transition-all hover:-translate-y-px hover:bg-primary/90 disabled:translate-y-0 disabled:opacity-60"
            >
              {busy ? "Entrando…" : needsOtp ? "Confirmar acesso" : "Entrar"}
              {!busy && <ArrowRight className="size-5" />}
            </button>

            <div className="mt-6 border-t border-white/8 pt-5 text-center text-xs text-slate-500">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Acesso seguro · autenticação em dois fatores quando habilitada
              </span>
            </div>
          </form>

          <div className="mt-5 flex items-center justify-between px-1 text-[11px] text-slate-600">
            <span>RC Geradores</span>
            <span className="inline-flex items-center gap-1.5">
              <Fuel className="size-3.5" /> Energia hoje. Negócios sempre.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
