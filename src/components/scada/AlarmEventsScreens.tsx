import { useEffect, useMemo, useState } from "react";
import { Activity, BellRing, CalendarDays, CirclePlay, Radio, Search } from "lucide-react";

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
        quando o perfil homologado fornecer canais e eventos próprios.
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
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [site, setSite] = useState("");

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

  const now = Date.now() / 1000;
  const last24h = rows.filter((row) => row.created_at >= now - 86400);
  const errors = last24h.filter((row) => row.level === "ERROR" || row.level === "FAULT");
  const warnings = last24h.filter((row) => row.level === "WARN" || row.level === "WARNING");
  const starts = last24h.filter((row) => /partida|start/i.test(row.message));
  const commRestored = last24h.filter((row) =>
    /comunica[cç][aã]o.*restabelec|reconect|voltou online/i.test(row.message),
  );
  const sites = useMemo(
    () =>
      [
        ...new Set(
          rows.map((row) => row.site?.trim()).filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !term ||
        [row.tag, row.name, row.site, row.message, row.level]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      const matchesLevel = !level || row.level === level;
      const matchesSite = !site || row.site === site;
      return matchesQuery && matchesLevel && matchesSite;
    });
  }, [level, query, rows, site]);

  const hourBuckets = useMemo(() => {
    const result = Array.from({ length: 24 }, (_, index) => {
      const date = new Date(Date.now() - (23 - index) * 3600_000);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`,
        label: `${String(date.getHours()).padStart(2, "0")}:00`,
        count: 0,
      };
    });
    const byKey = new Map(result.map((bucket) => [bucket.key, bucket]));
    for (const row of last24h) {
      const date = new Date(row.created_at * 1000);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
      const bucket = byKey.get(key);
      if (bucket) bucket.count += 1;
    }
    return result;
  }, [last24h]);
  const maxHour = Math.max(1, ...hourBuckets.map((bucket) => bucket.count));

  const levelTone = (value: string): "err" | "warn" | "info" | "muted" =>
    value === "ERROR" || value === "FAULT"
      ? "err"
      : value === "WARN" || value === "WARNING"
        ? "warn"
        : value === "INFO"
          ? "info"
          : "muted";

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: CalendarDays,
            label: "Eventos nas últimas 24h",
            value: last24h.length,
            tone: last24h.length ? "text-primary" : "text-online",
            sub: `${rows.length} no histórico carregado`,
          },
          {
            icon: CirclePlay,
            label: "Partidas registradas",
            value: starts.length,
            tone: "text-online",
            sub: "Eventos que mencionam partida/start",
          },
          {
            icon: Activity,
            label: "Falhas / erros",
            value: errors.length,
            tone: errors.length ? "text-offline" : "text-online",
            sub: "FAULT ou ERROR",
          },
          {
            icon: BellRing,
            label: "Avisos",
            value: warnings.length,
            tone: warnings.length ? "text-alert" : "text-online",
            sub: "WARN / WARNING",
          },
          {
            icon: Radio,
            label: "Comunicação restabelecida",
            value: commRestored.length,
            tone: "text-online",
            sub: "Nas últimas 24h",
          },
        ]}
      />

      {error && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <Panel title="Linha do tempo de eventos" className="xl:col-span-9">
          {!filtered.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum evento corresponde aos filtros.
            </p>
          ) : (
            <div className="scroll-slim max-h-[460px] min-w-0 overflow-auto rounded-lg border border-border/55">
              <table className="rc-data-table w-full min-w-[820px] border-separate border-spacing-0 text-[12px]">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="text-[10px] text-muted-foreground">
                    {["Hora", "Equipamento", "Tipo", "Descrição", "Unidade"].map((label) => (
                      <th
                        key={label}
                        className="border-b border-border/70 px-3 py-2.5 text-left font-bold"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 160).map((row) => (
                    <tr key={row.id}>
                      <td className="border-b border-border/45 px-3 py-2.5 num">
                        {dateTime(row.created_at)}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 font-bold">
                        {row.tag || row.name || "Sistema"}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <Pill tone={levelTone(row.level)}>{row.level}</Pill>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">{row.message}</td>
                      <td className="border-b border-border/45 px-3 py-2.5 text-muted-foreground">
                        {row.site || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Filtros" className="xl:col-span-3">
          <div className="space-y-3 text-xs">
            <label className="block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Busca
              <span className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3 normal-case tracking-normal">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Gerador ou evento"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                  aria-label="Buscar eventos"
                />
              </span>
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Tipo de evento
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs normal-case tracking-normal"
              >
                <option value="">Todos</option>
                <option value="FAULT">Falha</option>
                <option value="ERROR">Erro</option>
                <option value="WARN">Aviso</option>
                <option value="INFO">Informação</option>
              </select>
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Unidade
              <select
                value={site}
                onChange={(event) => setSite(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs normal-case tracking-normal"
              >
                <option value="">Todas</option>
                {sites.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-lg border border-border/60 bg-background/25 p-3">
              <span className="block text-[10px] text-muted-foreground">Resultados</span>
              <b className="num mt-1 block text-xl">{filtered.length}</b>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setLevel("");
                setSite("");
              }}
              className="h-10 w-full rounded-lg bg-primary text-xs font-extrabold text-primary-foreground"
            >
              Limpar filtros
            </button>
          </div>
        </Panel>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <Panel title="Distribuição por nível" className="xl:col-span-4">
          <div className="space-y-3">
            {[
              { label: "Falha / erro", value: errors.length, tone: "bg-offline" },
              { label: "Aviso", value: warnings.length, tone: "bg-alert" },
              {
                label: "Informação / outros",
                value: Math.max(0, last24h.length - errors.length - warnings.length),
                tone: "bg-chart-2",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[110px_minmax(0,1fr)_36px] items-center gap-3 text-xs"
              >
                <span>{item.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-secondary">
                  <i
                    className={`block h-full rounded-full ${item.tone}`}
                    style={{
                      width: `${last24h.length ? Math.max(3, (item.value / last24h.length) * 100) : 0}%`,
                    }}
                  />
                </span>
                <b className="num text-right">{item.value}</b>
              </div>
            ))}
            <div className="mt-4 rounded-xl border border-border/60 bg-background/25 p-4 text-center">
              <b className="num text-3xl">{last24h.length}</b>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                Total nas últimas 24h
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Eventos por hora (últimas 24h)" className="xl:col-span-5">
          <div className="flex h-48 items-end gap-1 border-b border-l border-border/55 px-2 pb-0">
            {hourBuckets.map((bucket, index) => (
              <div
                key={bucket.key}
                className="group relative flex min-w-0 flex-1 items-end justify-center"
                title={`${bucket.label}: ${bucket.count} evento(s)`}
              >
                <span
                  className="w-full max-w-5 rounded-t-sm bg-chart-2/70 transition-colors group-hover:bg-primary"
                  style={{ height: `${Math.max(2, (bucket.count / maxHour) * 100)}%` }}
                />
                {(index % 4 === 0 || index === hourBuckets.length - 1) && (
                  <span className="absolute -bottom-5 text-[9px] text-muted-foreground">
                    {bucket.label.slice(0, 2)}h
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="h-5" />
        </Panel>

        <Panel title="Últimos eventos críticos" className="xl:col-span-3">
          <div className="divide-y divide-border/55">
            {rows
              .filter((row) => row.level === "ERROR" || row.level === "FAULT")
              .slice(0, 5)
              .map((row) => (
                <div key={row.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-xs text-offline">
                      {row.tag || row.name || "Sistema"}
                    </b>
                    <Pill tone="err">{row.level}</Pill>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {row.message}
                  </p>
                </div>
              ))}
            {!rows.some((row) => row.level === "ERROR" || row.level === "FAULT") && (
              <p className="py-8 text-center text-sm text-online">Nenhum evento crítico.</p>
            )}
          </div>
        </Panel>
      </div>
    </ScreenBody>
  );
}
