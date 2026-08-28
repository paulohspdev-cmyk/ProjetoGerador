import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import type { Generator } from "@/data/generators";
import { displayGenName, recentEvents } from "@/data/generators";
import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/data/controller-images";
import { IoBtn, PowerFlowSld, fmt } from "./PowerFlowCard";
import { StatusPill } from "./StatusPill";
import {
  BoolFlag,
  FlowChip,
  KpiTile,
  KwChart,
  MaintenanceBar,
  MetricCell,
  MiniTank,
  PhaseChart,
  Readout,
  kwSeries,
  phaseSeries,
} from "./detail-widgets";
import {
  IconBattery,
  IconClock,
  IconOilCan,
  IconThermometer,
} from "./scada-icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import "./comap-panel.css";
import "./generator-detail.css";

function amps(kw: number, volts: number) {
  if (!kw || !volts) return 0;
  return (kw * 1000) / (Math.sqrt(3) * volts);
}

type OpMode = "OFF" | "ON" | "AUT" | "TEST";

function initialCmd(gen: Generator): OpMode {
  if (gen.mode === "TESTE") return "TEST";
  if (gen.mode === "AUTO") return "AUT";
  if (gen.status === "online") return "ON";
  return "OFF";
}

function readyLabel(status: Generator["status"], running: boolean) {
  if (status === "nao_configurado") return "Offline";
  if (status === "alerta") return "Warning";
  if (running) return "Ready";
  if (status === "offline") return "Not Ready";
  return "Off - Ready";
}

export function GeneratorDetailScreen({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const operate = can("operate");
  const confirmCmd = useCommandGuard();
  const [mcb, setMcb] = useState(gen.mcb);
  const [gcb, setGcb] = useState(gen.gcb);
  const [running, setRunning] = useState(gen.status === "online");
  const [parallel, setParallel] = useState(false);
  const [cmd, setCmd] = useState<OpMode>(initialCmd(gen));
  const [range, setRange] = useState("24h");
  const [toast, setToast] = useState<string | null>(null);
  const seq = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (seq.current) window.clearTimeout(seq.current);
    };
  }, []);

  const stop = () => {
    setGcb(false);
    if (seq.current) window.clearTimeout(seq.current);
    seq.current = window.setTimeout(() => {
      setRunning(false);
      setMcb(true);
    }, 380);
  };

  const start = () => {
    setRunning(true);
    if (seq.current) window.clearTimeout(seq.current);
    seq.current = window.setTimeout(() => setGcb(true), 420);
  };

  const runCmd = (next: OpMode) => {
    if (!operate) {
      setToast("Perfil sem permissão para comandar o gerador.");
      return;
    }
    if (!confirmCmd(next)) return;
    setToast(null);
    if (gen.status === "nao_configurado") {
      setToast("Falha ao executar a ação — gerador não configurado.");
      return;
    }
    setCmd(next);
    if (next === "OFF") stop();
    if (next === "ON" || next === "TEST" || (next === "AUT" && gen.status === "online")) start();
    if (next === "AUT" && !running && gen.status !== "online") stop();
  };

  const closeMcb = () => {
    if (!parallel && gcb) return;
    setMcb(true);
  };
  const closeGcb = () => {
    if (!parallel && mcb) return;
    setGcb(true);
  };

  const name = displayGenName(gen.tag);
  const configured = gen.status !== "nao_configurado";
  const mainsOk = configured;
  const modeLabel = cmd === "AUT" ? "AUTO" : cmd === "TEST" ? "TEST" : cmd;
  const ready = readyLabel(gen.status, running);
  const gridHz = mainsOk ? 59.9 : 0;
  const genHz = running ? (gen.frequency ?? 0) : 0;
  const loadKw = mcb || gcb ? (running && gcb ? gen.load : mcb ? Math.max(80, Math.round((gen.load || 180) * 0.45)) : 0) : 0;
  const rpm = running ? gen.rpm : 0;
  const oil = running ? gen.oilPressure : 0;
  const temp = running ? gen.coolantTemp : 0;
  const fuel = configured ? gen.fuelLevel : 0;
  const alt = running ? gen.alternatorVoltage : 0;
  const street = mainsOk ? (gen.mains.l1 ? gen.mains : { l1: 127, l2: 126, l3: 125, l12: 220 }) : { l1: 0, l2: 0, l3: 0, l12: 0 };
  const genV = running ? gen.gen : { l1: 0, l2: 0, l3: 0, l12: 0 };
  const genA = amps(running && gcb ? loadKw : 0, genV.l12 || 380);
  const streetA = amps(mcb ? loadKw : 0, street.l12 || 220);
  const pf = running && loadKw ? 0.86 : 0;
  const kva = pf ? loadKw / pf : 0;
  const n = Number(gen.id.replace(/\D/g, "")) || 1;
  const batt = configured ? (gen.battery ?? 0) : 0;
  const batt2 = configured
    ? Number(Math.min(14.8, batt + (running ? 1.4 : 0.3) + (n % 3) / 10).toFixed(1))
    : 0;
  const starts = 480 + n * 17;
  const energy = Math.round(gen.runHours * 3.81);
  const l23 = street.l12 ? Number((street.l12 * 1.004).toFixed(0)) : 0;
  const l31 = street.l12 ? Number((street.l12 * 0.997).toFixed(0)) : 0;
  const CYCLE = 300;
  const remain = Math.min(CYCLE, Math.max(0, gen.maintenance));
  const used = CYCLE - remain;
  const maintTone = used < 250 ? "ok" : used < 300 ? "warn" : "bad";
  const battTone = (v: number) => (v <= 0 ? undefined : v < 11.5 ? "bad" : v < 12.2 ? "warn" : "ok");
  const genL23 = genV.l12 ? Number((genV.l12 * 1.003).toFixed(0)) : 0;
  const genL31 = genV.l12 ? Number((genV.l12 * 0.998).toFixed(0)) : 0;
  const ratedKw = 400;
  const loadPct = Math.min(100, (loadKw / ratedKw) * 100);
  const kvar = pf && pf < 0.999 ? Number((loadKw * Math.tan(Math.acos(Math.min(0.99, pf)))).toFixed(0)) : 0;
  const genA1 = Number((genA * 0.985).toFixed(1));
  const genA2 = Number(genA.toFixed(1));
  const genA3 = Number((genA * 1.018).toFixed(1));
  const oilTemp = running ? Math.max(0, temp - 9) : 0;
  const boost = running ? Number((1.35 + (n % 6) / 10).toFixed(2)) : 0;
  const fuelRate = running ? Number((16.5 + (n % 8) * 0.7).toFixed(1)) : 0;
  const coolantLvl = configured ? 94 + (n % 5) : 0;
  const battI = configured ? Number((running ? 3.8 + (n % 5) / 10 : -0.6).toFixed(1)) : 0;
  const earthA = running ? Number((0.12 + (n % 4) / 20).toFixed(2)) : 0;
  const fuelHours = fuel > 0 ? Number((fuel / 2.15).toFixed(1)) : 0;
  const unbal = mainsOk ? 0.7 : 0;
  const fw = gen.controller.includes("ComAp") ? "IL9 3.7.0" : "V5.2.12";
  const lowOil = gen.status === "alerta";
  const highTemp = gen.status === "alerta";
  const chargeFail = configured && batt > 0 && batt < 12;
  const lowFuel = fuel > 0 && fuel < 25;
  const failStart = gen.status === "offline";
  const comm = configured && gen.status !== "offline";
  const seed = n * 0.37;
  const acData = useMemo(() => phaseSeries(seed, street.l1 || 125, 2.2, mainsOk), [seed, street.l1, mainsOk]);
  const gmData = useMemo(() => phaseSeries(seed + 1, genV.l1 || 0, running ? 1.8 : 0, running), [seed, genV.l1, running]);
  const powerHist = useMemo(() => kwSeries(seed, loadKw || gen.load, running), [seed, loadKw, gen.load, running]);

  const alarms =
    gen.status === "alerta"
      ? [
          { title: "Alta temperatura (true)" },
          { title: "Baixa pressão (true)" },
        ].slice(0, Math.max(1, gen.alarms))
      : gen.status === "offline"
        ? [{ title: "Comunicação perdida (true)" }]
        : [];

  const logs = [
    ...recentEvents.filter((e) => e.gen === gen.tag),
    { gen: gen.tag, message: running ? "Running - Auto" : "Stopped - Auto", time: "14:32:10", date: "23/05/2025", kind: "info" as const },
  ];

  return (
    <article className="gen-detail">
      {toast && (
        <div className="gen-toast" role="alert">
          {toast}
          <button type="button" onClick={() => setToast(null)} aria-label="Fechar">
            ×
          </button>
        </div>
      )}

      <div className="gen-top">
        <section className="gen-ident">
          <div className="gen-ident-photo">
            <img
              src={controllerImageSrc(gen.controller)}
              alt={gen.controller}
              onError={(e) => {
                e.currentTarget.src = CONTROLLER_IMAGE_FALLBACK;
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1>{name}</h1>
              <span className="gen-true">
                <i />
                {comm ? "true" : "false"}
              </span>
            </div>
            <p>
              {gen.controller} · {ready} · {modeLabel} · {gen.site}
            </p>
            <p className="gen-ident-meta">
              {gen.ip} · {gen.tag} · {fw}
            </p>
          </div>
        </section>
        <div className="gen-kpis">
          <KpiTile label="Status" value={ready} sub={`Modo ${modeLabel}`} tone="green" />
          <KpiTile label="kW" value={`${fmt(loadKw, 0)} kW`} sub={`Carga ${fmt(loadPct, 0)} % · 400 kW`} tone="cyan" />
          <KpiTile label="kVA" value={`${fmt(kva, 0)} kVA`} sub={`kVAr ${fmt(kvar, 0)}`} tone="gold" />
          <KpiTile label="FP" value={fmt(pf, 2)} sub="Fator de potência" tone="blue" />
          <KpiTile label="Gerador Hz" value={`${fmt(genHz)} Hz`} sub="Nominal 60,0 Hz" tone="cyan" />
          <KpiTile label="Horímetro" value={`${fmt(gen.runHours)} h`} sub="Total operação" tone="gold" />
        </div>
        <div className="gen-cmds">
          {(["OFF", "ON", "AUT", "TEST"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={!operate}
              className={cn(cmd === m && "active", m === "OFF" && "off")}
              onClick={() => runCmd(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <section className="comap-panel gen-flow">
        <header className="comap-header">
          <span className={cn("comap-logo", running ? "online" : "offline")}>G</span>
          <h3 className="comap-name">Power Flow</h3>
          <span className="comap-mode">MODE: {modeLabel}</span>
        </header>
        <div className="comap-sld min-h-0 flex-1 px-1 pb-1">
          <div className="comap-sld-stage">
            <button
              type="button"
              className={cn("comap-prll", parallel && "parallel-on")}
              style={{ position: "absolute", left: 0, top: "1%", zIndex: 20 }}
              onClick={() => operate && setParallel((v) => !v)}
            >
              PRLL
              <br />
              {parallel ? "ON" : "OFF"}
            </button>
            <div className="absolute left-[1%] top-[24%] z-[2] flex flex-col items-center gap-0.5">
              <span className="flow-breaker-name">MCB</span>
              <div className="flex flex-col gap-0.5">
                <IoBtn label="I" tone="close" active={mcb} ariaLabel="Fechar MCB" onClick={() => operate && closeMcb()} />
                <IoBtn label="O" tone="open" active={!mcb} ariaLabel="Abrir MCB" onClick={() => operate && setMcb(false)} />
              </div>
            </div>
            <div className="absolute left-[1%] top-[50%] z-[2] flex flex-col items-center gap-0.5">
              <span className="flow-breaker-name">GCB</span>
              <div className="flex flex-col gap-0.5">
                <IoBtn label="I" tone="close" active={gcb} ariaLabel="Fechar GCB" onClick={() => operate && closeGcb()} />
                <IoBtn label="O" tone="open" active={!gcb} ariaLabel="Abrir GCB" onClick={() => operate && setGcb(false)} />
              </div>
            </div>
            <PowerFlowSld mcb={mcb} gcb={gcb} running={running} mainsOk={mainsOk} gridHz={gridHz} genHz={genHz} loadKw={loadKw} />
            <div className="absolute bottom-[2%] right-[1%] z-10 flex flex-col gap-1">
              <button type="button" className="comap-start" disabled={!operate} onClick={() => runCmd("ON")}>
                START
              </button>
              <button type="button" className="comap-stop" disabled={!operate} onClick={() => runCmd("OFF")}>
                STOP
              </button>
            </div>
          </div>
        </div>
        <div className="comap-mg">
          <div className="comap-table-head">
            <span>Mains / Gen</span>
            <span>Rede</span>
            <span>Gerador</span>
          </div>
          {(
            [
              ["L1-N", street.l1, genV.l1, "V", 0],
              ["L-L", street.l12, genV.l12, "V", 0],
              ["Hz", gridHz, genHz, "", 1],
              ["kW", mcb ? loadKw : 0, running && gcb ? loadKw : 0, "", 0],
              ["A", streetA, genA, "", 1],
              ["PF", mainsOk ? 0.92 : 0, pf, "", 2],
            ] as const
          ).map(([label, a, b, unit, d]) => (
            <div key={label} className="comap-table-row">
              <span className="label">{label}</span>
              <span className="mains">{fmt(a, d)}{unit ? ` ${unit}` : ""}</span>
              <span className="gen">{fmt(b, d)}{unit ? ` ${unit}` : ""}</span>
            </div>
          ))}
        </div>
      </section>

      <aside className="flow-icons">
        <FlowChip icon={<MiniTank pct={fuel} />} label="Combustível" value={`${fmt(fuel, 0)} %`} tone={fuel <= 0 ? undefined : lowFuel ? "bad" : fuel < 40 ? "warn" : "ok"} />
        <FlowChip icon={<IconThermometer size={34} />} label="Temperatura" value={`${fmt(temp, 0)} °C`} tone={!temp ? undefined : temp > 98 ? "bad" : temp > 85 ? "warn" : "ok"} />
        <FlowChip icon={<IconOilCan size={34} />} label="Óleo" value={`${fmt(oil)} bar`} tone={!oil ? undefined : oil < 2 ? "bad" : oil < 3 ? "warn" : "ok"} />
        <FlowChip icon={<IconBattery size={34} />} label="Bateria 1" value={`${fmt(batt)} V`} tone={battTone(batt)} />
        <FlowChip icon={<IconBattery size={34} />} label="Bateria 2" value={`${fmt(batt2)} V`} tone={battTone(batt2)} />
        <FlowChip icon={<IconClock size={34} />} label="Manutenção" value={`${fmt(remain, 0)} h`} tone={maintTone} />
      </aside>

      <div className="gen-mid">
        <section className="gen-card">
          <header className="gen-card-head">
            <h2>Alarmes DSE / ComAp</h2>
            <span className="gen-badge">{alarms.length}</span>
          </header>
          <div className="gen-alarm-compact">
            <b className={alarms.length ? "text-offline" : "text-online"}>
              <AlertTriangle className="size-4" />
            </b>
            <p className={cn("text-[11px] font-bold", alarms.length ? "text-offline" : "text-online")}>
              {alarms.length ? alarms.map((a) => a.title).join(" · ") : "Sem alarmes ativos"}
            </p>
          </div>
          <div className="gen-flags">
            <BoolFlag label="Emergency Stop" on={false} />
            <BoolFlag label="Fail to Start" on={failStart} />
            <BoolFlag label="Overspeed" on={false} />
            <BoolFlag label="Underspeed" on={false} />
            <BoolFlag label="Low Oil Press." on={lowOil} />
            <BoolFlag label="High Coolant" on={highTemp} />
            <BoolFlag label="Charge Fail" on={chargeFail} />
            <BoolFlag label="Low Fuel" on={lowFuel} />
            <BoolFlag label="Batt. Under V" on={batt > 0 && batt < 11.5} />
            <BoolFlag label="ECU comm" on={comm} good />
          </div>
        </section>

        <section className="gen-card min-h-0">
          <header className="gen-card-head">
            <h2>Rede elétrica</h2>
            <span className="num text-[12px] font-bold text-online">{fmt(gridHz)} Hz</span>
          </header>
          <div className="gen-metrics gen-metrics-3">
            <MetricCell label="Tensão L-L" value={`${fmt(street.l12, 0)} V`} />
            <MetricCell label="Corrente" value={`${fmt(streetA, 1)} A`} />
            <MetricCell label="kW rede" value={`${fmt(mcb ? loadKw : 0, 0)}`} />
            <MetricCell label="Desequilíbrio" value={`${fmt(unbal, 1)} %`} />
            <MetricCell label="Seq. fases" value={mainsOk ? "ABC" : "—"} />
            <MetricCell label="Rotação" value={mainsOk ? "OK" : "N/A"} />
          </div>
          <div className="gen-phase">
            <span>L1-N <b>{fmt(street.l1, 0)} V</b></span>
            <span>L1-L2 <b>{fmt(street.l12, 0)} V</b></span>
            <span>L2-N <b>{fmt(street.l2, 0)} V</b></span>
            <span>L2-L3 <b>{fmt(l23, 0)} V</b></span>
            <span>L3-N <b>{fmt(street.l3, 0)} V</b></span>
            <span>L3-L1 <b>{fmt(l31, 0)} V</b></span>
          </div>
        </section>

        <section className="gen-card gen-motor">
          <header className="gen-card-head">
            <h2>Motor / ECU</h2>
            <StatusPill status={gen.status} />
          </header>
          <div className="gen-metrics gen-metrics-4">
            <MetricCell label="RPM" value={`${rpm}`} />
            <MetricCell label="Óleo" value={`${fmt(oil)} bar`} />
            <MetricCell label="Temp. água" value={`${fmt(temp, 0)} °C`} />
            <MetricCell label="Temp. óleo" value={`${fmt(oilTemp, 0)} °C`} />
            <MetricCell label="Boost" value={`${fmt(boost, 2)} bar`} />
            <MetricCell label="Carga motor" value={`${fmt(loadPct, 0)} %`} />
            <MetricCell label="Comb. L/h" value={`${fmt(fuelRate, 1)}`} />
            <MetricCell label="Autonomia" value={`${fmt(fuelHours, 1)} h`} />
            <MetricCell label="Nível água" value={`${fmt(coolantLvl, 0)} %`} />
            <MetricCell label="D+" value={`${fmt(batt2, 1)} V`} />
            <MetricCell label="I bateria" value={`${fmt(battI, 1)} A`} />
            <MetricCell label="Partidas" value={`${starts}`} />
            <MetricCell label="Horímetro" value={`${fmt(gen.runHours)} h`} />
            <MetricCell label="kWh" value={`${energy}`} />
            <MetricCell label="ECU" value={comm ? "OK" : "N/D"} />
            <MetricCell label="Firmware" value={fw} />
          </div>
        </section>
      </div>

      <div className="gen-data">
        <section className="gen-card gen-elec">
          <header className="gen-card-head">
            <h2>Elétrica do gerador</h2>
            <span className="num text-[11px] font-bold">{fmt(genHz)} Hz</span>
          </header>
          <div className="gen-metrics gen-metrics-3">
            <MetricCell label="L-L" value={`${fmt(genV.l12, 0)} V`} />
            <MetricCell label="L2-L3" value={`${fmt(genL23, 0)} V`} />
            <MetricCell label="L3-L1" value={`${fmt(genL31, 0)} V`} />
            <MetricCell label="L1-N" value={`${fmt(genV.l1, 0)} V`} />
            <MetricCell label="L2-N" value={`${fmt(genV.l2, 0)} V`} />
            <MetricCell label="L3-N" value={`${fmt(genV.l3, 0)} V`} />
            <MetricCell label="L1 A" value={`${fmt(genA1, 1)}`} />
            <MetricCell label="L2 A" value={`${fmt(genA2, 1)}`} />
            <MetricCell label="L3 A" value={`${fmt(genA3, 1)}`} />
            <MetricCell label="kW" value={`${fmt(running && gcb ? loadKw : 0, 0)}`} />
            <MetricCell label="kVAr" value={`${fmt(kvar, 0)}`} />
            <MetricCell label="Terra" value={`${fmt(earthA, 2)} A`} />
          </div>
        </section>
        <div className="gen-dials" aria-label="Instrumentos">
          <Readout label="RPM" value={`${rpm}`} unit="RPM" tone={rpm > 2000 ? "bad" : rpm > 1600 ? "warn" : "ok"} />
          <Readout label="Temperatura" value={`${fmt(temp, 0)}`} unit="°C" tone={temp > 98 ? "bad" : temp > 85 ? "warn" : "ok"} />
          <Readout label="Óleo" value={fmt(oil)} unit="bar" tone={oil > 0 && oil < 2 ? "bad" : oil > 0 && oil < 3 ? "warn" : "ok"} />
          <Readout label="Bateria 1" value={fmt(batt)} unit="V" tone={battTone(batt) ?? "ok"} />
          <Readout label="Bateria 2" value={fmt(batt2)} unit="V" tone={battTone(batt2) ?? "ok"} />
          <Readout label="Potência" value={`${fmt(loadKw, 0)}`} unit="kW" tone={loadKw > 340 ? "bad" : loadKw > 280 ? "warn" : "ok"} />
          <Readout label="Frequência" value={fmt(genHz)} unit="Hz" tone={running && (genHz < 58 || genHz > 62) ? "warn" : "ok"} />
          <Readout label="Combustível" value={`${fmt(fuel, 0)}`} unit="%" tone={fuel > 0 && fuel < 15 ? "bad" : fuel > 0 && fuel < 40 ? "warn" : "ok"} />
          <Readout label="Horímetro" value={fmt(gen.runHours)} unit="h" />
        </div>
        <MaintenanceBar used={used} remain={remain} />
      </div>

      <div className="gen-bottom">
        <PhaseChart title="Rede AC" data={acData} live={mainsOk} />
        <PhaseChart title="Rede gerador" data={gmData} live={running} />
        <section className="gen-card gen-chart-card">
          <header className="gen-card-head">
            <h2>kW output</h2>
            <div className="flex gap-1">
              {["1h", "6h", "24h", "7d", "30d"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded px-1 py-0.5 text-[9px] font-bold",
                    range === r ? "bg-primary/20 text-primary" : "text-muted-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </header>
          <KwChart data={powerHist} />
        </section>
        <section className="gen-card min-h-0 overflow-hidden">
          <header className="gen-card-head">
            <h2>Resumo</h2>
          </header>
          <div className="gen-resumo">
            <div><span>IP</span><b className="num">{gen.ip}</b></div>
            <div><span>Modbus</span><b>TCP :502</b></div>
            <div><span>Latência</span><b className="num">{gen.latency ? `${gen.latency} ms` : "—"}</b></div>
            <div><span>Firmware</span><b>{fw}</b></div>
            <div><span>MCB / GCB</span><b>{mcb ? "I" : "O"} / {gcb ? "I" : "O"}</b></div>
            <div><span>D+</span><b className="num">{fmt(batt2, 1)} V</b></div>
            <div><span>Alternador</span><b className="num">{fmt(alt, 0)} V</b></div>
            <div><span>Terra</span><b className="num">{fmt(earthA, 2)} A</b></div>
            {logs.slice(0, 3).map((e) => (
              <div key={`${e.time}-${e.message}`} className="gen-log">
                <span>{e.time}</span>
                <b>{e.message}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}
