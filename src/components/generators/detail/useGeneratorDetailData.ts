import { useEffect, useMemo, useState } from "react";

import type { Generator } from "@/data/generators";
import { rcApi, type EventItemApi, type RapidTrend } from "@/lib/api";

const TREND_PRIORITY = [
  "frequency",
  "rpm",
  "voltage_l1_l2",
  "voltage_l1",
  "voltage_l2",
  "voltage_l3",
  "power_kw",
];

export function useGeneratorDetailData(gen: Generator) {
  const [events, setEvents] = useState<EventItemApi[]>([]);
  const [eventError, setEventError] = useState("");
  const [trend, setTrend] = useState<RapidTrend | null>(null);
  const [trendError, setTrendError] = useState("");
  const [trendLoading, setTrendLoading] = useState(false);

  const available = useMemo(() => new Set(gen.availableMetrics ?? []), [gen.availableMetrics]);
  const preferredTrend = useMemo(
    () => TREND_PRIORITY.find((key) => available.has(key)) ?? [...available][0] ?? "",
    [available],
  );

  useEffect(() => {
    let active = true;
    void rcApi.events
      .list(300)
      .then((rows) => {
        if (!active) return;
        setEvents(
          rows.filter(
            (item) =>
              item.generator_id === gen.id || item.tag?.toLowerCase() === gen.tag.toLowerCase(),
          ),
        );
        setEventError("");
      })
      .catch((error) => {
        if (active) {
          setEventError(
            error instanceof Error ? error.message : "Falha ao carregar eventos reais.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [gen.id, gen.tag]);

  useEffect(() => {
    if (!preferredTrend) {
      setTrend(null);
      setTrendError("");
      return;
    }

    let active = true;
    setTrendLoading(true);
    void rcApi.generators
      .trend(gen.id, preferredTrend, 24, 1)
      .then((result) => {
        if (!active) return;
        setTrend(result);
        setTrendError("");
      })
      .catch((error) => {
        if (!active) return;
        setTrend(null);
        setTrendError(error instanceof Error ? error.message : "Histórico indisponível.");
      })
      .finally(() => {
        if (active) setTrendLoading(false);
      });

    return () => {
      active = false;
    };
  }, [gen.id, preferredTrend]);

  return {
    available,
    events,
    eventError,
    trend,
    trendError,
    trendLoading,
  };
}
