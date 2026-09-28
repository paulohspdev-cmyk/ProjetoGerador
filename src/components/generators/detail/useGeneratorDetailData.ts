import { useEffect, useState } from "react";

import type { Generator } from "@/data/generators";
import { rcApi, type EventItemApi } from "@/lib/api";

const DETAIL_REFRESH_MS = 10_000;

export function useGeneratorDetailData(gen: Generator) {
  const [events, setEvents] = useState<EventItemApi[]>([]);
  const [eventError, setEventError] = useState("");

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

  return {
    events,
    eventError,
  };
}
