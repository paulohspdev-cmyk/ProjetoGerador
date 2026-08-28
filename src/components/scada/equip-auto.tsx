import { Bell, CalendarClock, Network, RefreshCcw, Router, Settings2, Signal } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type FieldDevice, type NotificationItem, type SchedulerJob } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function errText(error: unknown) { return error instanceof Error ? error.message : "Falha na operação"; }

export function ControllersScreen() {
  const { generators } = useGenerators();
  const rows = generators.map((g) => ({
    id: g.id, gen: g.tag, model: g.controller, type: g.controllerType || "—",
    endpoint: g.ip || "—", rapidDevice: g.rapidDeviceNum ?? null,
    source: g.telemetrySource || "none", online: g.status === "online" || g.status === "alerta",
    error: g.lastError || "",
  }));
  return (
    <ScreenBody>
      <Stats items={[{ icon: Signal, label: "Controladoras cadastradas", value: rows.length }, { icon: Signal, label: "Com telemetria", value: rows.filter((c) => c.source === "rapid_scada").length, tone: "text-online" }]} />
      <Panel title="Inventário derivado do cadastro real">
        {!rows.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma controladora cadastrada.</p>}
        {!!rows.length && <ScadaTable rows={rows} columns={[
          { label: "Gerador", render: (r) => <b>{r.gen}</b> },
          { label: "Modelo", render: (r) => r.model },
          { label: "Fabricante/tipo", render: (r) => r.type },
          { label: "Endpoint", render: (r) => <span className="num">{r.endpoint}</span> },
          { label: "Rapid Device", render: (r) => <span className="num">{r.rapidDevice ?? "—"}</span> },
          { label: "Fonte", render: (r) => <Pill tone={r.source === "rapid_scada" ? "ok" : "muted"}>{r.source}</Pill> },
          { label: "Estado", render: (r) => <Tone tone={r.online ? "ok" : "err"}>{r.online ? "Online" : "Offline"}</Tone> },
        ]} />}
      </Panel>
    </ScreenBody>
  );
}

function FieldInventory({ kind }: { kind: "modem" | "gateway" }) {
  const [rows, setRows] = useState<FieldDevice[]>([]);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [host, setHost] = useState("");
  const [error, setError] = useState("");
  const load = () => rcApi.fieldDevices.list(kind).then(setRows).catch((e) => setError(errText(e)));
  useEffect(() => { void load(); }, [kind]);
  const create = (e: FormEvent) => {
    e.preventDefault();
    void rcApi.fieldDevices.create({
      kind, name, model, host, serial: "", imei: "", sim_iccid: "", carrier: "",
      status: "unknown", metadata: {},
    }).then(() => { setName(""); setModel(""); setHost(""); setError(""); return load(); }).catch((e) => setError(errText(e)));
  };
  const icon = kind === "modem" ? Router : Network;
  const label = kind === "modem" ? "Modems" : "Gateways";
  return <ScreenBody>
    <Stats items={[{ icon, label: `${label} inventariados`, value: rows.length }, { icon: Signal, label: "Ativos", value: rows.filter((r) => r.active).length, tone: "text-online" }]} />
    <Panel title={`Cadastrar ${kind === "modem" ? "modem" : "gateway"}`}>
      <form onSubmit={create} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Modelo real" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="IP/host, se houver" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Cadastrar</button>
      </form>
      {error && <p className="mt-2 text-[11px] text-offline">{error}</p>}
    </Panel>
    <Panel title={`${label} reais`}>
      {!rows.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum equipamento cadastrado. IMEI, SIM, RSSI e modelo nunca são inferidos.</p>}
      {!!rows.length && <ScadaTable rows={rows} columns={[
        { label: "Nome", render: (r) => <b>{r.name}</b> },
        { label: "Modelo", render: (r) => r.model || "—" },
        { label: "Host", render: (r) => <span className="num">{r.host || "—"}</span> },
        { label: "IMEI/Serial", render: (r) => r.imei || r.serial || "—" },
        { label: "RSSI", render: (r) => r.rssi == null ? "N/D" : <span className="num">{r.rssi} dBm</span> },
        { label: "Estado", render: (r) => <Pill tone={r.status === "online" ? "ok" : r.status === "offline" ? "err" : "muted"}>{r.status}</Pill> },
      ]} />}
    </Panel>
  </ScreenBody>;
}

export function ModemsScreen() { return <FieldInventory kind="modem" />; }
export function GatewaysScreen() { return <FieldInventory kind="gateway" />; }

export function ConnectivityScreen() {
  const { generators } = useGenerators();
  const rows = generators.map((g) => ({ id: g.id, tag: g.tag, site: g.site, endpoint: g.ip, source: g.telemetrySource || "none", status: g.status, error: g.lastError || "" }));
  return <ScreenBody><Stats items={[{ icon: Signal, label: "Geradores monitorados", value: rows.length }, { icon: Signal, label: "Telemetria ativa", value: rows.filter((r) => r.source === "rapid_scada" && r.status !== "offline").length, tone: "text-online" }]} /><Panel title="Conectividade comprovada">{!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum gerador cadastrado.</p> : <ScadaTable rows={rows} columns={[
    { label: "Gerador", render: (r) => <b>{r.tag}</b> }, { label: "Site", render: (r) => r.site || "—" },
    { label: "Endpoint", render: (r) => <span className="num">{r.endpoint || "—"}</span> }, { label: "Fonte", render: (r) => r.source },
    { label: "Estado", render: (r) => <Pill tone={r.status === "online" ? "ok" : r.status === "alerta" ? "warn" : "err"}>{r.status}</Pill> },
    { label: "Erro", render: (r) => r.error || "—" },
  ]} />}</Panel></ScreenBody>;
}

export function CommunicationScreen() {
  const { generators } = useGenerators();
  return <ScreenBody><Panel title="Comunicação industrial"><div className="space-y-3 text-[13px]"><p className="rounded-md border border-border p-3">Rapid SCADA é o mestre industrial. Reverse TCP usa bridge; Modbus TCP/RTU-over-TCP/serial são provisionados diretamente no Communicator.</p><div className="grid gap-2 sm:grid-cols-2">{generators.map((g) => <div key={g.id} className="rounded-md border border-border p-3"><div className="flex items-center justify-between gap-2"><b>{g.tag}</b><Pill tone={g.telemetrySource === "rapid_scada" ? "ok" : "muted"}>{g.telemetrySource || "none"}</Pill></div><p className="mt-1 text-[11px] text-muted-foreground">{g.controller}</p><p className="num mt-1 text-[11px]">{g.ip || "Endpoint não informado"}</p>{g.lastError && <p className="mt-1 text-[11px] text-offline">{g.lastError}</p>}</div>)}</div>{!generators.length && <p className="py-8 text-center text-muted-foreground">Nenhum gerador cadastrado.</p>}</div></Panel></ScreenBody>;
}

export function RulesScreen() {
  const { rules, refresh } = useScadaOps();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const toggle = async (id: string) => {
    const current = rules.find((r) => r.id === id); if (!current) return;
    setBusy(id); setError("");
    try {
      if (!current.enabled && current.safetyState !== "approved_nonindustrial") await rcApi.rules.approve(id);
      await rcApi.rules.enable(id, !current.enabled);
      await refresh();
    } catch (e) { setError(errText(e)); } finally { setBusy(null); }
  };
  return <ScreenBody>
    <Stats items={[{ icon: Settings2, label: "Regras cadastradas", value: rules.length }, { icon: Settings2, label: "Ativas", value: rules.filter((r) => r.enabled).length }]} />
    <p className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-muted-foreground">O motor aceita somente generator_online/offline/alert → notify/work_order. START/STOP/MCB/GCB/paralelismo são recusados.</p>
    {error && <p className="text-[11px] text-offline">{error}</p>}
    <Panel title="Regras de automação">{!rules.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma regra cadastrada.</p> : <ScadaTable rows={rules} columns={[
      { label: "Regra", render: (r) => <b>{r.name}</b> }, { label: "Gatilho", render: (r) => r.trigger }, { label: "Ação", render: (r) => r.action },
      { label: "Homologação", render: (r) => <Pill tone={r.safetyState === "approved_nonindustrial" ? "ok" : "warn"}>{r.safetyState || "draft"}</Pill> },
      { label: "Estado", render: (r) => <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "ON" : "OFF"}</Pill> },
      { label: "Controle", render: (r) => <ActionBtn disabled={busy === r.id} onClick={() => void toggle(r.id)}>{busy === r.id ? "Aguarde" : r.enabled ? "Desligar" : "Aprovar e ligar"}</ActionBtn> },
    ]} />}</Panel>
  </ScreenBody>;
}

export function ExerciseScreen() {
  const { agenda, addAgenda } = useScadaOps();
  const [when, setWhen] = useState(""); const [site, setSite] = useState("");
  const exercises = agenda.filter((a) => (a.title || "").toLowerCase().includes("exercício"));
  const onCreate = (e: FormEvent) => { e.preventDefault(); addAgenda({ title: "Exercício de gerador (planejamento)", when, site }); setWhen(""); setSite(""); };
  return <ScreenBody><Stats items={[{ icon: RefreshCcw, label: "Exercícios planejados", value: exercises.length }]} /><Panel title="Planejar exercício"><form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input required value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Data/hora ou descrição" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Planejar</button></form><p className="mt-2 text-[11px] text-muted-foreground">Este módulo apenas planeja. Não executa partida, transferência ou disjuntores.</p></Panel></ScreenBody>;
}

export function SchedulesScreen() {
  const [rows, setRows] = useState<SchedulerJob[]>([]); const [error, setError] = useState("");
  useEffect(() => { rcApi.scheduler.list().then(setRows).catch((e) => setError(errText(e))); }, []);
  return <ScreenBody><Stats items={[{ icon: CalendarClock, label: "Jobs persistentes", value: rows.length }]} /><Panel title="Scheduler não industrial">{error && <p className="text-offline text-[11px]">{error}</p>}{!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum job. O scheduler aceita backup, relatório e notificação; comandos industriais são proibidos.</p> : <ScadaTable rows={rows} columns={[
    { label: "Nome", render: (r) => <b>{r.name}</b> }, { label: "Tipo", render: (r) => r.kind }, { label: "Intervalo", render: (r) => <span className="num">{r.interval_seconds}s</span> },
    { label: "Próxima execução", render: (r) => new Date(r.next_run * 1000).toLocaleString("pt-BR") }, { label: "Estado", render: (r) => <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "Ativo" : "Pausado"}</Pill> },
  ]} />}</Panel></ScreenBody>;
}

export function NotificationsScreen() {
  const [rows, setRows] = useState<NotificationItem[]>([]); const [error, setError] = useState("");
  const load = () => rcApi.notifications.list().then(setRows).catch((e) => setError(errText(e)));
  useEffect(() => { void load(); }, []);
  const testPanel = () => rcApi.notifications.test("panel").then(load).catch((e) => setError(errText(e)));
  return <ScreenBody><Stats items={[{ icon: Bell, label: "Notificações", value: rows.length }, { icon: Bell, label: "Pendentes", value: rows.filter((r) => r.status === "queued" || r.status === "retry").length }]} /><Panel title="Fila real de notificações" actions={<ActionBtn onClick={() => void testPanel()}>Testar painel</ActionBtn>}>{error && <p className="text-[11px] text-offline">{error}</p>}{!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">Fila vazia. E-mail/WhatsApp só enviam quando credenciais reais forem configuradas.</p> : <ScadaTable rows={rows.map((r) => ({ ...r, id: String(r.id) }))} columns={[
    { label: "Evento", render: (r) => <b>{r.event_type}</b> }, { label: "Canal", render: (r) => r.channel }, { label: "Destino", render: (r) => r.destination || "—" },
    { label: "Estado", render: (r) => <Pill tone={r.status === "sent" ? "ok" : r.status === "failed" ? "err" : "warn"}>{r.status}</Pill> }, { label: "Tentativas", render: (r) => `${r.attempts}/${r.max_attempts}` },
  ]} />}</Panel></ScreenBody>;
}

export function EscalationScreen() {
  return <ScreenBody><Panel title="Escalonamento"><p className="py-10 text-center text-sm text-muted-foreground">Nenhuma política de escalonamento cadastrada. O sistema não cria níveis ou tempos fictícios.</p></Panel></ScreenBody>;
}
