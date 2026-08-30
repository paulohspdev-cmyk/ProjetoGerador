import { KeyRound, LockKeyhole, MonitorSmartphone, Settings, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useTheme } from "@/components/layout/ThemeProvider";
import { rcApi } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

type SessionRow = { id: string; expiresAt: number; createdAt: number; lastSeen: number; remoteIp: string; userAgent: string };

export function SystemSettingsV3Screen() {
  const { theme, setTheme } = useTheme();
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [otp, setOtp] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSecurity = async () => {
    try {
      const [me, currentSessions] = await Promise.all([rcApi.auth.me(), rcApi.auth.sessions()]);
      setTwoFactor(Boolean(me.twoFactorEnabled)); setSessions(currentSessions); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar segurança da conta."); }
  };
  useEffect(() => { void loadSecurity(); }, []);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setMessage(""); setError("");
    if (newPassword !== confirmPassword) { setError("A confirmação da nova senha não confere."); return; }
    setBusy(true);
    try {
      await rcApi.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("Senha alterada. As demais sessões foram revogadas pelo backend quando aplicável."); await loadSecurity();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao alterar senha."); }
    finally { setBusy(false); }
  };
  const setup2fa = async () => {
    setMessage(""); setError("");
    try { const result = await rcApi.auth.setup2fa(); setSecret(result.secret); setUri(result.otpauthUri); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao iniciar 2FA."); }
  };
  const enable2fa = async () => {
    setMessage(""); setError("");
    try { await rcApi.auth.enable2fa(otp.trim()); setOtp(""); setSecret(""); setUri(""); setMessage("2FA habilitado."); await loadSecurity(); }
    catch (err) { setError(err instanceof Error ? err.message : "Código 2FA inválido."); }
  };
  const disable2fa = async () => {
    if (!window.confirm("Desabilitar a autenticação em dois fatores desta conta?")) return;
    setMessage(""); setError("");
    try { await rcApi.auth.disable2fa(otp.trim()); setOtp(""); setMessage("2FA desabilitado."); await loadSecurity(); }
    catch (err) { setError(err instanceof Error ? err.message : "Código 2FA inválido."); }
  };
  const revokeSessions = async () => {
    if (!window.confirm("Revogar todas as sessões desta conta? Você poderá precisar entrar novamente.")) return;
    try { await rcApi.auth.revokeSessions(); setMessage("Sessões revogadas."); await loadSecurity(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao revogar sessões."); }
  };

  return <ScreenBody>
    <Stats items={[
      { icon: Settings, label: "Tema", value: theme === "dark" ? "ESCURO" : "CLARO" },
      { icon: ShieldCheck, label: "2FA", value: twoFactor ? "ATIVO" : "INATIVO", tone: twoFactor ? "text-online" : undefined },
      { icon: MonitorSmartphone, label: "Sessões", value: sessions.length },
    ]} />
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    {message && <p className="rounded-md border border-online/30 bg-online/10 p-3 text-sm text-online">{message}</p>}

    <Panel title="Preferências da interface">
      <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-secondary/40"><div><p className="text-[13px] font-semibold">Tema escuro</p><p className="text-[11px] text-muted-foreground">Preferência local; não altera configuração industrial.</p></div><Pill tone={theme === "dark" ? "ok" : "muted"}>{theme === "dark" ? "ON" : "OFF"}</Pill></button>
    </Panel>

    <Panel title="Alterar senha">
      <form onSubmit={changePassword} className="grid gap-2 md:grid-cols-4">
        <label className="text-[11px] font-semibold text-muted-foreground">Senha atual<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Nova senha<input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Confirmar nova senha<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <div className="flex items-end"><button disabled={busy} className="h-9 w-full rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><LockKeyhole className="mr-1 inline size-4" />Alterar senha</button></div>
      </form>
    </Panel>

    <Panel title="Autenticação em dois fatores">
      <div className="space-y-3 text-[12px]">
        {!twoFactor && !secret && <ActionBtn onClick={() => void setup2fa()}><KeyRound className="mr-1 inline size-3" />Configurar 2FA</ActionBtn>}
        {!twoFactor && secret && <div className="space-y-2 rounded-md border border-alert/30 bg-alert/5 p-3"><p><b>1.</b> Adicione a conta no autenticador usando a chave abaixo ou a URI otpauth.</p><code className="block break-all rounded bg-background p-2">{secret}</code><code className="block break-all rounded bg-background p-2 text-[10px]">{uri}</code><p><b>2.</b> Digite o código atual para confirmar.</p><div className="flex gap-2"><input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="000000" className="h-9 w-36 rounded-md border border-input bg-background px-2 text-sm" /><ActionBtn disabled={otp.length < 6} onClick={() => void enable2fa()}>Habilitar 2FA</ActionBtn><ActionBtn onClick={() => { setSecret(""); setUri(""); setOtp(""); }}>Cancelar</ActionBtn></div></div>}
        {twoFactor && <div className="space-y-2"><p className="text-online">2FA está habilitado nesta conta.</p><div className="flex gap-2"><input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="código atual" className="h-9 w-36 rounded-md border border-input bg-background px-2 text-sm" /><ActionBtn tone="danger" disabled={otp.length < 6} onClick={() => void disable2fa()}>Desabilitar 2FA</ActionBtn></div></div>}
      </div>
    </Panel>

    <Panel title="Sessões da conta" actions={sessions.length ? <ActionBtn tone="danger" onClick={() => void revokeSessions()}>Revogar todas</ActionBtn> : undefined}>
      <ScadaTable rows={sessions} columns={[
        { label: "Criada", render: (r) => <span className="num">{new Date(r.createdAt * 1000).toLocaleString("pt-BR")}</span> },
        { label: "Última atividade", render: (r) => <span className="num">{new Date(r.lastSeen * 1000).toLocaleString("pt-BR")}</span> },
        { label: "Expira", render: (r) => <span className="num">{new Date(r.expiresAt * 1000).toLocaleString("pt-BR")}</span> },
        { label: "IP", render: (r) => <span className="num">{r.remoteIp || "N/D"}</span> },
        { label: "Cliente", render: (r) => <span className="text-[10px]">{r.userAgent || "N/D"}</span> },
      ]} />
    </Panel>
  </ScreenBody>;
}
