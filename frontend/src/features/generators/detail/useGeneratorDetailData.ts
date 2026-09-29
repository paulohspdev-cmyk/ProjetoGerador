import { useEffect, useMemo, useState } from "react";

import type { Generator } from "@/data/generators";
import { rcApi, type EventItemApi, type RapidMetric, type RapidTrend } from "@/lib/api";

const DETAIL_REFRESH_MS = 10_000;
const DETAIL_TREND_REFRESH_MS = 60_000;

const DETAIL_TREND_PRIORITY = [
  "voltage_l1",
  "voltage_l2",
  "voltage_l3",
  "current_l1",
  "current_l2",
  "current_l3",
  "power_kw",
  "power_kva",
  "power_kvar",
  "power_factor",
  "frequency",
  "voltage_l1_l2",
  "voltage_l2_l3",
  "voltage_l3_l1",
  "rpm",
  "oil_pressure",
  "coolant_temperature",
  "fuel_level",
  "battery_voltage",
  "engine_load",
  "alternator_voltage",
  "mains_voltage_l1",
  "mains_voltage_l2",
  "mains_voltage_l3",
  "mains_voltage_l1_l2",
  "mains_voltage_l2_l3",
  "mains_voltage_l3_l1",
  "mains_frequency",
  "mains_power_kw",
  "mains_power_factor",
] as const;

export type GeneratorDetailTrendMap = Record<string, RapidTrend>;
export type GeneratorDetailTrendHours = 1 | 6 | 24 | 168;

function archiveBitForHours(hours: GeneratorDetailTrendHours) {
  return hours <= 24 ? 1 : 2;
}

export function useGeneratorDetailData(gen: Generator) {
  const [events, setEvents] = useState<EventItemApi[]>([]);
  const [eventError, setEventError] = useState("");
  const [trendMetrics, setTrendMetrics] = useState<RapidMetric[]>([]);
  const [trends, setTrends] = useState<GeneratorDetailTrendMap>({});
  const [trendErrors, setTrendErrors] = useState<Record<string, string>>({});
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendHours, setTrendHours] = useState<GeneratorDetailTrendHours>(24);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const rows = await rcApi.events.list(300, gen.id);
        if (!active) return;
        setEvents(rows);
        setEventError("");
      } catch (error) {
        if (active)
          setEventError(
            error instanceof Error ? error.message : "Falha ao carregar eventos reais.",
          );
      } finally {
        if (active) timer = window.setTimeout(load, DETAIL_REFRESH_MS);
      }
    };
    void load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [gen.id]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const load = async () => {
      setTrendsLoading(true);
      try {
        const available = await rcApi.generators.metrics(gen.id);
        if (!active) return;
        setTrendMetrics(available);

        const availableKeys = new Set(available.map((item) => item.key));
        const keys = DETAIL_TREND_PRIORITY.filter((key) => availableKeys.has(key));

        if (!keys.length) {
          setTrends({});
          setTrendErrors({});
          return;
        }

        const nextTrends: GeneratorDetailTrendMap = {};
        const nextErrors: Record<string, string> = {};

        for (let offset = 0; offset < keys.length; offset += 4) {
          const batch = keys.slice(offset, offset + 4);
          const results = await Promise.allSettled(
            batch.map(
              async (key) =>
                [
                  key,
                  await rcApi.generators.trend(
                    gen.id,
                    key,
                    trendHours,
                    archiveBitForHours(trendHours),
                  ),
                ] as const,
            ),
          );
          if (!active) return;

          for (let index = 0; index < results.length; index += 1) {
            const result = results[index]!;
            const key = batch[index]!;
            if (result.status === "fulfilled") {
              nextTrends[key] = result.value[1];
            } else {
              nextErrors[key] =
                result.reason instanceof Error
                  ? result.reason.message
                  : "Histórico indisponível para esta métrica.";
            }
          }

          setTrends({ ...nextTrends });
          setTrendErrors({ ...nextErrors });
        }
      } catch (error) {
        if (!active) return;
        setTrendMetrics([]);
        setTrends({});
        setTrendErrors({
          __metrics__:
            error instanceof Error
              ? error.message
              : "Falha ao consultar métricas históricas do gerador.",
        });
      } finally {
        if (active) {
          setTrendsLoading(false);
          timer = window.setTimeout(load, DETAIL_TREND_REFRESH_MS);
        }
      }
    };

    void load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [gen.id, trendHours]);

  const configuredTrendMetrics = useMemo(
    () => new Set(trendMetrics.map((item) => item.key)),
    [trendMetrics],
  );

  return {
    events,
    eventError,
    trends,
    trendErrors,
    trendsLoading,
    configuredTrendMetrics,
    trendHours,
    setTrendHours,
  };
}
