import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Search, ShieldAlert } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { industrialApi, type IndustrialAlarm } from "@/lib/industrial-api";
import { ActionBtn, Panel, Pill, ScreenBody, Stats } from "./kit";

function dt(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

function severityTone(value: string): "err" | "warn" | "info" | "muted" {
  if (value === "fault") return "err";
  if (value === "alarm" || value === "warning") return "warn";
  if (value === "info") return "info";
  return "muted";
}

export function IndustrialAlarmsScreen() {
  const { generators } = useGenerators();
  const { can } = useAuth();
  const [rows, setRows] = useState<IndustrialAlarm[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [selectedKey, setSelectedKey] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await industrialApi.alarms.list(true));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar alarmes industriais.");
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const tagById = useMemo(
    () => new Map(generators.map((generator) => [generator.id, generator.tag])),
    [generators],
  );
  const pending = rows.filter((row) => !row.acked_at);
  const recognized = rows.filter((row) => !!row.acked_at);
  const severityCounts = useMemo(
    () => ({
      fault: rows.filter((row) => row.severity === "fault").length,
      alarm: rows.filter((row) => row.severity === "alarm").length,
      warning: rows.filter((row) => row.severity === "warning").length,
      info: rows.filter((row) => row.severity === "info").length,
    }),
    [rows],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const tag = row.generator_id
        ? tagById.get(row.generator_id) || row.generator_id
        : row.asset_id || "Sistema";
      const matchesSearch =
        !term ||
        tag.toLowerCase().includes(term) ||
        row.code.toLowerCase().includes(term) ||
        row.message.toLowerCase().includes(term) ||
        row.source.toLowerCase().includes(term);
      const matchesSeverity = !severity || row.severity === severity;
      const matchesStatus = !status || (status === "open" ? !row.acked_at : !!row.acked_at);
      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [query, rows, severity, status, tagById]);
  const selected = rows.find((row) => row.alarm_key === selectedKey) ?? filtered[0] ?? null;

  const ack = async (alarm: IndustrialAlarm) => {
    try {
      await industrialApi.alarms.ack(alarm.alarm_key);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no reconhecimento do alarme.");
    }
  };

  const severityLabel = (value: string) => {
    if (value === "fault") return "Crítico";
    if (value === "alarm") return "Alto";
    if (value === "warning") return "Médio";
    if (value === "info") return "Baixo";
    return value;
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          {
            icon: BellRing,
            label: "Alarmes abertos",
            value: pending.length,
            tone: pending.length ? "text-alert" : "text-online",
            sub: "Não reconhecidos",
          },
          {
            icon: ShieldAlert,
            label: "Críticos",
            value: severityCounts.fault,
            tone: "text-offline",
            sub: rows.length
              ? `${Math.round((severityCounts.fault / rows.length) * 100)}% do total`
              : "0% do total",
          },
          {
            icon: AlertTriangle,
            label: "Altos",
            value: severityCounts.alarm,
            tone: "text-primary",
            sub: rows.length
              ? `${Math.round((severityCounts.alarm / rows.length) * 100)}% do total`
              : "0% do total",
          },
          {
            icon: AlertTriangle,
            label: "Médios",
            value: severityCounts.warning,
            tone: "text-alert",
            sub: rows.length
              ? `${Math.round((severityCounts.warning / rows.length) * 100)}% do total`
              : "0% do total",
          },
          {
            icon: AlertTriangle,
            label: "Baixos",
            value: severityCounts.info,
            tone: "text-chart-2",
            sub: rows.length
              ? `${Math.round((severityCounts.info / rows.length) * 100)}% do total`
              : "0% do total",
          },
          {
            icon: CheckCircle2,
            label: "Reconhecidos",
            value: recognized.length,
            tone: "text-online",
            sub: "Na fila atual",
          },
        ]}
      />

      {error && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}

      <section className="rc-panel rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-panel)]">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1.6fr)_180px_180px_auto]">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por código, descrição, gerador ou origem..."
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              aria-label="Buscar alarmes"
            />
          </label>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-xs"
          >
            <option value="">Todas as severidades</option>
            <option value="fault">Crítico</option>
            <option value="alarm">Alto</option>
            <option value="warning">Médio</option>
            <option value="info">Baixo</option>
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-xs"
          >
            <option value="">Todos os status</option>
            <option value="open">Abertos</option>
            <option value="acked">Reconhecidos</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSeverity("");
              setStatus("");
            }}
            className="h-10 rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground hover:bg-secondary"
          >
            Limpar filtros
          </button>
        </div>
      </section>

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <Panel title={`Lista de alarmes (${filtered.length})`} className="xl:col-span-9">
          <div className="scroll-slim min-w-0 overflow-x-auto">
            <table className="rc-data-table w-full min-w-[900px] border-separate border-spacing-0 text-[12px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground">
                  {[
                    "Hora",
                    "Código",
                    "Gerador / asset",
                    "Descrição",
                    "Severidade",
                    "Status",
                    "Responsável",
                    "Ações",
                  ].map((label) => (
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
                {filtered.map((row) => {
                  const asset = row.generator_id
                    ? tagById.get(row.generator_id) || row.generator_id
                    : row.asset_id || "Sistema";
                  const active = selected?.alarm_key === row.alarm_key;
                  return (
                    <tr
                      key={row.alarm_key}
                      onClick={() => setSelectedKey(row.alarm_key)}
                      className={
                        active ? "bg-primary/[0.045]" : "cursor-pointer hover:bg-secondary/25"
                      }
                    >
                      <td className="border-b border-border/45 px-3 py-2.5 num">
                        {new Date(row.last_seen * 1000).toLocaleTimeString("pt-BR")}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 num font-semibold">
                        {row.code || "—"}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5 font-bold">{asset}</td>
                      <td className="max-w-[360px] border-b border-border/45 px-3 py-2.5">
                        <span className="block truncate">{row.message}</span>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <Pill tone={severityTone(row.severity)}>{severityLabel(row.severity)}</Pill>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <i
                            className={`size-1.5 rounded-full ${row.acked_at ? "bg-chart-2" : "bg-offline"}`}
                          />
                          {row.acked_at ? "Reconhecido" : "Aberto"}
                        </span>
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        {row.acked_by || "—"}
                      </td>
                      <td className="border-b border-border/45 px-3 py-2.5">
                        {!row.acked_at && can("operate") ? (
                          <ActionBtn onClick={() => void ack(row)}>Reconhecer</ActionBtn>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum alarme corresponde aos filtros.
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-3 xl:col-span-3">
          <Panel title="Resumo por prioridade">
            <div className="space-y-3">
              {[
                {
                  label: "Críticos",
                  value: severityCounts.fault,
                  tone: "bg-offline",
                  text: "text-offline",
                },
                {
                  label: "Altos",
                  value: severityCounts.alarm,
                  tone: "bg-primary",
                  text: "text-primary",
                },
                {
                  label: "Médios",
                  value: severityCounts.warning,
                  tone: "bg-alert",
                  text: "text-alert",
                },
                {
                  label: "Baixos",
                  value: severityCounts.info,
                  tone: "bg-chart-2",
                  text: "text-chart-2",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[70px_minmax(0,1fr)_30px] items-center gap-2 text-xs"
                >
                  <span className={`font-semibold ${item.text}`}>{item.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-secondary">
                    <i
                      className={`block h-full rounded-full ${item.tone}`}
                      style={{
                        width: `${rows.length ? Math.max(4, (item.value / rows.length) * 100) : 0}%`,
                      }}
                    />
                  </span>
                  <b className="num text-right">{item.value}</b>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border/60 pt-3 text-sm">
                <span className="text-muted-foreground">Total</span>
                <b className="num text-lg">{rows.length}</b>
              </div>
            </div>
          </Panel>

          <Panel title="Detalhe do alarme selecionado">
            {!selected ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Selecione um alarme.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Código</p>
                    <b className="num text-sm">{selected.code || "—"}</b>
                  </div>
                  <Pill tone={severityTone(selected.severity)}>
                    {severityLabel(selected.severity)}
                  </Pill>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Descrição</p>
                  <p className="mt-1 text-sm font-semibold leading-5">{selected.message}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Origem</p>
                  <p className="mt-1 text-xs">{selected.source}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-border/60 bg-background/25 p-2.5">
                    <span className="block text-[10px] text-muted-foreground">
                      Primeira ocorrência
                    </span>
                    <b className="mt-1 block num">{dt(selected.first_seen)}</b>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/25 p-2.5">
                    <span className="block text-[10px] text-muted-foreground">
                      Última ocorrência
                    </span>
                    <b className="mt-1 block num">{dt(selected.last_seen)}</b>
                  </div>
                </div>
                {selected.acked_at ? (
                  <div className="rounded-lg border border-online/25 bg-online/8 p-3 text-xs text-online">
                    Reconhecido por {selected.acked_by || "operador"} em {dt(selected.acked_at)}.
                  </div>
                ) : can("operate") ? (
                  <button
                    type="button"
                    onClick={() => void ack(selected)}
                    className="h-11 w-full rounded-lg bg-primary text-sm font-extrabold text-primary-foreground hover:bg-primary/90"
                  >
                    Reconhecer alarme
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Seu perfil é somente leitura para esta ação.
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Ocorrências recentes">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {rows.slice(0, 6).map((row) => (
            <button
              key={row.alarm_key}
              type="button"
              onClick={() => setSelectedKey(row.alarm_key)}
              className="min-w-0 rounded-xl border border-border/65 bg-background/25 p-3 text-left transition-colors hover:border-primary/35"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="num text-[10px] text-muted-foreground">
                  {new Date(row.last_seen * 1000).toLocaleTimeString("pt-BR")}
                </span>
                <span
                  className={`size-2 rounded-full ${row.severity === "fault" ? "bg-offline" : row.severity === "info" ? "bg-chart-2" : "bg-alert"}`}
                />
              </div>
              <b className="mt-1 block truncate text-xs">
                {row.generator_id
                  ? tagById.get(row.generator_id) || row.generator_id
                  : row.asset_id || "Sistema"}
              </b>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{row.message}</p>
            </button>
          ))}
          {!rows.length && (
            <p className="py-6 text-sm text-muted-foreground">Nenhuma ocorrência ativa.</p>
          )}
        </div>
      </Panel>
    </ScreenBody>
  );
}
