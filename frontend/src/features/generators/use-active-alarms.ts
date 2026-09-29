import { useEffect, useState } from "react";

import { industrialApi, type IndustrialAlarm } from "@/lib/industrial-api";

let cachedAlarms: IndustrialAlarm[] | null = null;
let inflight: Promise<IndustrialAlarm[]> | null = null;
const listeners = new Set<(alarms: IndustrialAlarm[]) => void>();

async function loadActiveAlarms(force = false) {
  if (!force && cachedAlarms) return cachedAlarms;
  if (!inflight) {
    inflight = industrialApi.alarms
      .list(true)
      .then((rows) => {
        cachedAlarms = rows.filter((row) => row.active);
        return cachedAlarms;
      })
      .catch(() => {
        cachedAlarms = cachedAlarms ?? [];
        return cachedAlarms;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function notify(alarms: IndustrialAlarm[]) {
  for (const listener of listeners) listener(alarms);
}

/** Shared active industrial alarms (one fetch for all vertical cards). */
export function useActiveIndustrialAlarms(pollMs = 15000) {
  const [alarms, setAlarms] = useState<IndustrialAlarm[]>(cachedAlarms ?? []);

  useEffect(() => {
    let alive = true;
    const onUpdate = (next: IndustrialAlarm[]) => {
      if (alive) setAlarms(next);
    };
    listeners.add(onUpdate);

    void loadActiveAlarms().then((rows) => {
      if (alive) {
        setAlarms(rows);
        notify(rows);
      }
    });

    const timer = window.setInterval(() => {
      void loadActiveAlarms(true).then((rows) => {
        if (alive) {
          setAlarms(rows);
          notify(rows);
        }
      });
    }, pollMs);

    return () => {
      alive = false;
      listeners.delete(onUpdate);
      window.clearInterval(timer);
    };
  }, [pollMs]);

  return alarms;
}
