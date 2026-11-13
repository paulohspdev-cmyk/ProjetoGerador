import { type FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  ClipboardList,
  Factory,
  Fan,
  Gauge,
  GitMerge,
  HardHat,
  Power,
  UtilityPole,
  Waves,
} from "lucide-react";

import type { Generator } from "@/data/generators";
import { fmt } from "@/data/scada";
import { useGenerators } from "@/features/generators/GeneratorsProvider";
import { metricNumber } from "@/features/generators/generator-metrics";
import { isPositiveMeasurement } from "@/features/generators/generator-presence";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

function hasMetric(g: Generator, key: string) {
  return !g.telemetryStale && (g.definedMetrics ?? g.availableMetrics ?? []).includes(key);
}

function breakerClosed(g: Generator, key: "mcb_closed" | "gcb_closed"): boolean | null {
  const measured = metricNumber(g, key, undefined);
  if (measured === 1) return true;
  if (measured === 0) return false;
  return null;
}

function breakerLabel(value: boolean | null, name: "MCB" | "GCB") {
  return value == null ? `${name} N/D` : `${name} ${value ? "fechado" : "aberto"}`;
}

function supplyState(g: Generator) {
  const mcb = breakerClosed(g, "mcb_closed");
  const gcb = breakerClosed(g, "gcb_closed");
  if (mcb == null || gcb == null) return "Alimentação não confirmada";
  if (mcb && gcb) return "Ambos fechados — verificar topologia";
  if (mcb) return "MCB fechado; GCB aberto";
  if (gcb) return "GCB fechado; MCB aberto";
  return "Ambos abertos";
}


function metricUnit(g: Generator, key: string, fallback = "") {
  const unit = g.metricUnits?.[key];
  return typeof unit === "string" && unit.trim() ? unit.trim() : fallback;
}

function valueOrDash(
  g: Generator,
  key: string,
  value: number | null | undefined,
  unit = "",
  digits = 1,
) {
  const numeric = metricNumber(g, key, value);
  if (numeric == null) return "—";
  const resolvedUnit = metricUnit(g, key, unit);
  return `${fmt(numeric, digits)}${resolvedUnit ? ` ${resolvedUnit}` : ""}`;
}

function supportedCount(generators: Generator[], metric: string) {
  return generators.filter((g) => hasMetric(g, metric)).length;
}

function EnergyTable({
  rows,
  principal = "Principal",
  secondary = "Secundário",
  state = "Estado",
}: {
  rows: Array<{ id: string; gen: string; a: string; b: string; c: string }>;
  principal?: string;
  secondary?: string;
  state?: string;
}) {
  return (
    <Panel title="Por gerador">
      <ScadaTable
        rows={rows}
        columns={[
          { label: "Gerador", render: (r) => <b>{r.gen}</b> },
          { label: principal, render: (r) => <span className="num">{r.a}</span> },
          { label: secondary, render: (r) => <span className="num">{r.b}</span> },
          { label: state, render: (r) => r.c },
        ]}
      />
    </Panel>
  );
}

export function EnergyRede() {
  const { generators } = useGenerators();
  const mainsVoltage = generators.filter((g) => g.powerTopology !== "genset_only" && hasMetric(g, "mains_voltage_l1"));
  const mainsFreq = generators.filter((g) => g.powerTopology !== "genset_only" && hasMetric(g, "mains_frequency"));
  const mcb = generators.filter((g) => g.powerTopology !== "genset_only" && breakerClosed(g, "mcb_closed") != null);
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: UtilityPole,
            label: "Tensão de rede disponível",
            value: `${mainsVoltage.length}/${generators.length}`,
          },
          {
            icon: Waves,
            label: "Frequência de rede disponível",
            value: `${mainsFreq.length}/${generators.length}`,
          },
          { icon: Power, label: "MCB monitorados", value: `${mcb.length}/${generators.length}` },
        ]}
      />
      <p className="text-xs text-muted-foreground">Rede exibida somente quando existem canais reais de leitura. Em topologias sem rede, não inferimos tensão, frequência ou MCB.</p>
      <EnergyTable
        principal="Tensão de rede"
        secondary="Frequência da rede"
        state="Disjuntor da rede"
        rows={generators.map((g) => ({
          id: g.id,
          gen: g.tag,
          a: g.powerTopology === "genset_only" ? "Não aplicável" : valueOrDash(g, "mains_voltage_l1", g.mains.l1, "V", 1),
          b: g.powerTopology === "genset_only" ? "Não aplicável" : valueOrDash(g, "mains_frequency", g.mainsFrequency, "Hz", 2),
          c: g.powerTopology === "genset_only" ? "Sem rede nesta topologia" : breakerLabel(breakerClosed(g, "mcb_closed"), "MCB"),
        }))}
      />
    </ScreenBody>
  );
}

export function EnergyGens() {
  const { generators } = useGenerators();
  const running = generators.filter((g) =>
    isPositiveMeasurement(metricNumber(g, "rpm", g.rpm)),
  ).length;
  const powerSupported = supportedCount(generators, "power_kw");
  const freqSupported = supportedCount(generators, "frequency");
  const totalKw = generators.reduce(
    (sum, g) => sum + (metricNumber(g, "power_kw", g.load) ?? 0),
    0,
  );

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Gauge,
            label: "Potência ativa medida dos geradores",
            value: powerSupported ? `${fmt(totalKw)} kW` : "N/D",
            tone: powerSupported ? "text-online" : undefined,
          },
          { icon: Fan, label: "Geradores em rotação", value: running },
          {
            icon: Waves,
            label: "Frequência monitorada",
            value: `${freqSupported}/${generators.length}`,
          },
        ]}
      />
      <EnergyTable
        principal="Potência do gerador"
        secondary="Frequência do gerador"
        state="Disjuntor / rotação"
        rows={generators.map((g) => ({
          id: g.id,
          gen: g.tag,
          a: valueOrDash(g, "power_kw", g.load, "kW", 1),
          b: valueOrDash(g, "frequency", g.frequency, "Hz", 2),
          c: breakerClosed(g, "gcb_closed") != null
            ? breakerLabel(breakerClosed(g, "gcb_closed"), "GCB")
            : valueOrDash(g, "rpm", g.rpm, "rpm", 0),
        }))}
      />
    </ScreenBody>
  );
}

export function EnergyLoad() {
  const { generators } = useGenerators();
  const rows = generators.map((g) => ({
    id: g.id,
    gen: g.tag,
    a: valueOrDash(g, "power_kw", g.load, "kW", 1),
    b: g.site || "—",
    c: metricNumber(g, "power_kw", g.load) != null ? "Potência do gerador medida" : "Potência N/D",
  }));
  const measured = generators.filter((g) => metricNumber(g, "power_kw", g.load) != null);
  const total = measured.reduce((s, g) => s + (metricNumber(g, "power_kw", g.load) ?? 0), 0);
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Factory,
            label: "Potência medida dos geradores",
            value: measured.length ? `${fmt(total)} kW` : "N/D",
          },
          {
            icon: Gauge,
            label: "Geradores com kW",
            value: `${measured.length}/${generators.length}`,
          },
        ]}
      />
      <p className="text-xs text-muted-foreground">O kW do gerador indica geração medida, não a demanda total da planta. Consumo da instalação exige medidor específico de carga/rede; não estimamos o que não foi medido.</p>
      <EnergyTable principal="Potência do gerador" secondary="Unidade" state="Origem" rows={rows} />
    </ScreenBody>
  );
}

export function EnergyTransfer() {
  const { generators } = useGenerators();
  const monitored = generators.filter(
    (g) => breakerClosed(g, "mcb_closed") != null && breakerClosed(g, "gcb_closed") != null,
  );
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: ArrowLeftRight,
            label: "MCB e GCB com leituras confirmadas",
            value: `${monitored.length}/${generators.length}`,
          },
          {
            icon: UtilityPole,
            label: "MCB monitorados",
            value: generators.filter((g) => breakerClosed(g, "mcb_closed") != null).length,
          },
          { icon: Fan, label: "GCB monitorados", value: generators.filter((g) => breakerClosed(g, "gcb_closed") != null).length },
        ]}
      />
      <p className="text-xs text-muted-foreground">Fechamento de disjuntor não confirma sozinho o caminho real da energia. O estado é descritivo e requer topologia homologada.</p>
      <EnergyTable principal="MCB" secondary="GCB" state="Estado dos disjuntores" rows={generators.map((g) => {
          const mcb = breakerLabel(breakerClosed(g, "mcb_closed"), "MCB");
          const gcb = breakerLabel(breakerClosed(g, "gcb_closed"), "GCB");
          return {
            id: g.id,
            gen: g.tag,
            a: mcb,
            b: gcb,
            c: supplyState(g),
          };
        })}
      />
    </ScreenBody>
  );
}

export function EnergyParallel() {
  const { generators } = useGenerators();
  const capable = generators.filter((g) => metricNumber(g, "paralleling_active", undefined) != null);
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: GitMerge,
            label: "Paralelismo monitorado",
            value: `${capable.length}/${generators.length}`,
          },
          {
            icon: Waves,
            label: "Sincronismo",
            value: `${generators.filter((g) => metricNumber(g, "sync_ok", undefined) != null).length}/${generators.length}`,
          },
        ]}
      />
      <p className="text-xs text-muted-foreground">Paralelismo e sincronismo são exibidos somente com canais homologados e leituras atuais. GCB fechado não prova, isoladamente, operação em paralelo.</p>
      <EnergyTable
        principal="Paralelismo"
        secondary="Sincronismo"
        state="Leituras adicionais"
        rows={generators.map((g) => {
          const parallel = metricNumber(g, "paralleling_active", undefined);
          const sync = metricNumber(g, "sync_ok", undefined);
          return {
            id: g.id,
            gen: g.tag,
            a: parallel === 1 ? "Ativo (medido)" : parallel === 0 ? "Inativo (medido)" : "N/D",
            b: sync === 1 ? "Sincronizado (medido)" : sync === 0 ? "Sem sincronismo (medido)" : "N/D",
            c: `${valueOrDash(g, "frequency", g.frequency, "Hz", 2)} · ${valueOrDash(g, "rpm", g.rpm, "rpm", 0)}`,
          };
        })}
      />
    </ScreenBody>
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
    if (!g) return;
    void addWorkOrder({ gen, type, site: g.site });
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: ClipboardList,
            label: "OS abertas",
            value: workOrders.filter((w) => w.status !== "Concluída").length,
          },
          {
            icon: AlertTriangle,
            label: "Urgentes",
            value: workOrders.filter((w) => w.status === "Urgente").length,
            tone: "text-alert",
          },
          {
            icon: HardHat,
            label: "Em campo",
            value: workOrders.filter((w) => w.status === "Em andamento").length,
          },
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
              required
            >
              <option value="" disabled>
                Selecione
              </option>
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
            <button
              type="submit"
              className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
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
            {
              label: "Referência",
              render: (r) => (r.due > 0 ? <span className="num">{r.due} h</span> : "—"),
            },
            { label: "Técnico", render: (r) => r.tech || "—", hide: "hidden md:table-cell" },
            {
              label: "Status",
              render: (r) => (
                <Pill
                  tone={
                    r.status === "Urgente"
                      ? "err"
                      : r.status === "Em andamento"
                        ? "warn"
                        : r.status === "Concluída"
                          ? "ok"
                          : "info"
                  }
                >
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
                      <ActionBtn onClick={() => void setWorkOrderStatus(r.id, "Em andamento")}>
                        Iniciar
                      </ActionBtn>
                    )}
                    <ActionBtn tone="ok" onClick={() => void setWorkOrderStatus(r.id, "Concluída")}>
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

export { FuelScreen, BatteriesScreen, HourmetersScreen } from "./energy-assets";

export function AgendaScreen() {
  const { agenda, addAgenda } = useScadaOps();
  const { generators } = useGenerators();
  const sites = useMemo(
    () => [...new Set(generators.map((g) => g.site).filter(Boolean))],
    [generators],
  );
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [site, setSite] = useState("");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    void addAgenda({ title, when, site });
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
            <input
              list="agenda-sites"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
            <datalist id="agenda-sites">
              {sites.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <div className="sm:col-span-4">
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
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
            { label: "Local", render: (r) => r.site || "—" },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
