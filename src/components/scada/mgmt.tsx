import { Building2, Mail, MessageCircle, Plug, ScrollText, ShieldCheck, UserCog, Users, Webhook } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { ROLE_LABEL, ROLE_META, type UserRole } from "@/lib/auth";
import { rcApi, type AuditItem, type OpsSite, type SystemHealth } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function dateTime(epoch: number) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{message}</p>;
}

export function ClientsScreen() {
  const { clients, addClient } = useScadaOps();
  const [name, setName] = useState("");
  const [units, setUnits] = useState("0");
  const [gens, setGens] = useState("0");
  const [sla, setSla] = useState("");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    addClient({ name, units: Number(units) || 0, gens: Number(gens) || 0, sla });
    setName(""); setUnits("0"); setGens("0"); setSla("");
  };

  return <ScreenBody>
    <Stats items={[{ icon: Users, label: "Clientes cadastrados", value: clients.length }]} />
    <Panel title="Cadastrar cliente">
      <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-[11px] font-semibold text-muted-foreground">Nome<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Unidades previstas<input type="number" min="0" value={units} onChange={(e) => setUnits(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Geradores previstos<input type="number" min="0" value={gens} onChange={(e) => setGens(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">SLA<input value={sla} onChange={(e) => setSla(e.target.value)} placeholder="ex.: 99,9%" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <div className="flex items-end"><button type="submit" className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90">Cadastrar</button></div>
      </form>
    </Panel>
    <Panel title="Clientes"><ScadaTable rows={clients} columns={[
      { label: "Cliente", render: (r) => <b>{r.name}</b> },
      { label: "Unidades", render: (r) => r.units },
      { label: "Geradores", render: (r) => r.gens },
      { label: "SLA", render: (r) => <span className="num">{r.sla || "—"}</span> },
    ]} /></Panel>
  </ScreenBody>;
}

export function UnitsScreen() {
  const { generators } = useGenerators();
  const { clients } = useScadaOps();
  const [sites, setSites] = useState<OpsSite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const load = async () => {
    try { setSites(await rcApi.sites.list()); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar unidades."); }
  };
  useEffect(() => { void load(); }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await rcApi.sites.create({
        name, city, state, address,
        ...(clientId ? { clientId } : {}),
        ...(latitude ? { latitude: Number(latitude) } : {}),
        ...(longitude ? { longitude: Number(longitude) } : {}),
      });
      setName(""); setClientId(""); setCity(""); setState(""); setAddress(""); setLatitude(""); setLongitude("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao cadastrar unidade."); }
  };

  const rows = useMemo(() => sites.map((site) => {
    const gens = generators.filter((g) => g.site.trim().toLowerCase() === site.name.trim().toLowerCase());
    return { ...site, total: gens.length, online: gens.filter((g) => g.status === "online").length };
  }), [generators, sites]);

  return <ScreenBody>
    <Stats items={[{ icon: Building2, label: "Unidades", value: sites.length }, { icon: Building2, label: "Com coordenadas", value: sites.filter((s) => s.lat != null && s.lng != null).length }]} />
    <ErrorBox message={error} />
    <Panel title="Cadastrar unidade / site">
      <form onSubmit={onCreate} className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-[11px] font-semibold text-muted-foreground">Nome<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Cliente<select value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Sem vínculo</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Cidade<input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">UF<input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground md:col-span-2">Endereço<input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Latitude<input inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-23.5505" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="text-[11px] font-semibold text-muted-foreground">Longitude<input inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="-46.6333" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
        <div><button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Cadastrar unidade</button></div>
      </form>
    </Panel>
    <Panel title="Unidades reais"><ScadaTable rows={rows} columns={[
      { label: "Unidade", render: (r) => <b>{r.name}</b> },
      { label: "Cliente", render: (r) => r.clientName || "—" },
      { label: "Cidade", render: (r) => [r.city, r.state].filter(Boolean).join(" / ") || "—" },
      { label: "Geradores", render: (r) => r.total },
      { label: "Online", render: (r) => <Tone tone={r.online ? "ok" : "muted"}>{r.online}</Tone> },
      { label: "Coordenadas", render: (r) => r.lat != null && r.lng != null ? <span className="num">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</span> : "—" },
    ]} /></Panel>
  </ScreenBody>;
}

export function UsersScreen() {
  const { users, can, createUser, updateUser, removeUser } = useAuth();
  const canCreate = can("create") && can("manageUsers");
  const canEdit = can("edit") && can("manageUsers");
  const canRemove = can("remove") && can("manageUsers");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("visualizacao");
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const err = await createUser({ name, email, password, role });
    if (err) { setOk(false); setMsg(err); return; }
    setOk(true); setMsg("Usuário cadastrado."); setName(""); setEmail(""); setPassword(""); setRole("visualizacao");
  };

  return <ScreenBody>
    <Stats items={[{ icon: UserCog, label: "Usuários", value: users.length }, { icon: ShieldCheck, label: "Ativos", value: users.filter((u) => u.active).length, tone: "text-online" }]} />
    {canCreate && <Panel title="Cadastrar usuário"><form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-[11px] font-semibold text-muted-foreground">Nome<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
      <label className="text-[11px] font-semibold text-muted-foreground">E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
      <label className="text-[11px] font-semibold text-muted-foreground">Senha<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" /></label>
      <label className="text-[11px] font-semibold text-muted-foreground">Perfil<select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="visualizacao">Visualização</option><option value="cadastro">Cadastro</option><option value="administrador">Administrador</option></select></label>
      <div className="flex items-end"><button type="submit" className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground">Cadastrar</button></div>
    </form>{msg && <p className={`mt-2 text-[12px] ${ok ? "text-online" : "text-offline"}`}>{msg}</p>}</Panel>}
    {!canCreate && <p className="rounded-md border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">Seu perfil não permite cadastrar usuários.</p>}
    <Panel title="Usuários"><ScadaTable rows={users} columns={[
      { label: "Nome", render: (r) => <b>{r.name}</b> },
      { label: "E-mail", render: (r) => <span className="num">{r.email}</span> },
      { label: "Perfil", render: (r) => ROLE_LABEL[r.role] },
      { label: "Status", render: (r) => <Tone tone={r.active ? "ok" : "muted"}>{r.active ? "Ativo" : "Inativo"}</Tone> },
      { label: "Último acesso", render: (r) => r.lastAccess ?? "—" },
      { label: "Ações", render: (r) => canEdit || canRemove ? <span className="flex flex-wrap gap-1">{canEdit && <button type="button" className="rounded border border-border px-2 py-0.5 text-[11px]" onClick={() => void updateUser(r.id, { active: !r.active })}>{r.active ? "Desativar" : "Ativar"}</button>}{canRemove && <button type="button" className="rounded border border-offline/40 px-2 py-0.5 text-[11px] text-offline" onClick={() => void removeUser(r.id)}>Excluir</button>}</span> : "—" },
    ]} /></Panel>
  </ScreenBody>;
}

export function RolesScreen() {
  return <ScreenBody><Stats items={[{ icon: ShieldCheck, label: "Perfis", value: ROLE_META.length }]} /><Panel title="Perfis e permissões"><ScadaTable rows={ROLE_META} columns={[{ label: "Perfil", render: (r) => <b>{r.name}</b> }, { label: "Permissões", render: (r) => r.perms }]} /></Panel></ScreenBody>;
}

export function AuditScreen() {
  const [rows, setRows] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; void rcApi.audit.list(1000).then((data) => { if (active) setRows(data); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Falha ao consultar auditoria."); }); return () => { active = false; }; }, []);
  return <ScreenBody><Stats items={[{ icon: ScrollText, label: "Eventos de auditoria", value: rows.length }]} /><ErrorBox message={error} /><Panel title="Auditoria real"><ScadaTable rows={rows} columns={[
    { label: "Quando", render: (r) => <span className="num">{dateTime(r.created_at)}</span> },
    { label: "Usuário / origem", render: (r) => r.actor },
    { label: "Ação", render: (r) => r.action },
    { label: "Entidade", render: (r) => <b>{r.entity_type} / {r.entity_id}</b> },
    { label: "Detalhe", render: (r) => r.detail || "—" },
  ]} /></Panel></ScreenBody>;
}

export function ApiScreen() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; void rcApi.system.health().then((data) => { if (active) setHealth(data); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "API indisponível."); }); return () => { active = false; }; }, []);
  return <ScreenBody><Stats items={[
    { icon: Plug, label: "API", value: health?.ok ? "ONLINE" : "—", tone: health?.ok ? "text-online" : "text-muted-foreground" },
    { icon: Plug, label: "Versão", value: health?.version.apiVersion ?? "—" },
  ]} /><ErrorBox message={error} /><Panel title="API interna RC Geradores"><div className="space-y-2 text-[13px]">
    <p className="rounded-md border border-border p-3">Base URL: <span className="num">/api</span> — mesma origem do painel.</p>
    <p className="rounded-md border border-border p-3">Autenticação atual: sessão segura por cookie HttpOnly e RBAC.</p>
    <p className="rounded-md border border-border p-3">Documentação administrativa: <span className="num">/api/docs</span> quando habilitada no servidor.</p>
    <p className="rounded-md border border-border p-3">Tokens externos e rate limit são gerenciados pelos endpoints administrativos do backend; nenhum segredo é exibido nesta tela.</p>
  </div></Panel></ScreenBody>;
}

export function WebhooksScreen() {
  const { webhooks, toggleWebhook, refresh } = useScadaOps();
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState("alarme.criado");
  const [error, setError] = useState<string | null>(null);
  const onCreate = async (e: FormEvent) => { e.preventDefault(); try { await rcApi.webhooks.create({ url, event }); setUrl(""); setError(null); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar webhook."); } };
  return <ScreenBody><Stats items={[{ icon: Webhook, label: "Webhooks", value: webhooks.length }, { icon: Webhook, label: "Ativos", value: webhooks.filter((w) => w.status === "Ativo").length }]} /><ErrorBox message={error} /><Panel title="Cadastrar webhook"><form onSubmit={onCreate} className="grid gap-2 md:grid-cols-[1fr_220px_auto]"><input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><input required value={event} onChange={(e) => setEvent(e.target.value)} placeholder="evento" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Cadastrar</button></form></Panel><Panel title="Webhooks persistidos"><ScadaTable rows={webhooks} columns={[
    { label: "Evento", render: (r) => <b>{r.event}</b> },
    { label: "URL", render: (r) => <span className="num text-[11px]">{r.url}</span> },
    { label: "Status", render: (r) => <Pill tone={r.status === "Ativo" ? "ok" : "muted"}>{r.status}</Pill> },
    { label: "Falhas", render: (r) => r.failures ?? 0 },
    { label: "Controle", render: (r) => <ActionBtn onClick={() => toggleWebhook(r.id)}>{r.status === "Ativo" ? "Pausar" : "Ativar"}</ActionBtn> },
  ]} /></Panel></ScreenBody>;
}

function IntegrationPending({ icon: Icon, name, description }: { icon: typeof Mail; name: string; description: string }) {
  return <ScreenBody><Stats items={[{ icon: Icon, label: name, value: "NÃO CONFIGURADO" }]} /><Panel title={name}><div className="space-y-2 text-[13px]"><p>{description}</p><p className="rounded-md border border-alert/30 bg-alert/5 p-3 text-muted-foreground">Nenhum provedor/credencial foi configurado no backend. O sistema não mostra estado falso de conexão e não envia mensagens enquanto isso.</p></div></Panel></ScreenBody>;
}

export function EmailScreen() {
  return <IntegrationPending icon={Mail} name="E-mail" description="Integração SMTP/API para notificações, relatórios e alarmes." />;
}

export function WhatsAppScreen() {
  return <IntegrationPending icon={MessageCircle} name="WhatsApp" description="Integração oficial por provedor/API para notificações. Comandos industriais via chat permanecem desabilitados." />;
}

export function ErpScreen() {
  return <IntegrationPending icon={Plug} name="ERP / BMS / outros" description="Conectores específicos serão cadastrados com endpoint, autenticação, mapeamento e logs de entrega." />;
}
