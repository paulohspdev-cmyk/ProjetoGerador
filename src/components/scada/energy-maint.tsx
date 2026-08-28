import { type FormEvent, useState } from "react";
import { AlertTriangle, ArrowLeftRight, BatteryCharging, CalendarDays, CheckCircle2, ClipboardList, Factory, Fan, Fuel, Gauge, GitMerge, HardHat, Percent, Power, Timer, TrendingUp, UtilityPole, Waves } from "lucide-react";

import { fmt, spark } from "@/data/scada";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone, Trend } from "./kit";

function EnergyBlock({
  title,
  kpis,
  chart,
  rows,
}: {
  title: string;
  kpis: Parameters<typeof Stats>[0]["items"];
  chart: { data: ReturnType<typeof spark>; unit: string; color?: string };
  rows: Array<{ id: string; gen: string; a: string; b: string; c: string }>;
}) {
  return (
    <ScreenBody>
      <Stats items={kpis} />
      <Panel title={title}>
        <Trend data={chart.data} unit={chart.unit} color={chart.color} />
      </Panel>
      <Panel title="Por gerador">
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.gen}</b> },
            { label: "Principal", render: (r) => <span className="num">{r.a}</span> },
            { label: "Secundário", render: (r) => <span className="num">{r.b}</span> },
            { label: "Estado", render: (r) => r.c },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function EnergyRede() {
  const { generators } = useGenerators();
  return (
    <EnergyBlock
      title="Tensão da rede (média L-N)"
      kpis={[
        { icon: UtilityPole, label: "Tensão L1", value: "220 V", tone: "text-online" },
        { icon: Waves, label: "Frequência", value: "60,0 Hz", tone: "text-online" },
        { icon: Power, label: "MCB fechados", value: String(generators.filter((g) => g.mcb).length) },
      ]}
      chart={{ data: spark(1, 24, 219, 4), unit: "V" }}
      rows={generators.map((g) => ({
        id: g.id,
        gen: g.tag,
        a: `${g.mains.l1} V`,
        b: `${g.mains.l12} V`,
        c: g.mcb ? "Rede acoplada" : "Isolada",
      }))}
    />
  );
}

export function EnergyGens() {
  const { generators } = useGenerators();
  return (
    <EnergyBlock
      title="Potência dos geradores"
      kpis={[
        { icon: Gauge, label: "kW total", value: `${generators.reduce((s, g) => s + g.load, 0)}`, tone: "text-online" },
        { icon: Power, label: "GCB fechados", value: String(generators.filter((g) => g.gcb).length) },
        { icon: Fan, label: "RPM médio", value: String(Math.round(generators.reduce((s, g) => s + g.rpm, 0) / generators.length)) },
      ]}
      chart={{ data: spark(4, 24, 160, 50), unit: "kW", color: "var(--chart-2)" }}
      rows={generators.map((g) => ({
        id: g.id,
        gen: g.tag,
        a: `${g.load} kW`,
        b: `${fmt(g.frequency ?? 0)} Hz`,
        c: g.gcb ? "Gerador na barra" : "Aberto",
      }))}
    />
  );
}

export function EnergyLoad() {
  const { generators } = useGenerators();
  return (
    <EnergyBlock
      title="Carga do consumidor"
      kpis={[
        { icon: Factory, label: "Carga", value: `${generators.reduce((s, g) => s + g.load, 0)} kW`, tone: "text-online" },
        { icon: Percent, label: "Fator de p", value: "0,92" },
        { icon: TrendingUp, label: "Pico 24 h", value: "612 kW", tone: "text-alert" },
      ]}
      chart={{ data: spark(6, 24, 240, 90), unit: "kW", color: "var(--alert)" }}
      rows={generators.map((g) => ({
        id: g.id,
        gen: g.tag,
        a: `${g.load} kW`,
        b: g.site,
        c: g.load > 400 ? "Alta" : "Normal",
      }))}
    />
  );
}

export function EnergyTransfer() {
  const { generators } = useGenerators();
  return (
    <EnergyBlock
      title="Transferência rede / gerador"
      kpis={[
        { icon: UtilityPole, label: "Em rede", value: String(generators.filter((g) => g.mcb && !g.gcb).length) },
        { icon: Fan, label: "Em gerador", value: String(generators.filter((g) => g.gcb).length), tone: "text-online" },
        { icon: ArrowLeftRight, label: "Transição", value: "0" },
      ]}
      chart={{ data: spark(9, 24, 1, 1), unit: "" }}
      rows={generators.map((g) => ({
        id: g.id,
        gen: g.tag,
        a: g.mcb ? "MCB I" : "MCB O",
        b: g.gcb ? "GCB I" : "GCB O",
        c: g.mcb && g.gcb ? "Paralelo" : g.gcb ? "Ilha" : g.mcb ? "Rede" : "Aberto",
      }))}
    />
  );
}

export function EnergyParallel() {
  const { generators } = useGenerators();
  const n = generators.filter((g) => g.mcb && g.gcb).length;
  return (
    <EnergyBlock
      title="Paralelismo"
      kpis={[
        { icon: GitMerge, label: "PRLL ON", value: String(n), tone: n ? "text-online" : "text-muted-foreground" },
        { icon: CheckCircle2, label: "Sync OK", value: n ? "Sim" : "—" },
        { icon: Waves, label: "Desvio Hz", value: "0,04" },
      ]}
      chart={{ data: spark(11, 24, 60, 0.2), unit: "Hz" }}
      rows={generators.map((g) => ({
        id: g.id,
        gen: g.tag,
        a: `${fmt(g.frequency ?? 0)} Hz`,
        b: `${g.rpm} rpm`,
        c: g.mcb && g.gcb ? "PRLL ON" : "PRLL OFF",
      }))}
    />
  );
}

export function MaintenanceScreen() {
  const { generators } = useGenerators();
  const { workOrders, setWorkOrderStatus, addWorkOrder } = useScadaOps();
  const [gen, setGen] = useState(generators[0]?.tag ?? "");
  const [type, setType] = useState("Preventiva");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    const g = generators.find((x) => x.tag === gen);
    addWorkOrder({ gen, type, site: g?.site ?? "" });
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: ClipboardList, label: "OS abertas", value: workOrders.filter((w) => w.status !== "Concluída").length },
          { icon: AlertTriangle, label: "Urgentes", value: workOrders.filter((w) => w.status === "Urgente").length, tone: "text-alert" },
          { icon: HardHat, label: "Em campo", value: workOrders.filter((w) => w.status === "Em andamento").length },
        ]}
      />
      <Panel title="Nova ordem de serviço">
        <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] font-semibold text-muted-foreground">
            Gerador
            <select
              value={gen}
              onChange={(e) => setGen(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {generators.map((g) => (
                <option key={g.id} value={g.tag}>
                  {g.tag}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Tipo
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option>Preventiva</option>
              <option>Corretiva</option>
              <option>Inspeção</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90">
              Abrir OS
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Ordens de serviço">
        <ScadaTable
          rows={workOrders}
          columns={[
            { label: "OS", render: (r) => <span className="num">{r.id}</span> },
            { label: "Gerador", render: (r) => <b>{r.gen}</b> },
            { label: "Tipo", render: (r) => r.type },
            { label: "Horas p/ manut.", render: (r) => <span className="num">{r.due} h</span> },
            { label: "Técnico", render: (r) => r.tech, hide: "hidden md:table-cell" },
            {
              label: "Status",
              render: (r) => (
                <Pill tone={r.status === "Urgente" ? "err" : r.status === "Em andamento" ? "warn" : r.status === "Concluída" ? "ok" : "info"}>
                  {r.status}
                </Pill>
              ),
            },
            {
              label: "Ações",
              render: (r) =>
                r.status === "Concluída" ? (
                  "—"
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {r.status !== "Em andamento" && (
                      <ActionBtn onClick={() => setWorkOrderStatus(r.id, "Em andamento")}>Iniciar</ActionBtn>
                    )}
                    <ActionBtn tone="ok" onClick={() => setWorkOrderStatus(r.id, "Concluída")}>
                      Concluir
                    </ActionBtn>
                  </span>
                ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function FuelScreen() {
  const { generators } = useGenerators();
  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Fuel, label: "Nível médio", value: `${Math.round(generators.reduce((s, g) => s + g.fuelLevel, 0) / generators.length)} %` },
          { icon: Fuel, label: "Abaixo de 40%", value: String(generators.filter((g) => g.fuelLevel < 40).length), tone: "text-alert" },
        ]}
      />
      <Panel title="Tanques / geradores">
        <ScadaTable
          rows={generators.map((g) => ({ id: g.id, ...g }))}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.tag}</b> },
            { label: "Site", render: (r) => r.site },
            { label: "Nível", render: (r) => <span className="num">{r.fuelLevel} %</span> },
            {
              label: "Estado",
              render: (r) => <Tone tone={r.fuelLevel < 40 ? "warn" : "ok"}>{r.fuelLevel < 40 ? "Reabastecer" : "OK"}</Tone>,
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function BatteriesScreen() {
  const { generators } = useGenerators();
  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: BatteryCharging, label: "Média", value: `${fmt(generators.reduce((s, g) => s + (g.battery ?? 0), 0) / generators.length)} V` },
          { icon: BatteryCharging, label: "< 12 V", value: String(generators.filter((g) => (g.battery ?? 0) < 12 && g.battery).length), tone: "text-alert" },
        ]}
      />
      <Panel title="Bancos de baterias">
        <ScadaTable
          rows={generators.map((g) => ({ id: g.id, ...g }))}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.tag}</b> },
            { label: "Tensão", render: (r) => <span className="num">{r.battery ? `${fmt(r.battery)} V` : "—"}</span> },
            {
              label: "Saúde",
              render: (r) => (
                <Tone tone={!r.battery ? "muted" : r.battery < 12 ? "warn" : "ok"}>
                  {!r.battery ? "N/D" : r.battery < 12 ? "Baixa" : "Normal"}
                </Tone>
              ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function HourmetersScreen() {
  const { generators } = useGenerators();
  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Timer, label: "Horas totais", value: fmt(generators.reduce((s, g) => s + g.runHours, 0), 0) },
          { icon: Timer, label: "Manut. < 80 h", value: String(generators.filter((g) => g.maintenance < 80).length), tone: "text-alert" },
        ]}
      />
      <Panel title="Horímetros">
        <ScadaTable
          rows={generators.map((g) => ({ id: g.id, ...g }))}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.tag}</b> },
            { label: "Horas trabalhadas", render: (r) => <span className="num">{fmt(r.runHours)} h</span> },
            { label: "Horas p/ manutenção", render: (r) => <span className="num">{r.maintenance} h</span> },
            {
              label: "Prioridade",
              render: (r) => <Pill tone={r.maintenance < 80 ? "warn" : "ok"}>{r.maintenance < 80 ? "Próxima" : "OK"}</Pill>,
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function AgendaScreen() {
  const { agenda, addAgenda } = useScadaOps();
  const { generators } = useGenerators();
  const sites = [...new Set(generators.map((g) => g.site))];
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [site, setSite] = useState(sites[0] ?? "");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    addAgenda({ title, when, site });
    setTitle("");
    setWhen("");
  };

  return (
    <ScreenBody>
      <Stats items={[{ icon: CalendarDays, label: "Compromissos", value: agenda.length }]} />
      <Panel title="Novo compromisso">
        <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-4">
          <label className="text-[11px] font-semibold text-muted-foreground sm:col-span-2">
            Atividade
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Quando
            <input
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              placeholder="28/08 09:00"
              required
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Local
            <select
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {sites.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-4">
            <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              Agendar
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Agenda operacional">
        <ScadaTable
          rows={agenda}
          columns={[
            { label: "Quando", render: (r) => <span className="num">{r.when}</span> },
            { label: "Atividade", render: (r) => <b>{r.title}</b> },
            { label: "Local", render: (r) => r.site },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
