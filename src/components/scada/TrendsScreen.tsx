import { useEffect, useState } from "react";

import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type RapidMetric, type RapidTrend } from "@/lib/api";
import { Panel, ScreenBody, Trend } from "./kit";
import { shortTime } from "./operation-helpers";

export function TrendsScreen() {
  const { generators } = useGenerators();
  const [generatorId, setGeneratorId] = useState("");
  const [metrics, setMetrics] = useState<RapidMetric[]>([]);
  const [metric, setMetric] = useState("");
  const [hours, setHours] = useState(24);
  const [trend, setTrend] = useState<RapidTrend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!generatorId && generators.length) setGeneratorId(generators[0]!.id);
  }, [generatorId, generators]);

  useEffect(() => {
    let active = true;
    if (!generatorId) {
      setMetrics([]);
      setMetric("");
      setTrend(null);
      return;
    }
    void rcApi.generators
      .metrics(generatorId)
      .then((rows) => {
        if (!active) return;
        setMetrics(rows);
        setMetric((prev) => (rows.some((x) => x.key === prev) ? prev : rows[0]?.key || ""));
        setError(null);
      })
      .catch((err) => {
        if (active) {
          setMetrics([]);
          setMetric("");
          setTrend(null);
          setError(err instanceof Error ? err.message : "Falha ao consultar métricas Rapid.");
        }
      });
    return () => {
      active = false;
    };
  }, [generatorId]);

  useEffect(() => {
    let active = true;
    if (!generatorId || !metric) {
      setTrend(null);
      return;
    }
    setLoading(true);
    void rcApi.generators
      .trend(generatorId, metric, hours, hours <= 48 ? 1 : hours <= 24 * 14 ? 2 : 3)
      .then((data) => {
        if (active) {
          setTrend(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setTrend(null);
          setError(
            err instanceof Error ? err.message : "Histórico ainda indisponível no Rapid SCADA.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [generatorId, metric, hours]);

  const chart = (trend?.points ?? []).map((p) => ({ t: shortTime(p.timestamp), v: p.value }));
  const selected = generators.find((g) => g.id === generatorId);

  return (
    <ScreenBody>
      <Panel title="Tendência Rapid SCADA">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] font-semibold text-muted-foreground">
            Gerador
            <select
              value={generatorId}
              onChange={(e) => setGeneratorId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Selecione</option>
              {generators.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.tag} — {g.controller}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Métrica disponível no Controller Pack
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              disabled={!metrics.length}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Sem métrica</option>
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.key} · canal {m.cnl}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground">
            Período
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value={6}>6 horas</option>
              <option value={24}>24 horas</option>
              <option value={168}>7 dias</option>
              <option value={720}>30 dias</option>
            </select>
          </label>
        </div>
      </Panel>
      {error && (
        <p className="rounded-md border border-alert/40 bg-alert/10 p-3 text-sm text-alert">
          {error}
        </p>
      )}
      <Panel title={selected && metric ? `${selected.tag} · ${metric}` : "Histórico"}>
        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Consultando arquivo do Rapid SCADA…
          </p>
        ) : chart.length ? (
          <Trend data={chart} />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Sem pontos históricos definidos para a seleção.
          </p>
        )}
      </Panel>
    </ScreenBody>
  );
}
