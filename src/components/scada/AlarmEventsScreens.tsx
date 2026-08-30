import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type EventItemApi } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";
import { dateTime, realAlarms } from "./operation-helpers";

export function AlarmsScreen() {
  const { generators } = useGenerators();
  const { isAcked, ackAlarm, ackAll } = useScadaOps();
  const rows = useMemo(() => realAlarms(generators, isAcked), [generators, isAcked]);
  const pending = rows.filter((a) => !a.ack);

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: BellRing,
            label: "Ativos",
            value: pending.length,
            tone: pending.length ? "text-alert" : "text-online",
          },
          {
            icon: BellRing,
            label: "Falhas",
            value: rows.filter((a) => a.severity === "falha" && !a.ack).length,
            tone: "text-offline",
          },
          { icon: BellRing, label: "Reconhecidos", value: rows.filter((a) => a.ack).length },
        ]}
      />
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        Esta fila contém somente estados comprovados pela API. Alarmes nativos adicionais aparecem
        quando o Controller Pack fornecer canais/eventos próprios.
      </p>
      <Panel
        title="Fila de alarmes"
        actions={
          pending.length ? (
            <ActionBtn onClick={() => ackAll(pending.map((a) => a.id))}>Reconhecer todos</ActionBtn>
          ) : undefined
        }
      >
        {!rows.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma condição ativa.</p>
        ) : (
          <ScadaTable
            rows={rows}
            columns={[
              { label: "ID", render: (r) => <span className="num">{r.id}</span> },
              { label: "Gerador", render: (r) => <b>{r.gen}</b> },
              { label: "Site", render: (r) => r.site || "—", hide: "hidden md:table-cell" },
              {
                label: "Severidade",
                render: (r) => (
                  <Pill tone={r.severity === "falha" ? "err" : "warn"}>{r.severity}</Pill>
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
        )}
      </Panel>
    </ScreenBody>
  );
}

export function EventsScreen() {
  const [rows, setRows] = useState<EventItemApi[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await rcApi.events.list(500);
        if (active) {
          setRows(data);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Falha ao consultar eventos.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const tableRows = rows.map((r) => ({ ...r, id: String(r.id) }));
  return (
    <ScreenBody>
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      <Panel title="Eventos reais da aplicação / operação">
        {!tableRows.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum evento registrado.
          </p>
        ) : (
          <ScadaTable
            rows={tableRows}
            columns={[
              {
                label: "Quando",
                render: (r) => <span className="num">{dateTime(r.created_at)}</span>,
              },
              { label: "Gerador", render: (r) => <b>{r.tag || "Sistema"}</b> },
              { label: "Site", render: (r) => r.site || "—", hide: "hidden md:table-cell" },
              { label: "Evento", render: (r) => r.message },
              {
                label: "Nível",
                render: (r) => (
                  <Pill
                    tone={
                      r.level === "ERROR" || r.level === "FAULT"
                        ? "err"
                        : r.level === "WARN"
                          ? "warn"
                          : "info"
                    }
                  >
                    {r.level}
                  </Pill>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </ScreenBody>
  );
}
