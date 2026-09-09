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
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

function hasMetric(g: Generator, key: string) {
  return (g.availableMetrics ?? []).includes(key);
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
  if (!hasMetric(g, key) || value == null) return "—";
  const resolvedUnit = metricUnit(g, key, unit);
  return `${fmt(value, digits)}${resolvedUnit ? ` ${resolvedUnit}` : ""}`;
}

function supportedCount(generators: Generator[], metric: string) {
  return generators.filter((g) => hasMetric(g, metric)).length;
}

function InfoNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
      {children}
    </p>
  );
}

function EnergyTable({
  rows,
}: {
  rows: Array<{ id: string; gen: string; a: string; b: string; c: string }>;
}) {
  return (
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
  );
}

export function EnergyRede() {
  const { generators } = useGenerators();
  const mainsVoltage = generators.filter((g) => hasMetric(g, "mains_voltage_l1"));
  const mainsFreq = generators.filter((g) => hasMetric(g, "mains_frequency"));
  const mcb = generators.filter((g) => hasMetric(g, "mcb_closed"));
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
      <InfoNotice>
        A tela mostra somente medições de rede realmente disponíveis. Dados do gerador não são
        reutilizados como se fossem dados da concessionária.
      </InfoNotice>
      <EnergyTable
        rows={generators.map((g) => ({
          id: g.id,
          gen: g.tag,
          a: valueOrDash(g, "mains_voltage_l1", g.mains.l1, "V", 1),
          b: valueOrDash(g, "mains_frequency", g.mainsFrequency, "Hz", 2),
          c: hasMetric(g, "mcb_closed") ? (g.mcb ? "MCB fechado" : "MCB aberto") : "MCB N/D",
        }))}
      />
    </ScreenBody>
  );
}

export function EnergyGens() {
  const { generators } = useGenerators();
  const running = generators.filter((g) => hasMetric(g, "rpm") && g.rpm > 300).length;
  const powerSupported = supportedCount(generators, "power_kw");
  const freqSupported = supportedCount(generators, "frequency");
  const totalKw = generators
    .filter((g) => hasMetric(g, "power_kw"))
    .reduce((sum, g) => sum + g.load, 0);

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Gauge,
            label: "Potência ativa",
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
      <InfoNotice>
        Potência, GCB, fator de potência e outras grandezas só aparecem quando a controladora
        realmente fornece essas medições. Valores ausentes permanecem N/D.
      </InfoNotice>
      <EnergyTable
        rows={generators.map((g) => ({
          id: g.id,
          gen: g.tag,
          a: valueOrDash(g, "power_kw", g.load, "kW", 1),
          b: valueOrDash(g, "frequency", g.frequency, "Hz", 2),
          c: hasMetric(g, "gcb_closed")
            ? g.gcb
              ? "GCB fechado"
              : "GCB aberto"
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
    c: hasMetric(g, "power_kw") ? "Medido" : "Sem canal de potência",
  }));
  const measured = generators.filter((g) => hasMetric(g, "power_kw"));
  const total = measured.reduce((s, g) => s + g.load, 0);
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Factory,
            label: "Carga medida",
            value: measured.length ? `${fmt(total)} kW` : "N/D",
          },
          {
            icon: Gauge,
            label: "Geradores com kW",
            value: `${measured.length}/${generators.length}`,
          },
        ]}
      />
      <InfoNotice>
        Fator de potência, pico e histórico não são calculados por estimativa. O histórico só é
        apresentado quando houver dados reais disponíveis.
      </InfoNotice>
      <EnergyTable rows={rows} />
    </ScreenBody>
  );
}

export function EnergyTransfer() {
  const { generators } = useGenerators();
  const monitored = generators.filter(
    (g) => hasMetric(g, "mcb_closed") || hasMetric(g, "gcb_closed"),
  );
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: ArrowLeftRight,
            label: "Transferência monitorada",
            value: `${monitored.length}/${generators.length}`,
          },
          {
            icon: UtilityPole,
            label: "MCB monitorados",
            value: supportedCount(generators, "mcb_closed"),
          },
          { icon: Fan, label: "GCB monitorados", value: supportedCount(generators, "gcb_closed") },
        ]}
      />
      <InfoNotice>
        Estados ATS/MCB/GCB não são inferidos por RPM. Sem informação real disponível, o estado
        permanece N/D.
      </InfoNotice>
      <EnergyTable
        rows={generators.map((g) => {
          const mcb = hasMetric(g, "mcb_closed")
            ? g.mcb
              ? "MCB fechado"
              : "MCB aberto"
            : "MCB N/D";
          const gcb = hasMetric(g, "gcb_closed")
            ? g.gcb
              ? "GCB fechado"
              : "GCB aberto"
            : "GCB N/D";
          return {
            id: g.id,
            gen: g.tag,
            a: mcb,
            b: gcb,
            c:
              hasMetric(g, "mcb_closed") && hasMetric(g, "gcb_closed")
                ? "Monitorado"
                : "Parcial/N/D",
          };
        })}
      />
    </ScreenBody>
  );
}

export function EnergyParallel() {
  const { generators } = useGenerators();
  const capable = generators.filter((g) => hasMetric(g, "paralleling_active"));
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
            value: supportedCount(generators, "sync_ok") ? "Disponível" : "N/D",
          },
        ]}
      />
      <InfoNotice>
        Paralelismo, sincronismo e comandos de disjuntores permanecem indisponíveis nesta versão
        operacional.
      </InfoNotice>
      <EnergyTable
        rows={generators.map((g) => ({
          id: g.id,
          gen: g.tag,
          a: valueOrDash(g, "frequency", g.frequency, "Hz", 2),
          b: valueOrDash(g, "rpm", g.rpm, "rpm", 0),
          c: hasMetric(g, "paralleling_active") ? "Monitorado" : "Paralelismo N/D",
        }))}
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
