import { type FormEvent, useEffect, useState } from "react";
import { KeyRound, Plug, ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi, type ApiTokenItem, type SystemHealth } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

export function ApiV3Screen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [tokens, setTokens] = useState<ApiTokenItem[]>([]);
  const [name, setName] = useState("");
  const [read, setRead] = useState(true);
  const [command, setCommand] = useState(false);
  const [rateLimit, setRateLimit] = useState("120");
  const [expiresDays, setExpiresDays] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const currentHealth = await rcApi.system.health();
      setHealth(currentHealth);
      if (admin) setTokens(await rcApi.apiTokens.list());
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar API."); }
  };
  useEffect(() => { void load(); }, [admin]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const scopes = [read ? "ops.read" : "", command ? "ops.command" : ""].filter(Boolean);
    if (!scopes.length) { setError("Selecione pelo menos um escopo."); return; }
    if (command && !window.confirm("Criar token com escopo ops.command? Esse escopo continua limitado a START/STOP homologados e exige confirmação por requisição.")) return;
    const limit = Number(rateLimit);
    if (!Number.isInteger(limit) || limit < 10 || limit > 5000) { setError("Rate limit deve ficar entre 10 e 5000 requisições por janela."); return; }
    const days = Number(expiresDays || 0);
    const expiresAt = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : undefined;
    setBusy(true);
    try {
      const item = await rcApi.apiTokens.create({ name: name.trim(), scopes, rateLimit: limit, ...(expiresAt ? { expiresAt } : {}) });
      setIssuedToken(item.token ?? null);
      setName("");
      setTokens(await rcApi.apiTokens.list());
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar token."); }
    finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revogar este token de API? A operação não pode ser desfeita.")) return;
    try { await rcApi.apiTokens.revoke(id); setTokens(await rcApi.apiTokens.list()); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao revogar token."); }
  };

  return <ScreenBody>
    <Stats items={[
      { icon: Plug, label: "API", value: health?.ok ? "ONLINE" : "N/D", tone: health?.ok ? "text-online" : undefined },
      { icon: Plug, label: "Versão", value: health?.version.apiVersion ?? "—" },
      { icon: KeyRound, label: "Tokens ativos", value: admin ? tokens.filter((t) => t.active).length : "ADMIN" },
    ]} />
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}

    <Panel title="API RC Geradores">
      <div className="grid gap-2 text-[12px] md:grid-cols-2">
        <div className="rounded-md border border-border p-3"><b>API interna</b><p className="mt-1 text-muted-foreground">Base <span className="num">/api</span>, sessão HttpOnly, RBAC e auditoria.</p></div>
        <div className="rounded-md border border-border p-3"><b>API externa v1</b><p className="mt-1 text-muted-foreground">Bearer token com rate limit e escopos explícitos. <span className="num">ops.read</span> é leitura; <span className="num">ops.command</span> continua limitado aos comandos homologados.</p></div>
      </div>
    </Panel>

    {issuedToken && <Panel title="Token criado — exibição única">
      <div className="rounded-md border border-alert/40 bg-alert/10 p-3">
        <p className="text-[11px] font-semibold text-alert">Copie e guarde agora. O valor completo não será mostrado novamente.</p>
        <code className="mt-2 block break-all rounded bg-background p-2 text-[12px]">{issuedToken}</code>
        <button type="button" className="mt-2 rounded-md border border-border px-3 py-1.5 text-[11px] font-semibold" onClick={() => { void navigator.clipboard?.writeText(issuedToken); }}>Copiar</button>
        <button type="button" className="ml-2 mt-2 rounded-md border border-border px-3 py-1.5 text-[11px]" onClick={() => setIssuedToken(null)}>Ocultar</button>
      </div>
    </Panel>}

    {admin && <Panel title="Criar token externo">
      <form onSubmit={create} className="grid gap-2 lg:grid-cols-5">
        <label className="text-[11px] font-semibold text-muted-foreground">Nome<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Integração BMS" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <div className="text-[11px] font-semibold text-muted-foreground"><span>Escopos</span><div className="mt-1 flex h-9 items-center gap-3 rounded-md border border-input px-2"><label className="flex items-center gap-1"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />ops.read</label><label className="flex items-center gap-1 text-alert"><input type="checkbox" checked={command} onChange={(e) => setCommand(e.target.checked)} />ops.command</label></div></div>
        <label className="text-[11px] font-semibold text-muted-foreground">Rate limit<input inputMode="numeric" value={rateLimit} onChange={(e) => setRateLimit(e.target.value.replace(/\D/g, ""))} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Expira em dias<input inputMode="numeric" value={expiresDays} onChange={(e) => setExpiresDays(e.target.value.replace(/\D/g, ""))} placeholder="vazio = sem data" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <div className="flex items-end"><button disabled={busy} className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Criando…" : "Criar token"}</button></div>
      </form>
    </Panel>}

    {admin && <Panel title="Tokens de API">
      <ScadaTable rows={tokens} columns={[
        { label: "Nome", render: (r) => <b>{r.name}</b> },
        { label: "Prefixo", render: (r) => <span className="num">{r.token_prefix}</span> },
        { label: "Escopos", render: (r) => <span className="flex flex-wrap gap-1">{r.scopes.map((scope) => <Pill key={scope} tone={scope === "ops.command" ? "warn" : "info"}>{scope}</Pill>)}</span> },
        { label: "Limite", render: (r) => <span className="num">{r.rate_limit}</span> },
        { label: "Expiração", render: (r) => r.expires_at ? new Date(r.expires_at * 1000).toLocaleString("pt-BR") : "Sem data" },
        { label: "Estado", render: (r) => <Pill tone={r.active ? "ok" : "muted"}>{r.active ? "Ativo" : "Revogado"}</Pill> },
        { label: "Controle", render: (r) => r.active ? <ActionBtn tone="danger" onClick={() => void revoke(r.id)}>Revogar</ActionBtn> : "—" },
      ]} />
    </Panel>}

    {!admin && <p className="rounded-md border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground"><ShieldCheck className="mr-1 inline size-4" />Gerenciamento de tokens é restrito a administradores.</p>}
  </ScreenBody>;
}
