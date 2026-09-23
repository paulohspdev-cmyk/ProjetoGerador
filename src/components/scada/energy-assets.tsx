import { BatteryCharging, Fuel, Timer } from "lucide-react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { readGeneratorTelemetry } from "@/components/generators/generator-health";
import { metricNumber } from "@/components/generators/generator-metrics";
import type { Generator } from "@/data/generators";
import { fmt } from "@/data/scada";
import { Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function hasMetric(g: Generator, key: string) {
  return !g.telemetryStale && (g.definedMetrics ?? g.availableMetrics ?? []).includes(key);
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

function InfoNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
      {children}
    </p>
  );
}

export function FuelScreen() {
  const { generators } = useGenerators();
  const fuelRows = generators.map((generator) => ({
    generator,
    telemetry: readGeneratorTelemetry(generator),
  }));
  const measured = fuelRows.filter(
    ({ telemetry }) => telemetry.fuel != null && Boolean(telemetry.fuelUnit),
  );
  const units = [...new Set(measured.map(({ telemetry }) => telemetry.fuelUnit).filter(Boolean))];
  const commonUnit = units.length === 1 ? (units[0] ?? "") : "";
  const mean =
    measured.length && commonUnit
      ? measured.reduce((sum, { telemetry }) => sum + (telemetry.fuel ?? 0), 0) / measured.length
      : null;
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Fuel,
            label: "Média medida",
            value:
              mean == null
                ? measured.length
                  ? "Unidades mistas"
                  : "N/D"
                : `${fmt(mean, 0)} ${commonUnit}`,
          },
          {
            icon: Fuel,
            label: "Tanques monitorados",
            value: `${measured.length}/${generators.length}`,
          },
        ]}
      />
      <InfoNotice>
        A unidade original do Controller Pack é preservada. Quando a controladora fornece apenas
        percentual e existe capacidade real do tanque por telemetria ou cadastro, a interface
        calcula litros. Sem capacidade conhecida, o percentual continua sendo exibido. Leituras
        acima da capacidade informada permanecem no valor bruto e são marcadas como fora de escala.
      </InfoNotice>
      <Panel title="Tanques / geradores">
        <ScadaTable
          rows={fuelRows}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.generator.tag}</b> },
            { label: "Site", render: (r) => r.generator.site },
            {
              label: "Nível",
              render: (r) =>
                r.telemetry.fuel == null
                  ? "—"
                  : `${fmt(r.telemetry.fuel, 0)} ${r.telemetry.fuelUnit}`,
            },
            {
              label: "Estado",
              render: (r) => {
                const telemetry = r.telemetry;
                return hasMetric(r.generator, "fuel_level") ? (
                  telemetry.fuelOutOfRange ? (
                    <Tone tone="warn">Fora de escala · acima da capacidade</Tone>
                  ) : telemetry.fuelRawUnit === "%" && telemetry.fuelUnit === "L" ? (
                    <Tone tone="ok">Convertido · capacidade real</Tone>
                  ) : (
                    <Tone tone="muted">Medido · unidade original</Tone>
                  )
                ) : (
                  <Tone tone="muted">N/D</Tone>
                );
              },
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function BatteriesScreen() {
  const { generators } = useGenerators();
  const measured = generators.filter((g) => metricNumber(g, "battery_voltage", g.battery) != null);
  const mean = measured.length
    ? measured.reduce((s, g) => s + (metricNumber(g, "battery_voltage", g.battery) ?? 0), 0) /
      measured.length
    : null;
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: BatteryCharging,
            label: "Média medida",
            value: mean == null ? "N/D" : `${fmt(mean)} V`,
          },
          {
            icon: BatteryCharging,
            label: "Baterias monitoradas",
            value: `${measured.length}/${generators.length}`,
          },
        ]}
      />
      <InfoNotice>
        A tensão é exibida somente quando medida. Saúde e baixa tensão só são classificadas quando
        existirem referência nominal e limites configurados para o equipamento.
      </InfoNotice>
      <Panel title="Bancos de baterias">
        <ScadaTable
          rows={generators}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.tag}</b> },
            {
              label: "Tensão",
              render: (r) => valueOrDash(r, "battery_voltage", r.battery, "V", 1),
            },
            {
              label: "Saúde",
              render: (r) =>
                !hasMetric(r, "battery_voltage") || r.battery == null ? (
                  <Tone tone="muted">N/D</Tone>
                ) : (
                  <Tone tone="muted">Sem referência nominal</Tone>
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
  const measured = generators.filter((g) => metricNumber(g, "run_hours", g.runHours) != null);
  const total = measured.reduce((s, g) => s + (metricNumber(g, "run_hours", g.runHours) ?? 0), 0);
  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: Timer,
            label: "Horas medidas",
            value: measured.length ? `${fmt(total, 0)} h` : "N/D",
          },
          {
            icon: Timer,
            label: "Horímetros monitorados",
            value: `${measured.length}/${generators.length}`,
          },
        ]}
      />
      <Panel title="Horímetros">
        <ScadaTable
          rows={generators}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.tag}</b> },
            {
              label: "Horas trabalhadas",
              render: (r) => valueOrDash(r, "run_hours", r.runHours, "h", 1),
            },
            {
              label: "Próxima manutenção",
              render: (r) => valueOrDash(r, "maintenance_hours", r.maintenance, "h", 1),
            },
            {
              label: "Fonte",
              render: (r) =>
                hasMetric(r, "run_hours") ? <Pill tone="ok">Telemetria</Pill> : <Pill>N/D</Pill>,
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
