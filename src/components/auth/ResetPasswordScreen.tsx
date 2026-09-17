import { type FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, ShieldCheck } from "lucide-react";

import { rcApi } from "@/lib/api";

export function ResetPasswordScreen({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return setError("Link de recuperação inválido ou incompleto.");
    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    setError("");
    try {
      await rcApi.auth.confirmReset(token, password);
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link inválido, expirado ou já utilizado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-xl">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="size-8" />
        </div>
        <h1 className="mt-5 text-center text-2xl font-extrabold">Redefinir senha</h1>
        {done ? (
          <div className="mt-6 text-center">
            <p className="rounded-xl border border-online/30 bg-online/10 p-4 text-sm text-online">
              Senha atualizada. Todas as sessões anteriores foram revogadas.
            </p>
            <Link to="/login" className="mt-5 inline-flex font-bold text-primary hover:underline">
              Entrar no sistema
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {!token && (
              <p className="rounded-xl border border-offline/30 bg-offline/10 p-3 text-sm text-offline">
                Link de recuperação inválido ou incompleto.
              </p>
            )}
            <label className="block text-sm font-semibold">
              Nova senha
              <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-input px-3">
                <KeyRound className="size-4 text-muted-foreground" />
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </span>
            </label>
            <label className="block text-sm font-semibold">
              Confirmar nova senha
              <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-input px-3">
                <KeyRound className="size-4 text-muted-foreground" />
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </span>
            </label>
            {error && (
              <p className="rounded-xl border border-offline/30 bg-offline/10 p-3 text-sm text-offline">
                {error}
              </p>
            )}
            <button
              disabled={busy || !token}
              className="h-11 w-full rounded-lg bg-primary font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Atualizando…" : "Redefinir senha"}
            </button>
            <Link
              to="/login"
              className="block text-center text-sm font-semibold text-primary hover:underline"
            >
              Voltar ao login
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}
