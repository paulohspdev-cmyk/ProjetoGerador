import { Link } from "@tanstack/react-router";
import { BellRing, Fuel, TriangleAlert } from "lucide-react";

import type { IndustrialAlarm } from "@/lib/industrial-api";
import { cn } from "@/lib/utils";
import { Panel, Pill } from "./kit";
import {
  alarmLabel,
  alarmTone,
  friendlyAlarmMessage,
  pct,
  type FuelSummary,
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
    <div className="grid grid-cols-[minmax(90px,0.8fr)_minmax(120px,1.8fr)_auto] items-center gap-3 py-2">
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

export function FuelPanel({ fuel }: { fuel: FuelSummary }) {
  return (
    <Panel title="Combustível do parque">
      {fuel.average == null ? (
        <div className="py-8 text-center">
          <Fuel className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">Nível de combustível indisponível</p>
          <p className="mt-1 text-xs text-muted-foreground">
            O indicador aparecerá quando houver medição disponível nos equipamentos.
          </p>
        </div>
      ) : (
        <div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">Média medida</p>
              <p className="num mt-1 text-2xl font-extrabold">{fuel.average.toFixed(0)}%</p>
            </div>
            <div className="rounded-xl bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">Menor leitura</p>
              <p className="num mt-1 text-2xl font-extrabold">{fuel.min?.toFixed(0)}%</p>
            </div>
            <div className="rounded-xl bg-secondary/35 p-3">
              <p className="text-xs text-muted-foreground">Maior leitura</p>
              <p className="num mt-1 text-2xl font-extrabold">{fuel.max?.toFixed(0)}%</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Nível médio do parque</span>
              <span>{fuel.count} medição(ões)</span>
            </div>
            <span className="block h-3 overflow-hidden rounded-full bg-secondary">
              <i
                className="block h-full rounded-full bg-primary"
                style={{ width: `${fuel.average}%` }}
              />
            </span>
          </div>
        </div>
      )}
    </Panel>
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
    <Panel title="Alarmes por prioridade">
      {error ? (
        <p className="py-8 text-center text-sm text-offline">Alarmes indisponíveis.</p>
      ) : alarmsOpen === 0 ? (
        <div className="py-8 text-center">
          <BellRing className="mx-auto size-8 text-online" />
          <p className="mt-2 font-semibold text-online">Nenhum alarme aberto</p>
        </div>
      ) : (
        <div className="space-y-1">
          {severity.map((item) => (
            <MeterRow
              key={item.label}
              label={item.label}
              value={item.value}
              max={severityMax}
              display={String(item.value)}
              tone={
                item.tone === "critical"
                  ? "bg-offline"
                  : item.tone === "alarm" || item.tone === "warning"
                    ? "bg-alert"
                    : "bg-chart-2"
              }
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

export function WorkPanel({ work }: { work: WorkSummary }) {
  return (
    <Panel
      title="Trabalho pendente"
      actions={
        <Link
          to="/p/$slug"
          params={{ slug: "ordens-servico" }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Abrir OS
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-secondary/35 p-3">
          <p className="text-xs text-muted-foreground">OS abertas</p>
          <b className="num mt-1 block text-xl">{work.error ? "N/D" : work.open}</b>
        </div>
        <div className="rounded-lg bg-secondary/35 p-3">
          <p className="text-xs text-muted-foreground">Urgentes</p>
          <b className={cn("num mt-1 block text-xl", work.urgent && "text-offline")}>
            {work.error ? "N/D" : work.urgent}
          </b>
        </div>
        <div className="rounded-lg bg-secondary/35 p-3">
          <p className="text-xs text-muted-foreground">Em andamento</p>
          <b className="num mt-1 block text-xl">{work.error ? "N/D" : work.running}</b>
        </div>
        <div className="rounded-lg bg-secondary/35 p-3">
          <p className="text-xs text-muted-foreground">Planejadas</p>
          <b className="num mt-1 block text-xl">{work.error ? "N/D" : work.planned}</b>
        </div>
      </div>
    </Panel>
  );
}

export function MaintenancePanel({ maintenance }: { maintenance: MaintenanceSummary }) {
  return (
    <Panel
      title="Manutenção"
      actions={
        <Link
          to="/p/$slug"
          params={{ slug: "manutencao" }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver manutenção
        </Link>
      }
    >
      {maintenance.error ? (
        <p className="py-7 text-center text-sm text-offline">Manutenção indisponível.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm font-semibold">Vencidas</span>
            <b className={cn("num text-xl", maintenance.due && "text-offline")}>
              {maintenance.due}
            </b>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm font-semibold">Próximas</span>
            <b className={cn("num text-xl", maintenance.warning && "text-alert")}>
              {maintenance.warning}
            </b>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function AttentionPanel({
  error,
  alarms,
}: {
  error: string | null;
  alarms: IndustrialAlarm[];
}) {
  return (
    <Panel
      title="Requer atenção"
      actions={
        <Link
          to="/p/$slug"
          params={{ slug: "alarmes" }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver alarmes
        </Link>
      }
    >
      {error ? (
        <p className="py-7 text-center text-sm text-offline">Alarmes indisponíveis.</p>
      ) : alarms.length === 0 ? (
        <div className="py-7 text-center">
          <p className="font-semibold text-online">Nenhuma ocorrência ativa</p>
          <p className="mt-1 text-xs text-muted-foreground">Não há item exigindo ação imediata.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alarms.slice(0, 5).map((alarm) => (
            <li key={alarm.alarm_key} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <TriangleAlert className="size-4 text-alert" />
                  {alarm.code === "COMM_LOSS" ? "Falha de comunicação" : "Ocorrência ativa"}
                </span>
                <Pill tone={alarmTone(alarm.severity)}>{alarmLabel(alarm.severity)}</Pill>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {friendlyAlarmMessage(alarm)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
