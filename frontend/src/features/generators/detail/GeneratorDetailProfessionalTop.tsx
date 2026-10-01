import { Activity, Cog, Pencil, Play, Power, Zap } from "lucide-react";

import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/assets";
import { generatorDisplayStatus, type Generator } from "@/data/generators";
import type { IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";

import { GeneratorEditDialog } from "../GeneratorEditDialog";
import { formatMetric } from "../generator-metrics";
import type { GeneratorDetailModel } from "./generator-detail-model";

type Props = {
  gen: Generator;
  model: GeneratorDetailModel;
  canAction: (action: IndustrialCommandAction) => boolean;
  commandBusy: IndustrialCommandAction | null;
  onCommand: (action: IndustrialCommandAction) => void | Promise<void>;
};

function hzText(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Hz`;
}

function kwText(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${Math.round(value).toLocaleString("pt-BR")} kW`;
}

function HorizontalFlow({
  hasMainsSource,
  mainsPresent,
  mainsKnown: _mainsKnown,
  mainsHz,
  generatorHz,
  loadKw,
  mcb,
  mcbKnown,
  gcb,
  gcbKnown,
  mainsToBus,
  generatorPresent,
  generatorToBus,
  busLive,
}: {
  hasMainsSource: boolean;
  mainsPresent: boolean;
  mainsKnown: boolean;
  mainsHz: number | null;
  generatorHz: number | null;
  loadKw: number | null;
  mcb: boolean;
  mcbKnown: boolean;
  gcb: boolean;
  gcbKnown: boolean;
  mainsToBus: boolean;
  generatorPresent: boolean;
  generatorToBus: boolean;
  busLive: boolean;
}) {
  const y = 108;
  const green = "#2ee600";
  const dead = "#617581";
  const wire = (x1: number, x2: number, live: boolean) => (
    <line
      x1={x1}
      y1={y}
      x2={x2}
      y2={y}
      stroke={live ? green : dead}
      strokeWidth="4"
      strokeLinecap="round"
    />
  );
  const badge = (x: number, label: string, closed: boolean, known: boolean) => {
    const text = !known ? "—" : closed ? "I" : "O";
    const fill = !known ? "#dce5e9" : closed ? "#2dca10" : "#eef2f4";
    return (
      <g transform={`translate(${x} ${y - 36})`}>
        <text y="-14" textAnchor="middle" fill="#a8bac6" fontSize="11" fontWeight="800">
          {label}
        </text>
        <rect
          x="-14"
          y="-11"
          width="28"
          height="18"
          rx="4"
          fill={fill}
          stroke={known && closed ? "#5bf33e" : "#8598a4"}
        />
        <text y="2" textAnchor="middle" fill="#0c1c25" fontSize="12" fontWeight="800">
          {text}
        </text>
      </g>
    );
  };
  const contact = (x1: number, x2: number, closed: boolean, known: boolean) => {
    const color = !known ? "#71848f" : closed ? green : "#8aa0ab";
    return (
      <g>
        <circle cx={x1} cy={y} r="3.4" fill={color} />
        <circle cx={x2} cy={y} r="3.4" fill={color} />
        {known ? (
          <line
            x1={x1 + 4}
            y1={y}
            x2={closed ? x2 - 4 : x2 - 8}
            y2={closed ? y : y - 16}
            stroke={color}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        ) : (
          <text
            x={(x1 + x2) / 2}
            y={y - 8}
            textAnchor="middle"
            fill="#a8bac6"
            fontSize="11"
            fontWeight="800"
          >
            ?
          </text>
        )}
      </g>
    );
  };
  const machine = (x: number, live: boolean, label: string, caption: string) => (
    <g transform={`translate(${x} ${y})`}>
      <text y="-40" textAnchor="middle" fill="#edf4f8" fontSize="12" fontWeight="800">
        {caption}
      </text>
      <circle r="24" fill="#061722" stroke={live ? green : "#7d909b"} strokeWidth="2.4" />
      {label === "G" ? (
        <text y="8" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="800">
          G
        </text>
      ) : (
        <g fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
          <path d="M0-12V11M-5 11 0-12 5 11M-9-4H9M-11 2H11M-13 8H13" />
        </g>
      )}
      <text y="40" textAnchor="middle" fill="#9eb0bb" fontSize="10" fontWeight="700">
        {label === "G" ? "GERADOR" : "REDE"}
      </text>
    </g>
  );
  const load = (x: number) => (
    <g>
      <line
        x1={x}
        y1="62"
        x2={x}
        y2={y}
        stroke={busLive ? green : dead}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx={x} cy={y} r="4.5" fill={busLive ? green : dead} />
      <g transform={`translate(${x} 32)`}>
        <rect
          x="-48"
          y="-22"
          width="96"
          height="44"
          rx="6"
          fill="#061824"
          stroke={busLive ? green : "#315a71"}
        />
        <text y="-4" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800">
          CARGA
        </text>
        <text y="14" textAnchor="middle" fill={green} fontSize="14" fontWeight="800">
          {kwText(loadKw)}
        </text>
      </g>
    </g>
  );

  if (!hasMainsSource) {
    return (
      <svg viewBox="0 0 760 156" className="h-full w-full" aria-label="Fluxo de potência sem rede">
        {machine(90, generatorPresent, "G", hzText(generatorHz))}
        {wire(114, 200, generatorPresent)}
        {badge(250, "GCB", gcb, gcbKnown)}
        {contact(200, 300, gcb, gcbKnown)}
        {wire(300, 520, generatorToBus)}
        {load(520)}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 760 156" className="h-full w-full" aria-label="Fluxo de potência">
      {machine(48, mainsPresent, "REDE", hzText(mainsHz))}
      {wire(72, 130, mainsPresent)}
      {badge(168, "MCB", mcb, mcbKnown)}
      {contact(130, 206, mcb, mcbKnown)}
      {wire(206, 340, mainsToBus)}
      {load(340)}
      {wire(340, 470, generatorToBus)}
      {badge(508, "GCB", gcb, gcbKnown)}
      {contact(470, 546, gcb, gcbKnown)}
      {wire(546, 664, generatorPresent)}
      {machine(688, generatorPresent, "G", hzText(generatorHz))}
    </svg>
  );
}

export function GeneratorDetailProfessionalTop({
  gen,
  model,
  canAction,
  commandBusy,
  onCommand,
}: Props) {
  const onMains = model.busEnergySource === "mains" && model.mainsPower != null;
  const powerValue = onMains ? model.mainsPower : model.load;
  const loadPercent =
    !onMains && model.load != null && model.nominalPower != null && model.nominalPower > 0
      ? Math.max(0, Math.min(100, (model.load / model.nominalPower) * 100))
      : null;
  const sourceLabel =
    model.busEnergySource === "mains"
      ? "Carga na rede"
      : model.busEnergySource === "generator"
        ? "Gerador no barramento"
        : model.busEnergySource === "mains_and_generators"
          ? "Rede e gerador"
          : model.busEnergySource === "generators_parallel"
            ? "Geradores em paralelo"
            : "Origem N/D";
  const displayStatus = generatorDisplayStatus(gen);
  const statusLabel =
    displayStatus === "stale"
      ? "Sem comunicação"
      : displayStatus === "online"
        ? "Online"
        : displayStatus === "alerta"
          ? "Em alerta"
          : displayStatus === "offline"
            ? "Offline"
            : "Não configurado";

  return (
    <div className="gen-detail-top flex shrink-0 flex-col gap-1.5 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black leading-none tracking-tight">{gen.tag}</h1>
            <span
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
                displayStatus === "online"
                  ? "border-online/40 bg-online/10 text-online"
                  : displayStatus === "alerta"
                    ? "border-alert/40 bg-alert/10 text-alert"
                    : "border-offline/40 bg-offline/10 text-offline",
              )}
            >
              <i className="size-1.5 rounded-full bg-current" />
              {statusLabel}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold">
              <Cog className="size-3.5 text-muted-foreground" />
              {model.modeKnown ? model.modeLabel : "N/D"}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold">
              {gen.controller || "Controlador N/D"}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground">
              <Activity className="size-3.5" />
              {sourceLabel}
            </span>
            {powerValue != null ? (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold">
                <Zap className="size-3.5 text-chart-2" />
                <span className="num">{formatMetric(powerValue, "kW", 0)}</span>
                {loadPercent != null ? (
                  <span className="text-muted-foreground">{loadPercent.toFixed(0)}%</span>
                ) : null}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {gen.site || "Sem unidade"}
            {gen.customer ? ` | ${gen.customer}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <GeneratorEditDialog
            generator={gen}
            trigger={
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[11px] font-semibold hover:bg-secondary"
              >
                <Pencil className="size-3.5" /> Editar
              </button>
            }
          />
          {model.modeControls.length > 0 && (
            <div
              className="inline-flex h-8 overflow-hidden rounded-lg border border-border"
              aria-label="Modo da controladora"
            >
              {model.modeControls.map((item) => {
                const enabled =
                  item.action != null && canAction(item.action) && commandBusy == null;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={!enabled}
                    data-command={item.action ?? undefined}
                    title={
                      enabled
                        ? `Comandar ${item.label}`
                        : "Indicação do modo. Comando remoto não homologado."
                    }
                    onClick={() => {
                      if (item.action) void onCommand(item.action);
                    }}
                    className={cn(
                      "px-2 text-[11px] font-black",
                      item.active
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground",
                      !enabled && "cursor-default",
                    )}
                  >
                    {item.action && commandBusy === item.action ? "…" : item.label}
                  </button>
                );
              })}
            </div>
          )}
          {gen.capabilities?.start === true && (
            <button
              type="button"
              disabled={!canAction("start") || commandBusy !== null}
              onClick={() => void onCommand("start")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-online/50 bg-online/10 px-2.5 text-[11px] font-semibold text-online hover:bg-online/15 disabled:opacity-40"
            >
              <Play className="size-3.5" /> {commandBusy === "start" ? "Enviando…" : "START"}
            </button>
          )}
          {gen.capabilities?.stop === true && (
            <button
              type="button"
              disabled={!canAction("stop") || commandBusy !== null}
              onClick={() => void onCommand("stop")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-offline px-2.5 text-[11px] font-semibold text-white hover:bg-offline/90 disabled:opacity-40"
            >
              <Power className="size-3.5" /> {commandBusy === "stop" ? "Enviando…" : "STOP"}
            </button>
          )}
          {(["mcb_open", "mcb_close", "gcb_open", "gcb_close"] as const)
            .filter((action) => gen.capabilities?.[action] === true)
            .map((action) => (
              <button
                key={action}
                type="button"
                disabled={!canAction(action) || commandBusy !== null}
                onClick={() => void onCommand(action)}
                className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-2 text-[10px] font-bold disabled:opacity-40"
              >
                {commandBusy === action ? "…" : action.replaceAll("_", " ").toUpperCase()}
              </button>
            ))}
        </div>
      </header>

      <div className="grid h-[158px] min-h-0 min-w-0 shrink-0 gap-1.5 xl:grid-cols-12">
        <section className="gen-detail-section flex min-h-0 flex-col overflow-hidden rounded-xl p-2 xl:col-span-3">
          <h2 className="mb-1 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
            Controladora
          </h2>
          <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-md bg-black/25 p-1.5">
            <img
              src={controllerImageSrc(gen.controller)}
              alt={gen.controller}
              className="h-full max-h-full w-full object-contain object-center"
              onError={(event) => {
                event.currentTarget.src = CONTROLLER_IMAGE_FALLBACK;
              }}
            />
          </div>
          <p className="mt-1 shrink-0 truncate text-center text-[11px] font-semibold">
            {gen.controller || "N/D"}
          </p>
        </section>

        <section className="gen-detail-section flex min-h-0 flex-col overflow-hidden rounded-xl p-2 xl:col-span-9">
          <h2 className="mb-1 flex shrink-0 items-center gap-1.5 text-[12px] font-extrabold">
            <Zap className="size-3.5 text-primary" /> Fluxo de potência
          </h2>
          <div className="min-h-0 flex-1 overflow-hidden">
            <HorizontalFlow
              hasMainsSource={model.hasMainsSource}
              mainsPresent={model.mainsPresent}
              mainsKnown={model.mainsKnown}
              mainsHz={model.mainsFrequency}
              generatorHz={model.frequency}
              loadKw={model.busLoadKw}
              mcb={model.mcb}
              mcbKnown={model.mcbKnown}
              gcb={model.gcb}
              gcbKnown={model.gcbKnown}
              mainsToBus={model.mainsToBus}
              generatorPresent={model.generatorPresent}
              generatorToBus={model.generatorToBus}
              busLive={model.busLive}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
