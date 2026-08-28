import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Battery, Gauge, House, Radio, Zap } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import { useGenerators } from "./GeneratorsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DeleteGeneratorButton } from "./DeleteGeneratorButton";
import "./comap-panel.css";

export function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "N/D";
}

function displayName(tag: string) {
  const n = tag.replace(/\D/g, "");
  return n ? `Gerador ${String(Number(n)).padStart(2, "0")}` : tag;
}

function hasMetric(gen: Generator, key: string) {
  return (gen.availableMetrics ?? []).includes(key);
}

function read(gen: Generator, key: string, value: number | null | undefined, unit = "", digits = 1) {
  if (!hasMetric(gen, key) || value == null || !Number.isFinite(Number(value))) return "N/D";
  return `${fmt(Number(value), digits)}${unit ? ` ${unit}` : ""}`;
}

function Flag({ label, known, value }: { label: string; known: boolean; value: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/30 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-[11px] font-extrabold", known ? (value ? "text-online" : "text-muted-foreground") : "text-muted-foreground")}>
        {known ? (value ? "FECHADO" : "ABERTO") : "N/D"}
      </p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, known }: { icon: typeof Gauge; label: string; value: string; known: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background/25 px-2 py-1.5">
      <Icon className="size-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("num truncate text-[12px] font-bold", !known && "text-muted-foreground")}>{known ? value : "N/D"}</p>
      </div>
    </div>
  );
}

export function PowerFlowCard({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const rpmKnown = hasMetric(gen, "rpm");
  const frequencyKnown = hasMetric(gen, "frequency") && gen.frequency != null;
  const modeKnown = hasMetric(gen, "controller_mode_raw");
  const powerKnown = hasMetric(gen, "power_kw");
  const batteryKnown = hasMetric(gen, "battery_voltage") && gen.battery != null;
  const mcbKnown = hasMetric(gen, "mcb_closed");
  const gcbKnown = hasMetric(gen, "gcb_closed");
  const alarmCountKnown = hasMetric(gen, "alarm_count");
  const generatorVoltageKnown = ["voltage_l1", "voltage_l2", "voltage_l3", "voltage_l1_l2"].some((key) => hasMetric(gen, key));
  const mainsVoltageKnown = ["mains_voltage_l1", "mains_voltage_l2", "mains_voltage_l3", "mains_voltage_l1_l2"].some((key) => hasMetric(gen, key));
  const running = rpmKnown ? gen.rpm > 300 : null;

  const ig200Homologated = gen.controller.trim().toLowerCase() === "inteligen 200" && gen.rapidDeviceNum === 200;
  const canOperate = can("operate") && ig200Homologated && gen.status !== "nao_configurado";

  const runCommand = async (action: "start" | "stop") => {
    const label = action.toUpperCase();
    if (!canOperate || commandBusy || !confirmCmd(label)) return;
    setCommandBusy(action);
    setCommandMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setCommandMessage(result.reason || `${label} aceito pelo caminho homologado.`);
      await refresh();
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : `Falha no comando ${label}.`);
    } finally {
      setCommandBusy(null);
    }
  };

  return (
    <article className="comap-panel flex min-h-0 flex-col overflow-hidden">
      <header className="comap-header">
        <span className={cn("comap-logo", gen.status === "online" || gen.status === "alerta" ? "online" : "offline")}>G</span>
        <h3 className="comap-name">{displayName(gen.tag)}</h3>
        <span className="comap-alarm" title={alarmCountKnown ? "Contagem de alarmes do Controller Pack" : "Contagem de alarmes não homologada"}>
          <svg viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 8.5v5.8m0 2.7h.01" /></svg>
          <span className="comap-alarm-count">{alarmCountKnown ? gen.alarms : gen.status === "alerta" ? "!" : "—"}</span>
        </span>
        <Link to="/p/geradores/$id" params={{ id: gen.id }} aria-label="Abrir detalhes do gerador" className="grid size-5 place-items-center"><House className="size-3.5" /></Link>
        <DeleteGeneratorButton id={gen.id} tag={gen.tag} className="size-5" />
      </header>

      <section className="comap-block px-2 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="comap-title">Power Flow</h2>
          <span className="comap-mode">MODE: {modeKnown ? gen.mode : "N/D"}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Flag label="MCB" known={mcbKnown} value={gen.mcb} />
          <div className="rounded-md border border-border bg-background/30 px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Motor</p>
            <p className={cn("num mt-0.5 text-[11px] font-extrabold", running === true ? "text-online" : "text-muted-foreground")}>{running == null ? "N/D" : running ? "RODANDO" : "PARADO"}</p>
          </div>
          <Flag label="GCB" known={gcbKnown} value={gen.gcb} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Metric icon={Radio} label="Rede" value={mainsVoltageKnown ? "Sinais disponíveis" : "N/D"} known={mainsVoltageKnown} />
          <Metric icon={Zap} label="Carga" value={read(gen, "power_kw", gen.load, "kW", 1)} known={powerKnown} />
        </div>
        {!mcbKnown || !gcbKnown ? <p className="mt-2 text-[9px] leading-snug text-muted-foreground">O diagrama energizado não é desenhado sem estados MCB/GCB homologados; assim a interface não representa disjuntores como abertos por falta de canal.</p> : null}
      </section>

      <section className="comap-block px-2 py-2">
        <h2 className="comap-title mb-1.5">Telemetria</h2>
        <div className="grid grid-cols-2 gap-1.5">
          <Metric icon={Activity} label="RPM" value={read(gen, "rpm", gen.rpm, "rpm", 0)} known={rpmKnown} />
          <Metric icon={Gauge} label="Frequência" value={read(gen, "frequency", gen.frequency, "Hz", 2)} known={frequencyKnown} />
          <Metric icon={Battery} label="Bateria" value={read(gen, "battery_voltage", gen.battery, "V", 1)} known={batteryKnown} />
          <Metric icon={Zap} label="Potência" value={read(gen, "power_kw", gen.load, "kW", 1)} known={powerKnown} />
        </div>
      </section>

      <section className="comap-block px-2 py-2">
        <h2 className="comap-title mb-1.5">Tensões</h2>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1 text-[10px]">
          <span className="text-muted-foreground">Fase</span><span className="text-muted-foreground">Rede</span><span className="text-muted-foreground">Gerador</span>
          {[
            ["L1-N", "mains_voltage_l1", gen.mains.l1, "voltage_l1", gen.gen.l1],
            ["L2-N", "mains_voltage_l2", gen.mains.l2, "voltage_l2", gen.gen.l2],
            ["L3-N", "mains_voltage_l3", gen.mains.l3, "voltage_l3", gen.gen.l3],
            ["L1-L2", "mains_voltage_l1_l2", gen.mains.l12, "voltage_l1_l2", gen.gen.l12],
          ].map(([label, mainsKey, mainsValue, genKey, genValue]) => (
            <div key={String(label)} className="contents">
              <span>{String(label)}</span>
              <span className="num text-right">{read(gen, String(mainsKey), Number(mainsValue), "V", 0)}</span>
              <span className="num text-right">{read(gen, String(genKey), Number(genValue), "V", 0)}</span>
            </div>
          ))}
        </div>
        {!generatorVoltageKnown && !mainsVoltageKnown && <p className="mt-2 text-[9px] text-muted-foreground">Nenhum canal de tensão homologado.</p>}
      </section>

      <section className="mt-auto border-t border-border px-2 py-2">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="comap-start" disabled={!canOperate || commandBusy !== null} onClick={() => void runCommand("start")}>{commandBusy === "start" ? "ENVIANDO" : "START"}</button>
          <button type="button" className="comap-stop" disabled={!canOperate || commandBusy !== null} onClick={() => void runCommand("stop")}>{commandBusy === "stop" ? "ENVIANDO" : "STOP"}</button>
        </div>
        {!ig200Homologated && <p className="mt-1 text-[9px] text-muted-foreground">Controle remoto não homologado para este gerador.</p>}
        {commandMessage && <p className="mt-1 text-[9px] text-muted-foreground">{commandMessage}</p>}
      </section>
    </article>
  );
}
