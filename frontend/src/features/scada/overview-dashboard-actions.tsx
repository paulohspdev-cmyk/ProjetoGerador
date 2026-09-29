import {
  Bell,
  CalendarDays,
  CircleCheck,
  ClipboardList,
  Fuel,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import type { IndustrialAlarm } from "@/lib/industrial-api";
import { cn } from "@/lib/utils";
import { Pill } from "./kit";
import { DecisionCard, DecisionLink } from "./overview-dashboard-summary";
import {
  alarmLabel,
  alarmTone,
  friendlyAlarmMessage,
  pct,
  type FuelSummary,
  type LowFuelRow,
  type MaintenanceSummary,
  type SeverityBucket,
  type WorkSummary,
} from "./overview-dashboard-model";

function MeterRow({
  label,
  value,
  max,
  display,
  tone = "bg-primary",
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  tone?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(72px,0.8fr)_minmax(80px,1.8fr)_auto] items-center gap-2 py-1">
      <span className="truncate text-sm font-semibold">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-secondary">
        <i
          className={cn("block h-full rounded-full", tone)}
          style={{ width: `${pct(value, max)}%` }}
        />
      </span>
      <b className="num min-w-16 text-right text-sm">{display}</b>
    </div>
  );
}

export function FuelPanel({
  fuel,
  className,
}: {
  fuel: FuelSummary;
  className?: string | undefined;
}) {
  const level =
    fuel.unit === "%" && fuel.average != null ? Math.min(100, Math.max(0, fuel.average)) : null;
  return (
    <DecisionCard
      icon={Fuel}
      title="Combustível do parque"
      className={className}
      footer={<DecisionLink slug="geradores">Ver todos os geradores</DecisionLink>}
    >
      {fuel.average == null ? (
        <div className="py-8 text-center">
          <Fuel className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">
            {fuel.mixedUnits
              ? "Unidades de combustível diferentes"
              : "Nível de combustível indisponível"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fuel.mixedUnits
              ? "O parque possui leituras em unidades diferentes; elas não são combinadas."
              : "O indicador aparece quando há medição fresca e unidade conhecida."}
          </p>
        </div>
      ) : (
        <div className="my-auto">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] text-muted-foreground">Média medida</p>
              <p className="num text-xl font-extrabold leading-tight text-online">
                {fuel.average.toFixed(0)}
                {fuel.unit === "%" ? "%" : ` ${fuel.unit}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Menor leitura</p>
              <p className="num text-xl font-extrabold leading-tight text-offline">
                {fuel.min?.toFixed(0)}
                {fuel.unit === "%" ? "%" : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Maior leitura</p>
              <p className="num text-xl font-extrabold leading-tight text-primary">
                {fuel.max?.toFixed(0)}
                {fuel.unit === "%" ? "%" : ""}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <p className="mb-2 text-xs text-muted-foreground">Nível médio de combustível</p>
            <div className="relative h-3 overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-full rounded-full"
                style={{
                  width: level == null ? "0%" : "100%",
                  background:
                    "linear-gradient(90deg, var(--offline) 0%, var(--alert) 45%, var(--online) 100%)",
                  opacity: level == null ? 0.35 : 1,
                }}
              />
              {level != null && (
                <i
                  className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-white bg-foreground shadow"
                  style={{ left: `calc(${level}% - 8px)` }}
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[11px] font-bold text-muted-foreground">
              <span>E</span>
              <span className="num text-foreground">
                {level == null ? fuel.unit : `${level.toFixed(0)}%`}
              </span>
              <span>F</span>
            </div>
          </div>
        </div>
      )}
    </DecisionCard>
  );
}

export function LowFuelPanel({
  rows,
  className,
}: {
  rows: LowFuelRow[];
  className?: string | undefined;
}) {
  return (
    <DecisionCard
      icon={Fuel}
      title="Menores níveis"
      className={className}
      footer={<DecisionLink slug="geradores">Ver todos os geradores</DecisionLink>}
    >
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nenhuma leitura de combustível.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.tag} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                <b>{row.tag}</b>
                <span className="text-muted-foreground"> · {row.site}</span>
              </span>
              <b className="num shrink-0 text-offline">{row.value.toFixed(0)}%</b>
            </li>
          ))}
        </ul>
      )}
    </DecisionCard>
  );
}

export function AlarmPriorityPanel({
  error,
  alarmsOpen,
  severity,
  severityMax,
}: {
  error: string | null;
  alarmsOpen: number;
  severity: SeverityBucket[];
  severityMax: number;
}) {
  return (
    <DecisionCard
      icon={Bell}
      title="Alarmes por prioridade"
      footer={<DecisionLink slug="alarmes">Ver todos os alarmes</DecisionLink>}
    >
      {error ? (
        <p className="py-8 text-center text-sm text-offline">Alarmes indisponíveis.</p>
      ) : alarmsOpen === 0 ? (
        <div className="py-8 text-center">
          <Bell className="mx-auto size-8 text-online" />
          <p className="mt-2 font-semibold text-online">Nenhum alarme aberto</p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {severity.map((item) => (
              <MeterRow
                key={item.label}
                label={item.label}
                value={item.value}
                max={severityMax}
                display={`${item.value} (${pct(item.value, alarmsOpen || severityMax).toFixed(0)}%)`}
                tone={
                  item.tone === "critical"
                    ? "bg-offline"
                    : item.tone === "alarm"
                      ? "bg-alert"
                      : item.tone === "warning"
                        ? "bg-primary"
                        : "bg-info"
                }
              />
            ))}
          </div>
          <div className="shrink-0 px-1 text-center">
            <p className="num text-4xl font-extrabold leading-none">{alarmsOpen}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Total</p>
          </div>
        </div>
      )}
    </DecisionCard>
  );
}

export function WorkPanel({ work }: { work: WorkSummary }) {
  return (
    <DecisionCard
      icon={ClipboardList}
      title="Trabalho pendente"
      footer={<DecisionLink slug="manutencao">Ver todas as OS</DecisionLink>}
    >
      <div className="grid h-full grid-cols-2 content-stretch gap-2">
        {[
          { icon: ClipboardList, label: "OS abertas", value: work.open, tone: "text-foreground" },
          { icon: Bell, label: "Urgentes", value: work.urgent, tone: "text-offline" },
          { icon: Wrench, label: "Em andamento", value: work.running, tone: "text-info" },
          { icon: CalendarDays, label: "Planejadas", value: work.planned, tone: "text-primary" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-secondary/30 px-2.5 py-2"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <item.icon className={cn("size-4 shrink-0", item.tone)} />
              <span className="truncate">{item.label}</span>
            </span>
            <b className={cn("num text-xl", item.tone)}>{work.error ? "N/D" : item.value}</b>
          </div>
        ))}
      </div>
    </DecisionCard>
  );
}

export function MaintenancePanel({ maintenance }: { maintenance: MaintenanceSummary }) {
  return (
    <DecisionCard
      icon={Wrench}
      title="Manutenção"
      footer={<DecisionLink slug="manutencao">Ver plano de manutenção</DecisionLink>}
    >
      {maintenance.error ? (
        <p className="py-7 text-center text-sm text-offline">Manutenção indisponível.</p>
      ) : (
        <div className="my-auto grid grid-cols-3 gap-2 text-center">
          <div>
            <span className="inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Wrench className="size-3.5 text-offline" />
              Vencidas
            </span>
            <p className="num text-3xl font-extrabold leading-tight text-offline">
              {maintenance.due}
            </p>
            <p className="text-[11px] text-muted-foreground">intervenções</p>
          </div>
          <div>
            <span className="inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <CalendarDays className="size-3.5 text-primary" />
              Próximas
            </span>
            <p className="num text-3xl font-extrabold leading-tight text-primary">
              {maintenance.warning}
            </p>
            <p className="text-[11px] text-muted-foreground">próximas</p>
          </div>
          <div>
            <span className="inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <CircleCheck className="size-3.5 text-online" />
              Em dia
            </span>
            <p className="num text-3xl font-extrabold leading-tight text-online">
              {maintenance.ok}
            </p>
            <p className="text-[11px] text-muted-foreground">no prazo</p>
          </div>
        </div>
      )}
    </DecisionCard>
  );
}

export function AttentionPanel({
  error,
  alarms,
  siteByGenerator = {},
}: {
  error: string | null;
  alarms: IndustrialAlarm[];
  siteByGenerator?: Record<string, string>;
}) {
  return (
    <DecisionCard
      icon={TriangleAlert}
      title="Requer atenção"
      footer={<DecisionLink slug="alarmes">Ver todos os alarmes</DecisionLink>}
    >
      {error ? (
        <p className="py-7 text-center text-sm text-offline">Alarmes indisponíveis.</p>
      ) : alarms.length === 0 ? (
        <div className="py-7 text-center">
          <p className="font-semibold text-online">Nenhuma ocorrência ativa</p>
          <p className="mt-1 text-xs text-muted-foreground">Não há item exigindo ação imediata.</p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {alarms.slice(0, 4).map((alarm) => (
            <li key={alarm.alarm_key} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10px] leading-[13px] text-muted-foreground">
                  {new Date(alarm.last_seen * 1000).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {alarm.generator_id ? ` · ${alarm.generator_id}` : ""}
                  {alarm.generator_id && siteByGenerator[alarm.generator_id]
                    ? ` · ${siteByGenerator[alarm.generator_id]}`
                    : ""}
                </p>
                <p className="truncate text-[11px] font-semibold leading-[14px]">
                  {friendlyAlarmMessage(alarm)}
                </p>
              </div>
              <Pill tone={alarmTone(alarm.severity)}>{alarmLabel(alarm.severity)}</Pill>
            </li>
          ))}
        </ul>
      )}
    </DecisionCard>
  );
}
