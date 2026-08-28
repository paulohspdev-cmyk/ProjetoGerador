import { Bell, CalendarClock, Network, RefreshCcw, Router, Settings2, Signal } from "lucide-react";
import { type FormEvent, useState } from "react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

export function ControllersScreen() {
  const { generators } = useGenerators();
  const rows = generators.map((g) => ({
    id: g.id,
    gen: g.tag,
    model: g.controller,
    type: g.controllerType || "—",
    endpoint: g.ip || "—",
    rapidDevice: g.rapidDeviceNum ?? null,
    source: g.telemetrySource || "none",
    online: g.status === "online" || g.status === "alerta",
    error: g.lastError || "",
  }));
  return (
    <ScreenBody>
      <Stats items={[{ icon: Signal, label: "Controladoras cadastradas", value: rows.length }, { icon: Signal, label: "Com telemetria", value: rows.filter((c) => c.source === "rapid_scada").length, tone: "text-online" }]} />
      <Panel title="Inventário derivado do cadastro real">
        <ScadaTable rows={rows} columns={[
          { label: "Gerador", render: (r) => <b>{r.gen}</b> },
          { label: "Modelo", render: (r) => r.model },
          { label: "Fabricante/tipo", render: (r) => r.type },
          { label: "Endpoint", render: (r) => <span className="num">{r.endpoint}</span> },
          { label: "Rapid Device", render: (r) => <span className="num">{r.rapidDevice ?? "—"}</span> },
          { label: "Fonte", render: (r) => <Pill tone={r.source === "rapid_scada" ? "ok" : "muted"}>{r.source}</Pill> },
          { label: "Estado", render: (r) => <Tone tone={r.online ? "ok" : "err"}>{r.online ? "Online" : "Offline"}</Tone> },
        ]} />
      </Panel>
    </ScreenBody>
  );
}

function EmptyInventory({ title, text }: { title: string; text: string }) {
  return <Panel title={title}><p className="py-10 text-center text-sm text-muted-foreground">{text}</p></Panel>;
}

export function ModemsScreen() {
  return <ScreenBody><Stats items={[{ icon: Router, label: "Modems inventariados", value: 0 }]} /><EmptyInventory title="Modems celulares" text="Nenhum modem possui inventário de gestão cadastrado ainda. A conexão TCP reversa do gerador continua sendo monitorada pelo backend/Rapid sem fabricar IMEI, SIM ou RSSI." /></ScreenBody>;
}

export function GatewaysScreen() {
  return <ScreenBody><Stats items={[{ icon: Network, label: "Gateways inventariados", value: 0 }]} /><EmptyInventory title="Gateways de borda" text="Nenhum gateway de gestão foi cadastrado. Serão exibidos aqui somente equipamentos com registro real no backend." /></ScreenBody>;
}

export function ConnectivityScreen() {
  const { generators } = useGenerators();
  const rows = generators.map((g) => ({ id: g.id, tag: g.tag, site: g.site, endpoint: g.ip, source: g.telemetrySource || "none", status: g.status, error: g.lastError || "" }));
  return <ScreenBody><Stats items={[{ icon: Signal, label: "Geradores monitorados", value: rows.length }, { icon: Signal, label: "Telemetria ativa", value: rows.filter((r) => r.source === "rapid_scada" && r.status !== "offline").length, tone: "text-online" }]} /><Panel title="Conectividade comprovada"><ScadaTable rows={rows} columns={[
    { label: "Gerador", render: (r) => <b>{r.tag}</b> },
    { label: "Site", render: (r) => r.site || "—" },
    { label: "Endpoint", render: (r) => <span className="num">{r.endpoint || "—"}</span> },
    { label: "Fonte", render: (r) => r.source },
    { label: "Estado", render: (r) => <Pill tone={r.status === "online" ? "ok" : r.status === "alerta" ? "warn" : "err"}>{r.status}</Pill> },
    { label: "Erro", render: (r) => r.error || "—" },
  ]} /></Panel></ScreenBody>;
}

export function CommunicationScreen() {
  const { generators } = useGenerators();
  return <ScreenBody><Panel title="Comunicação industrial"><div className="space-y-3 text-[13px]"><p className="rounded-md border border-border p-3">O Rapid SCADA é o mestre industrial. Esta tela não liga/desliga protocolos fictícios.</p><div className="grid gap-2 sm:grid-cols-2">{generators.map((g) => <div key={g.id} className="rounded-md border border-border p-3"><div className="flex items-center justify-between gap-2"><b>{g.tag}</b><Pill tone={g.telemetrySource === "rapid_scada" ? "ok" : "muted"}>{g.telemetrySource || "none"}</Pill></div><p className="mt-1 text-[11px] text-muted-foreground">{g.controller}</p><p className="num mt-1 text-[11px]">{g.ip || "Endpoint não informado"}</p>{g.lastError && <p className="mt-1 text-[11px] text-offline">{g.lastError}</p>}</div>)}</div>{generators.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum gerador cadastrado.</p>}</div></Panel></ScreenBody>;
}

export function RulesScreen() {
  const { rules, toggleRule } = useScadaOps();
  return (
    <ScreenBody>
      <Stats items={[{ icon: Settings2, label: "Regras cadastradas", value: rules.length }, { icon: Settings2, label: "Marcadas ativas", value: rules.filter((r) => r.enabled).length }]} />
      <p className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-muted-foreground">Persistência de regras está ativa. O executor industrial permanece bloqueado até existir homologação de segurança por ação/controladora.</p>
      <Panel title="Regras de automação">
        <ScadaTable rows={rules} columns={[
          { label: "ID", render: (r) => <span className="num">{r.id}</span> },
          { label: "Regra", render: (r) => <b>{r.name}</b> },
          { label: "Gatilho", render: (r) => r.trigger },
          { label: "Ação", render: (r) => r.action },
          { label: "Homologação", render: (r) => <Pill tone={r.safetyState === "validated" ? "ok" : "warn"}>{r.safetyState || "draft"}</Pill> },
          { label: "Estado", render: (r) => <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "ON" : "OFF"}</Pill> },
          { label: "Controle", render: (r) => <ActionBtn onClick={() => toggleRule(r.id)}>{r.enabled ? "Desligar" : "Solicitar ativação"}</ActionBtn> },
        ]} />
      </Panel>
    </ScreenBody>
  );
}

export function ExerciseScreen() {
  const { agenda, addAgenda } = useScadaOps();
  const [when, setWhen] = useState("");
  const [site, setSite] = useState("");
  const exercises = agenda.filter((a) => a.kind === "exercise");
  const onCreate = (e: FormEvent) => { e.preventDefault(); addAgenda({ title: "Exercício de gerador", when, site }); setWhen(""); setSite(""); };
  return <ScreenBody><Stats items={[{ icon: RefreshCcw, label: "Exercícios planejados", value: exercises.length }]} /><Panel title="Planejar exercício"><form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input required value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Data/hora ou descrição" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site" className="h-9 rounded-md border border-input bg-background px-2 text-sm" /><button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Planejar</button></form><p className="mt-2 text-[11px] text-muted-foreground">Planejar não executa START, transferência ou disjuntores. Execução automática só será liberada quando os comandos necessários estiverem homologados.</p></Panel></ScreenBody>;
}

export function SchedulesScreen() {
  const { agenda } = useScadaOps();
  return <ScreenBody><Stats items={[{ icon: CalendarClock, label: "Itens de agenda", value: agenda.length }]} /><Panel title="Agendamentos persistidos"><ScadaTable rows={agenda} columns={[
    { label: "Descrição", render: (r) => <b>{r.title}</b> },
    { label: "Quando", render: (r) => <span className="num">{r.when}</span> },
    { label: "Site", render: (r) => r.site || "—" },
    { label: "Tipo", render: (r) => r.kind || "manual" },
    { label: "Estado", render: (r) => <Pill tone={r.enabled === false ? "muted" : "info"}>{r.enabled === false ? "Desabilitado" : "Planejado"}</Pill> },
  ]} /></Panel></ScreenBody>;
}

export function NotificationsScreen() {
  const { webhooks } = useScadaOps();
  return <ScreenBody><Stats items={[{ icon: Bell, label: "Webhooks ativos", value: webhooks.filter((w) => w.status === "Ativo").length }]} /><Panel title="Notificações"><div className="space-y-2 text-[13px]"><p className="rounded-md border border-border p-3">Webhooks cadastrados: {webhooks.length}. O despachante/retry será conectado ao backend antes de envios automáticos.</p><p className="rounded-md border border-border p-3">E-mail: não configurado.</p><p className="rounded-md border border-border p-3">WhatsApp: não configurado.</p><p className="rounded-md border border-border p-3">Push do navegador: não configurado.</p></div></Panel></ScreenBody>;
}

export function EscalationScreen() {
  return <ScreenBody><Panel title="Escalonamento"><p className="py-10 text-center text-sm text-muted-foreground">Nenhuma política de escalonamento cadastrada. Não há níveis ou tempos fictícios ativos.</p></Panel></ScreenBody>;
}
