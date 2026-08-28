import { type FormEvent, useMemo, useState } from "react";
import { BellRing, Gauge, MapPin, Radio, Server } from "lucide-react";

import { buildAlarms, eventLog, fmt, gensBySite, historyRows, spark } from "@/data/scada";
import { StatusPill } from "@/components/generators/StatusPill";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone, Trend } from "./kit";

export function OperationCenter() {
  const { generators } = useGenerators();
  const { isAcked } = useScadaOps();
  const load = generators.reduce((s, g) => s + g.load, 0);
  const alarmRows = useMemo(
    () => buildAlarms(generators).map((a) => ({ ...a, ack: isAcked(a.id, a.ack) })),
    [generators, isAcked],
  );
  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Server, label: "Parque", value: generators.length, sub: "geradores", tone: "text-foreground" },
          { icon: Gauge, label: "Carga total", value: `${load} kW`, tone: "text-online" },
          { icon: BellRing, label: "Alarmes", value: alarmRows.filter((a) => !a.ack).length, tone: "text-alert" },
          { icon: Radio, label: "Canais OK", value: "3/4", tone: "text-online" },
        ]}
      />
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Estado do parque" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {generators.map((g) => (
              <div key={g.id} className="rounded-md border border-border bg-background/40 p-2">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[12px] font-bold">{g.tag}</p>
                  <StatusPill status={g.status} />
                </div>
                <p className="truncate text-[10px] text-muted-foreground">{g.site}</p>
                <p className="num mt-1 text-[11px] text-online">{g.load} kW · {fmt(g.frequency ?? 0)} Hz</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Alarmes ativos">
          <ul className="space-y-2">
            {alarmRows.slice(0, 6).map((a) => (
              <li key={a.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold">{a.gen}</span>
                  <Pill tone={a.severity === "falha" ? "err" : a.severity === "alarme" ? "warn" : "muted"}>
                    {a.severity}
                  </Pill>
                </div>
                <p className="text-[11px] text-muted-foreground">{a.message}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </ScreenBody>
  );
}

export function SitesScreen() {
  const { generators } = useGenerators();
  const sites = gensBySite(generators);
  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: MapPin, label: "Sites", value: sites.length },
          { icon: Server, label: "Geradores", value: generators.length },
          { icon: Gauge, label: "Carga", value: `${sites.reduce((s, x) => s + x.load, 0)} kW`, tone: "text-online" },
        ]}
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {sites.map((s) => (
          <article key={s.id} className="rounded-lg border border-border bg-card p-3">
            <h3 className="font-bold">{s.name}</h3>
            <p className="text-[11px] text-muted-foreground">{s.city}</p>
            <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
              <div>
                <p className="num text-lg font-bold text-online">{s.online}</p>
                <p className="text-muted-foreground">Online</p>
              </div>
              <div>
                <p className="num text-lg font-bold text-alert">{s.alerta}</p>
                <p className="text-muted-foreground">Alerta</p>
              </div>
              <div>
                <p className="num text-lg font-bold text-offline">{s.offline}</p>
                <p className="text-muted-foreground">Off</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Carga {s.load} kW · Combustível médio {s.fuel}%
            </p>
          </article>
        ))}
      </div>
    </ScreenBody>
  );
}

export function AlarmsScreen() {
  const { generators } = useGenerators();
  const { isAcked, ackAlarm, ackAll } = useScadaOps();
  const rows = useMemo(
    () => buildAlarms(generators).map((a) => ({ ...a, ack: isAcked(a.id, a.ack) })),
    [generators, isAcked],
  );
  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: BellRing, label: "Ativos", value: rows.filter((a) => !a.ack).length, tone: "text-alert" },
          { icon: BellRing, label: "Falhas", value: rows.filter((a) => a.severity === "falha").length, tone: "text-offline" },
          { icon: BellRing, label: "Reconhecidos", value: rows.filter((a) => a.ack).length },
        ]}
      />
      <Panel
        title="Fila de alarmes"
        actions={
          <ActionBtn onClick={() => ackAll(rows.filter((a) => !a.ack).map((a) => a.id))}>Reconhecer todos</ActionBtn>
        }
      >
        <ScadaTable
          rows={rows}
          columns={[
            { label: "ID", render: (r) => <span className="num">{r.id}</span> },
            { label: "Gerador", render: (r) => <b>{r.gen}</b> },
            { label: "Site", render: (r) => r.site, hide: "hidden md:table-cell" },
            {
              label: "Severidade",
              render: (r) => (
                <Pill tone={r.severity === "falha" ? "err" : r.severity === "alarme" ? "warn" : "muted"}>
                  {r.severity}
                </Pill>
              ),
            },
            { label: "Mensagem", render: (r) => r.message },
            { label: "Desde", render: (r) => <span className="num">{r.since}</span> },
            {
              label: "ACK",
              render: (r) =>
                r.ack ? (
                  <Tone tone="ok">Sim</Tone>
                ) : (
                  <ActionBtn onClick={() => ackAlarm(r.id)}>Reconhecer</ActionBtn>
                ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function EventsScreen() {
  return (
    <ScreenBody>
      <Panel title="Eventos em tempo real">
        <ScadaTable
          rows={eventLog}
          columns={[
            { label: "Hora", render: (r) => <span className="num">{r.time}</span> },
            { label: "Data", render: (r) => r.date, hide: "hidden sm:table-cell" },
            { label: "Gerador", render: (r) => <b>{r.gen}</b> },
            { label: "Evento", render: (r) => r.message },
            {
              label: "Tipo",
              render: (r) => (
                <Pill tone={r.kind === "ok" ? "ok" : r.kind === "error" ? "err" : r.kind === "warn" ? "warn" : "info"}>
                  {r.kind}
                </Pill>
              ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function TrendsScreen() {
  return (
    <ScreenBody>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Frequência (Hz)">
          <Trend data={spark(2, 24, 59.8, 0.6)} unit="Hz" />
        </Panel>
        <Panel title="Carga (kW)">
          <Trend data={spark(5, 24, 180, 70)} color="var(--chart-2)" unit="kW" />
        </Panel>
        <Panel title="Combustível médio (%)">
          <Trend data={spark(8, 24, 55, 10)} color="var(--alert)" unit="%" />
        </Panel>
        <Panel title="Latência (ms)">
          <Trend data={spark(3, 24, 400, 80)} color="var(--offline)" unit="ms" />
        </Panel>
      </div>
    </ScreenBody>
  );
}

export function HistoryScreen() {
  return (
    <ScreenBody>
      <Panel title="Histórico operacional">
        <ScadaTable
          rows={historyRows}
          columns={[
            { label: "Quando", render: (r) => <span className="num">{r.at}</span> },
            { label: "Gerador", render: (r) => <b>{r.gen}</b> },
            { label: "Site", render: (r) => r.site, hide: "hidden lg:table-cell" },
            { label: "Evento", render: (r) => r.event },
            { label: "Origem", render: (r) => r.user },
            {
              label: "Resultado",
              render: (r) => <Tone tone={r.result === "OK" ? "ok" : "err"}>{r.result}</Tone>,
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function ReportsScreen() {
  const { generators } = useGenerators();
  const { reports, generateReport, downloadReport } = useScadaOps();
  const [name, setName] = useState("Parque — geradores");
  const [period, setPeriod] = useState("Hoje");
  const [format, setFormat] = useState("CSV");

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    generateReport({ name, period, format }, generators);
  };

  return (
    <ScreenBody>
      <Panel title="Gerar relatório">
        <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[11px] font-semibold text-muted-foreground">
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              required
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Período
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              required
            />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Formato
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option>CSV</option>
              <option>XLSX</option>
              <option>PDF</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Gerar e baixar
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Relatórios">
        <ScadaTable
          rows={reports}
          columns={[
            { label: "ID", render: (r) => <span className="num">{r.id}</span> },
            { label: "Relatório", render: (r) => <b>{r.name}</b> },
            { label: "Período", render: (r) => r.period },
            { label: "Formato", render: (r) => r.format },
            {
              label: "Status",
              render: (r) => (
                <Pill tone={r.status === "Pronto" ? "ok" : r.status === "Gerando" ? "warn" : "info"}>{r.status}</Pill>
              ),
            },
            {
              label: "Download",
              render: (r) => <ActionBtn onClick={() => downloadReport(r.id, generators)}>Baixar</ActionBtn>,
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

