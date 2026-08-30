import { Bell, Network, RefreshCcw, Router, Settings2, Signal } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import {
  rcApi,
  type AutomationRuleApi,
  type BridgeSession,
  type FieldDevice,
  type NotificationItem,
  type SystemDiagnostics,
} from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function errText(error: unknown) { return error instanceof Error ? error.message : "Falha na operação"; }
function dt(epoch?: number | null) { return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—"; }
function bytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function FieldInventory({ kind }: { kind: "modem" | "gateway" }) {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<FieldDevice[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [host, setHost] = useState("");
  const [serial, setSerial] = useState("");
  const [imei, setImei] = useState("");
  const [sim, setSim] = useState("");
  const [carrier, setCarrier] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setRows(await rcApi.fieldDevices.list(kind)); setError(""); }
    catch (error) { setError(errText(error)); }
  };
  useEffect(() => { void load(); }, [kind]);

  const reset = () => {
    setEditing(null); setName(""); setModel(""); setHost(""); setSerial(""); setImei(""); setSim(""); setCarrier("");
  };
  const beginEdit = (row: FieldDevice) => {
    setEditing(row.id); setName(row.name); setModel(row.model || ""); setHost(row.host || ""); setSerial(row.serial || ""); setImei(row.imei || ""); setSim(row.sim_iccid || ""); setCarrier(row.carrier || ""); setError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (editing) {
        await rcApi.fieldDevices.update(editing, { name: name.trim(), model: model.trim(), host: host.trim(), serial: serial.trim(), imei: imei.trim(), sim_iccid: sim.trim(), carrier: carrier.trim() });
      } else {
        await rcApi.fieldDevices.create({ kind, name: name.trim(), model: model.trim(), host: host.trim(), serial: serial.trim(), imei: imei.trim(), sim_iccid: sim.trim(), carrier: carrier.trim(), status: "unknown", metadata: {} });
      }
      reset(); await load();
    } catch (error) { setError(errText(error)); }
    finally { setBusy(false); }
  };
  const toggle = async (row: FieldDevice) => {
    try { await rcApi.fieldDevices.update(row.id, { active: !row.active }); await load(); }
    catch (error) { setError(errText(error)); }
  };
  const remove = async (row: FieldDevice) => {
    if (!window.confirm(`Excluir ${kind === "modem" ? "o modem" : "o gateway"} ${row.name}?`)) return;
    try { await rcApi.fieldDevices.remove(row.id); if (editing === row.id) reset(); await load(); }
    catch (error) { setError(errText(error)); }
  };
  const icon = kind === "modem" ? Router : Network;
  const label = kind === "modem" ? "Modems" : "Gateways";

  return <ScreenBody>
    <Stats items={[
      { icon, label: `${label} inventariados`, value: rows.length },
      { icon: Signal, label: "Cadastros ativos", value: rows.filter((row) => row.active).length, tone: "text-online" },
    ]} />
    <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">Este inventário contém somente dados administrativos informados. Estado físico da sessão TCP aparece em Equipamentos → Conectividade; IMEI, SIM, RSSI e conexão nunca são inferidos.</p>
    {error && <p className="text-[11px] text-offline">{error}</p>}
    {admin && <Panel title={editing ? `Editar ${kind}` : `Cadastrar ${kind}`}>
      <form onSubmit={save} className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Modelo real" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="IP/host cadastrado" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Serial" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        {kind === "modem" && <><input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><input value={sim} onChange={(e) => setSim(e.target.value)} placeholder="SIM / ICCID" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Operadora" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /></>}
        <div className="flex gap-1"><button disabled={busy} className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Salvando…" : editing ? "Salvar" : "Cadastrar"}</button>{editing && <button type="button" onClick={reset} className="h-9 rounded-md border border-border px-3 text-xs">Cancelar</button>}</div>
      </form>
    </Panel>}
    <Panel title={`${label} persistidos`}>
      {!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum equipamento cadastrado.</p> : <ScadaTable rows={rows} columns={[
        { label: "Nome", render: (r) => <b>{r.name}</b> },
        { label: "Modelo", render: (r) => r.model || "—" },
        { label: "Host cadastrado", render: (r) => <span className="num">{r.host || "—"}</span> },
        { label: "IMEI/Serial", render: (r) => r.imei || r.serial || "—" },
        { label: "SIM/Operadora", render: (r) => [r.sim_iccid, r.carrier].filter(Boolean).join(" · ") || "—" },
        { label: "Último dado cadastrado", render: (r) => r.last_seen ? <span className="num">{dt(r.last_seen)}</span> : "N/D" },
        { label: "Cadastro", render: (r) => <Pill tone={r.active ? "ok" : "muted"}>{r.active ? "Ativo" : "Inativo"}</Pill> },
        { label: "Ações", render: (r) => admin ? <span className="flex flex-wrap gap-1"><ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn><ActionBtn onClick={() => void toggle(r)}>{r.active ? "Desativar" : "Ativar"}</ActionBtn><ActionBtn tone="danger" onClick={() => void remove(r)}>Excluir</ActionBtn></span> : "—" },
      ]} />}
    </Panel>
  </ScreenBody>;
}

export function ModemsScreen() { return <FieldInventory kind="modem" />; }
export function GatewaysScreen() { return <FieldInventory kind="gateway" />; }

function sessionState(session: BridgeSession, fresh: boolean) {
  if (!fresh) return { label: "N/D (status desatualizado)", tone: "muted" as const };
  return session.connected ? { label: "TCP conectado", tone: "ok" as const } : { label: "Sem sessão TCP", tone: "err" as const };
}

export function ConnectivityScreen() {
  const { generators } = useGenerators();
  const [health, setHealth] = useState<SystemDiagnostics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const data = await rcApi.system.health(); if (active) { setHealth(data); setError(""); } }
      catch (err) { if (active) setError(errText(err)); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const fresh = health?.bridge.statusFresh === true;
  const available = health?.bridge.statusAvailable === true;
  const sessions = health?.bridge.sessions ?? [];
  const connected = fresh ? sessions.filter((session) => session.connected).length : 0;
  const reverseConfigured = generators.filter((g) => g.transport === "reverse_tcp").length;

  return <ScreenBody>
    <Stats items={[
      { icon: Signal, label: "Reverse TCP configurados", value: reverseConfigured },
      { icon: Signal, label: "Sessões físicas conectadas", value: fresh ? connected : "N/D", tone: fresh && connected ? "text-online" : undefined },
      { icon: Network, label: "Status bridge", value: fresh ? "ATUAL" : available ? "DESATUALIZADO" : "N/D", tone: fresh ? "text-online" : undefined },
      { icon: Signal, label: "Idade do status", value: health?.bridge.ageSeconds == null ? "N/D" : `${health.bridge.ageSeconds}s` },
    ]} />
    {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
    <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">A tabela física abaixo vem do processo da bridge. Se o arquivo de status estiver ausente ou vencido, o painel mostra N/D — nunca converte ausência de evidência em “offline”. Contadores são desde o início do processo atual da bridge.</p>
    <Panel title="Sessões físicas modem / DTU → gateway → bridge">
      {!sessions.length ? <p className="py-8 text-center text-sm text-muted-foreground">{available ? "Nenhuma porta reverse TCP publicada pela bridge." : "Status físico da bridge ainda não disponível nesta máquina."}</p> : <ScadaTable rows={sessions.map((session) => ({ ...session, id: String(session.remotePort) }))} columns={[
        { label: "Estado", render: (r) => { const state = sessionState(r, fresh); return <Pill tone={state.tone}>{state.label}</Pill>; } },
        { label: "Modem remoto", render: (r) => fresh && r.connected && r.remoteIp ? <span className="num">{r.remoteIp}{r.remotePeerPort ? `:${r.remotePeerPort}` : ""}</span> : "N/D" },
        { label: "Porta pública", render: (r) => <span className="num">{r.remotePort}</span> },
        { label: "Porta Rapid local", render: (r) => <span className="num">{r.localPort}</span> },
        { label: "Gerador / Unit / Device", render: (r) => r.generators.length ? <span>{r.generators.map((g) => <span key={`${g.generatorId}-${g.unit}`} className="block"><b>{g.tag}</b> · Unit {g.unit} · Device {g.rapidDeviceNum ?? "N/D"}</span>)}</span> : "Sem vínculo" },
        { label: "Conectado desde", render: (r) => fresh && r.connected ? <span className="num">{dt(r.connectedAt)}</span> : "—" },
        { label: "Último RX/TX", render: (r) => <span className="num text-[10px]">RX {dt(r.lastRxAt)}<br/>TX {dt(r.lastTxAt)}</span> },
        { label: "Bytes RX/TX", render: (r) => <span className="num">{bytes(r.bytesRx)} / {bytes(r.bytesTx)}</span> },
        { label: "Reconexões", render: (r) => <span className="num">{r.reconnections}</span> },
        { label: "Timeouts/erros", render: (r) => <Tone tone={r.timeouts || r.errors ? "warn" : "muted"}>{r.timeouts}/{r.errors}</Tone> },
      ]} />}
    </Panel>
    <Panel title="Estado de telemetria da aplicação">
      <ScadaTable rows={generators} columns={[
        { label: "Gerador", render: (r) => <b>{r.tag}</b> },
        { label: "Site", render: (r) => r.site || "—" },
        { label: "Transporte", render: (r) => r.transport || "—" },
        { label: "Endpoint cadastrado", render: (r) => <span className="num">{r.ip || "—"}</span> },
        { label: "Fonte", render: (r) => r.telemetrySource || "none" },
        { label: "Estado", render: (r) => <Pill tone={r.status === "online" ? "ok" : r.status === "alerta" ? "warn" : r.status === "nao_configurado" ? "muted" : "err"}>{r.status}</Pill> },
        { label: "Erro", render: (r) => r.lastError || "—" },
      ]} />
    </Panel>
  </ScreenBody>;
}

export function CommunicationScreen() {
  const { generators } = useGenerators();
  return <ScreenBody><Panel title="Comunicação industrial"><div className="space-y-3 text-[13px]"><p className="rounded-md border border-border p-3">Rapid SCADA é o mestre industrial. Reverse TCP usa bridge; Modbus TCP/RTU-over-TCP/serial são provisionados diretamente no Communicator.</p><div className="grid gap-2 sm:grid-cols-2">{generators.map((g) => <div key={g.id} className="rounded-md border border-border p-3"><div className="flex items-center justify-between gap-2"><b>{g.tag}</b><Pill tone={g.telemetrySource === "rapid_scada" ? "ok" : "muted"}>{g.telemetrySource || "none"}</Pill></div><p className="mt-1 text-[11px] text-muted-foreground">{g.controller}</p><p className="num mt-1 text-[11px]">{g.ip || "Endpoint não informado"}</p>{g.lastError && <p className="mt-1 text-[11px] text-offline">{g.lastError}</p>}</div>)}</div>{!generators.length && <p className="py-8 text-center text-muted-foreground">Nenhum gerador cadastrado.</p>}</div></Panel></ScreenBody>;
}

export function RulesScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const { generators } = useGenerators();
  const { rules, refresh } = useScadaOps();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("generator_offline");
  const [generator, setGenerator] = useState("");
  const [actionType, setActionType] = useState("notify");
  const [actionValue, setActionValue] = useState("panel");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!generator && generators.length) setGenerator(generators[0]!.tag); }, [generator, generators]);
  const reset = () => { setEditing(null); setName(""); setTriggerType("generator_offline"); setGenerator(generators[0]?.tag ?? ""); setActionType("notify"); setActionValue("panel"); };
  const parseRule = (row: AutomationRuleApi) => {
    const trigger = row.trigger.split(":", 2); const action = row.action.split(":", 2);
    setEditing(row.id); setName(row.name); setTriggerType(trigger[0] || "generator_offline"); setGenerator(trigger[1] || ""); setActionType(action[0] || "notify"); setActionValue(action[1] || "panel"); setError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!generator) { setError("Selecione um gerador."); return; }
    const trigger = `${triggerType}:${generator}`;
    const action = `${actionType}:${actionValue.trim() || (actionType === "notify" ? "panel" : "Inspeção")}`;
    try {
      if (editing) {
        const current = rules.find((rule) => rule.id === editing);
        if (current?.enabled) await rcApi.rules.enable(editing, false);
        await rcApi.rules.update(editing, { name: name.trim(), trigger, action });
      } else {
        await rcApi.rules.create({ name: name.trim(), trigger, action });
      }
      reset(); await refresh();
    } catch (err) { setError(errText(err)); }
  };
  const toggle = async (id: string) => {
    const current = rules.find((rule) => rule.id === id); if (!current) return;
    setBusy(id); setError("");
    try {
      if (!current.enabled && current.safetyState !== "approved_nonindustrial") await rcApi.rules.approve(id);
      await rcApi.rules.enable(id, !current.enabled); await refresh();
    } catch (err) { setError(errText(err)); } finally { setBusy(null); }
  };
  const remove = async (row: AutomationRuleApi) => {
    if (row.enabled) { setError("Desative a regra antes de excluir."); return; }
    if (!window.confirm(`Excluir a regra ${row.name}?`)) return;
    try { await rcApi.rules.remove(row.id); if (editing === row.id) reset(); await refresh(); }
    catch (err) { setError(errText(err)); }
  };

  return <ScreenBody>
    <Stats items={[{ icon: Settings2, label: "Regras cadastradas", value: rules.length }, { icon: Settings2, label: "Ativas", value: rules.filter((r) => r.enabled).length }]} />
    <p className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-muted-foreground">Motor fechado: somente generator_online / generator_offline / generator_alert → notify / work_order. START, STOP, MCB, GCB e paralelismo são rejeitados pelo backend deste motor.</p>
    {error && <p className="text-[11px] text-offline">{error}</p>}
    {admin && <Panel title={editing ? "Editar regra não industrial" : "Nova regra não industrial"}>
      <form onSubmit={save} className="grid gap-2 lg:grid-cols-5">
        <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da regra" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="generator_offline">Gerador offline</option><option value="generator_online">Gerador online</option><option value="generator_alert">Gerador em alerta</option></select>
        <select value={generator} onChange={(e) => setGenerator(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">{generators.map((g) => <option key={g.id} value={g.tag}>{g.tag}</option>)}</select>
        <div className="grid grid-cols-2 gap-1"><select value={actionType} onChange={(e) => { setActionType(e.target.value); setActionValue(e.target.value === "notify" ? "panel" : "Inspeção"); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="notify">Notificar</option><option value="work_order">Criar OS</option></select><input value={actionValue} onChange={(e) => setActionValue(e.target.value)} placeholder={actionType === "notify" ? "panel/email/..." : "Inspeção"} className="h-9 rounded-md border border-input bg-background px-2 text-sm" /></div>
        <div className="flex gap-1"><button className="h-9 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground">{editing ? "Salvar" : "Criar"}</button>{editing && <button type="button" onClick={reset} className="h-9 rounded-md border border-border px-3 text-xs">Cancelar</button>}</div>
      </form>
    </Panel>}
    <Panel title="Regras de automação">{!rules.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma regra cadastrada.</p> : <ScadaTable rows={rules} columns={[
      { label: "Regra", render: (r) => <b>{r.name}</b> }, { label: "Gatilho", render: (r) => <span className="num text-[11px]">{r.trigger}</span> }, { label: "Ação", render: (r) => <span className="num text-[11px]">{r.action}</span> },
      { label: "Homologação", render: (r) => <Pill tone={r.safetyState === "approved_nonindustrial" ? "ok" : "warn"}>{r.safetyState || "draft"}</Pill> },
      { label: "Estado", render: (r) => <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "ON" : "OFF"}</Pill> },
      { label: "Ações", render: (r) => admin ? <span className="flex flex-wrap gap-1"><ActionBtn disabled={busy === r.id} onClick={() => void toggle(r.id)}>{busy === r.id ? "Aguarde" : r.enabled ? "Desligar" : "Aprovar e ligar"}</ActionBtn><ActionBtn onClick={() => parseRule(r)}>Editar</ActionBtn><ActionBtn tone="danger" disabled={r.enabled} onClick={() => void remove(r)}>Excluir</ActionBtn></span> : "—" },
    ]} />}</Panel>
  </ScreenBody>;
}

export function ExerciseScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const { agenda, addAgenda, refresh } = useScadaOps();
  const [when, setWhen] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState("");
  const exercises = useMemo(() => agenda.filter((item) => (item.title || "").toLowerCase().includes("exercício")), [agenda]);
  const onCreate = (e: FormEvent) => { e.preventDefault(); addAgenda({ title: "Exercício de gerador (planejamento)", when, site }); setWhen(""); setSite(""); };
  const toggle = async (id: string, enabled: boolean) => { try { await rcApi.agenda.update(id, { enabled }); await refresh(); } catch (err) { setError(errText(err)); } };
  const remove = async (id: string) => { if (!window.confirm("Excluir este planejamento de exercício?")) return; try { await rcApi.agenda.remove(id); await refresh(); } catch (err) { setError(errText(err)); } };
  return <ScreenBody>
    <Stats items={[{ icon: RefreshCcw, label: "Exercícios planejados", value: exercises.length }, { icon: RefreshCcw, label: "Planos ativos", value: exercises.filter((item) => item.enabled !== false).length }]} />
    <p className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-muted-foreground">Este módulo é agenda/planejamento. Não existe execução automática de START, transferência, MCB, GCB ou paralelismo por esta tela.</p>
    {error && <p className="text-[11px] text-offline">{error}</p>}
    {can("create") && <Panel title="Planejar exercício"><form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input required value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Data/hora ou descrição" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Planejar</button></form></Panel>}
    <Panel title="Planejamentos"><ScadaTable rows={exercises} columns={[
      { label: "Quando", render: (r) => <span className="num">{r.when}</span> }, { label: "Site", render: (r) => r.site || "—" }, { label: "Estado", render: (r) => <Pill tone={r.enabled === false ? "muted" : "ok"}>{r.enabled === false ? "Cancelado" : "Planejado"}</Pill> },
      { label: "Ações", render: (r) => can("edit") ? <span className="flex gap-1"><ActionBtn onClick={() => void toggle(r.id, r.enabled === false)}>{r.enabled === false ? "Reativar" : "Cancelar"}</ActionBtn>{admin && <ActionBtn tone="danger" onClick={() => void remove(r.id)}>Excluir</ActionBtn>}</span> : "—" },
    ]} /></Panel>
  </ScreenBody>;
}

export function NotificationsScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");
  const load = async () => { try { setRows(await rcApi.notifications.list()); setError(""); } catch (err) { setError(errText(err)); } };
  useEffect(() => { void load(); }, []);
  const testPanel = async () => { try { await rcApi.notifications.test("panel"); await load(); } catch (err) { setError(errText(err)); } };
  const process = async () => { try { await rcApi.notifications.process(); await load(); } catch (err) { setError(errText(err)); } };
  return <ScreenBody>
    <Stats items={[{ icon: Bell, label: "Notificações", value: rows.length }, { icon: Bell, label: "Pendentes", value: rows.filter((r) => r.status === "queued" || r.status === "retry").length }]} />
    <Panel title="Fila real de notificações" actions={<span className="flex gap-1"><ActionBtn onClick={() => void testPanel()}>Testar painel</ActionBtn>{admin && <ActionBtn onClick={() => void process()}>Processar fila</ActionBtn>}</span>}>
      {error && <p className="text-[11px] text-offline">{error}</p>}
      {!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Fila vazia. E-mail/WhatsApp só enviam quando credenciais reais forem configuradas.</p> : <ScadaTable rows={rows.map((r) => ({ ...r, id: String(r.id) }))} columns={[
        { label: "Evento", render: (r) => <b>{r.event_type}</b> }, { label: "Canal", render: (r) => r.channel }, { label: "Destino", render: (r) => r.destination || "—" },
        { label: "Estado", render: (r) => <Pill tone={r.status === "sent" ? "ok" : r.status === "failed" ? "err" : "warn"}>{r.status}</Pill> }, { label: "Tentativas", render: (r) => `${r.attempts}/${r.max_attempts}` },
        { label: "Último erro", render: (r) => r.last_error || "—" },
      ]} />}
    </Panel>
  </ScreenBody>;
}
