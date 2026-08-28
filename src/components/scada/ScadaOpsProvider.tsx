import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { agendaItems, backups, clients, reports, rules, webhooks, workOrders, type WorkOrder } from "@/data/scada";
import { downloadText, nowStamp } from "@/lib/download";
import type { Generator } from "@/data/generators";

function notify(message: string) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute(
    "style",
    "position:fixed;bottom:1rem;right:1rem;z-index:9999;border-radius:0.375rem;border:1px solid var(--border);background:var(--card);color:var(--foreground);padding:0.5rem 0.75rem;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.35)",
  );
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2200);
}

const OPS_KEY = "rc-scada-ops";

export type ReportRow = (typeof reports)[number] & { body?: string };
export type AgendaItem = (typeof agendaItems)[number];
export type RuleRow = (typeof rules)[number];
export type ClientRow = (typeof clients)[number];
export type BackupRow = (typeof backups)[number];
export type WebhookRow = (typeof webhooks)[number];

type OpsState = {
  switches: Record<string, boolean>;
  acks: Record<string, boolean>;
  reports: ReportRow[];
  workOrders: WorkOrder[];
  agenda: AgendaItem[];
  rules: RuleRow[];
  clients: ClientRow[];
  backups: BackupRow[];
  webhooks: WebhookRow[];
};

const seed: OpsState = {
  switches: {},
  acks: {},
  reports: reports.map((r) => ({ ...r })),
  workOrders: workOrders.map((w) => ({ ...w })),
  agenda: agendaItems.map((a) => ({ ...a })),
  rules: rules.map((r) => ({ ...r })),
  clients: clients.map((c) => ({ ...c })),
  backups: backups.map((b) => ({ ...b })),
  webhooks: webhooks.map((w) => ({ ...w })),
};

function loadOps(): OpsState {
  try {
    const raw = localStorage.getItem(OPS_KEY);
    if (!raw) return structuredClone(seed);
    const parsed = JSON.parse(raw) as Partial<OpsState>;
    return {
      switches: parsed.switches ?? {},
      acks: parsed.acks ?? {},
      reports: parsed.reports?.length ? parsed.reports : structuredClone(seed.reports),
      workOrders: parsed.workOrders?.length ? parsed.workOrders : structuredClone(seed.workOrders),
      agenda: parsed.agenda?.length ? parsed.agenda : structuredClone(seed.agenda),
      rules: parsed.rules?.length ? parsed.rules : structuredClone(seed.rules),
      clients: parsed.clients?.length ? parsed.clients : structuredClone(seed.clients),
      backups: parsed.backups?.length ? parsed.backups : structuredClone(seed.backups),
      webhooks: parsed.webhooks?.length ? parsed.webhooks : structuredClone(seed.webhooks),
    };
  } catch {
    return structuredClone(seed);
  }
}

function parkCsv(gens: Generator[]) {
  const head = "Gerador;Site;Status;Carga kW;Combustível %;Horímetro h;Controladora";
  const rows = gens.map(
    (g) => `${g.tag};${g.site};${g.status};${g.load};${g.fuelLevel};${g.runHours};${g.controller}`,
  );
  return [head, ...rows].join("\n");
}

type Ctx = {
  switches: Record<string, boolean>;
  switchOn: (id: string, fallback?: boolean) => boolean;
  toggleSwitch: (id: string, fallback?: boolean) => void;
  acks: Record<string, boolean>;
  isAcked: (id: string, seedAck: boolean) => boolean;
  ackAlarm: (id: string) => void;
  ackAll: (ids: string[]) => void;
  reports: ReportRow[];
  generateReport: (input: { name: string; period: string; format: string }, gens: Generator[]) => void;
  downloadReport: (id: string, gens: Generator[]) => void;
  workOrders: WorkOrder[];
  setWorkOrderStatus: (id: string, status: WorkOrder["status"]) => void;
  addWorkOrder: (input: { gen: string; type: string; site: string }) => void;
  agenda: AgendaItem[];
  addAgenda: (input: { title: string; when: string; site: string }) => void;
  rules: RuleRow[];
  toggleRule: (id: string) => void;
  clients: ClientRow[];
  addClient: (input: { name: string; units: number; gens: number; sla: string }) => void;
  backups: BackupRow[];
  runBackup: () => void;
  webhooks: WebhookRow[];
  toggleWebhook: (id: string) => void;
};

const ScadaOpsContext = createContext<Ctx | null>(null);

export function ScadaOpsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpsState>(() => (typeof window === "undefined" ? structuredClone(seed) : loadOps()));

  const persist = useCallback((next: OpsState) => {
    try {
      localStorage.setItem(OPS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
    return next;
  }, []);

  const patch = useCallback((fn: (prev: OpsState) => OpsState) => {
    setState((prev) => persist(fn(prev)));
  }, [persist]);

  const value = useMemo<Ctx>(
    () => ({
      switches: state.switches,
      switchOn: (id, fallback = true) => state.switches[id] ?? fallback,
      toggleSwitch: (id, fallback = true) => {
        patch((p) => {
          const next = !(p.switches[id] ?? fallback);
          notify(next ? "Ligado" : "Desligado");
          return { ...p, switches: { ...p.switches, [id]: next } };
        });
      },
      acks: state.acks,
      isAcked: (id, seedAck) => state.acks[id] ?? seedAck,
      ackAlarm: (id) => {
        patch((p) => ({ ...p, acks: { ...p.acks, [id]: true } }));
        notify("Alarme reconhecido");
      },
      ackAll: (ids) => {
        patch((p) => {
          const next = { ...p.acks };
          for (const id of ids) next[id] = true;
          return { ...p, acks: next };
        });
        notify("Alarmes reconhecidos");
      },
      reports: state.reports,
      generateReport: (input, gens) => {
        const body = parkCsv(gens);
        patch((p) => {
          const id = `REL-${String(p.reports.length + 1).padStart(3, "0")}`;
          const row: ReportRow = {
            id,
            name: input.name,
            period: input.period,
            format: input.format,
            status: "Pronto",
            body,
          };
          downloadText(`${id}.csv`, body);
          return { ...p, reports: [row, ...p.reports] };
        });
        notify("Relatório gerado e baixado");
      },
      downloadReport: (id, gens) => {
        patch((p) => {
          const found = p.reports.find((r) => r.id === id);
          const body = found?.body ?? parkCsv(gens);
          downloadText(`${id}.csv`, body);
          return {
            ...p,
            reports: p.reports.map((r) => (r.id === id ? { ...r, status: "Pronto", body } : r)),
          };
        });
        notify("Download iniciado");
      },
      workOrders: state.workOrders,
      setWorkOrderStatus: (id, status) => {
        patch((p) => ({
          ...p,
          workOrders: p.workOrders.map((w) => (w.id === id ? { ...w, status } : w)),
        }));
        notify(`OS ${id}: ${status}`);
      },
      addWorkOrder: (input) => {
        patch((p) => {
          const id = `OS-${1200 + p.workOrders.length + 1}`;
          const row: WorkOrder = {
            id,
            gen: input.gen,
            site: input.site,
            type: input.type,
            due: 40,
            tech: "Equipe campo",
            status: "Planejada",
          };
          return { ...p, workOrders: [row, ...p.workOrders] };
        });
        notify("Ordem de serviço criada");
      },
      agenda: state.agenda,
      addAgenda: (input) => {
        const row: AgendaItem = { id: `AG-${Date.now()}`, ...input };
        patch((p) => ({ ...p, agenda: [row, ...p.agenda] }));
        notify("Compromisso adicionado");
      },
      rules: state.rules,
      toggleRule: (id) => {
        patch((p) => ({
          ...p,
          rules: p.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
        }));
      },
      clients: state.clients,
      addClient: (input) => {
        const row: ClientRow = { id: `C-${Date.now()}`, ...input };
        patch((p) => ({ ...p, clients: [row, ...p.clients] }));
        notify("Cliente cadastrado");
      },
      backups: state.backups,
      runBackup: () => {
        const row: BackupRow = {
          id: `BK-${Date.now()}`,
          when: nowStamp(),
          size: "186 MB",
          type: "Manual",
          result: "OK",
        };
        patch((p) => ({ ...p, backups: [row, ...p.backups] }));
        notify("Backup concluído");
      },
      webhooks: state.webhooks,
      toggleWebhook: (id) => {
        patch((p) => ({
          ...p,
          webhooks: p.webhooks.map((w) =>
            w.id === id ? { ...w, status: w.status === "Ativo" ? "Pausado" : "Ativo" } : w,
          ),
        }));
      },
    }),
    [patch, state],
  );

  return <ScadaOpsContext.Provider value={value}>{children}</ScadaOpsContext.Provider>;
}

export function useScadaOps() {
  const ctx = useContext(ScadaOpsContext);
  if (!ctx) throw new Error("useScadaOps must be used within ScadaOpsProvider");
  return ctx;
}

export function useCommandGuard() {
  const { switchOn } = useScadaOps();
  return (label: string) => {
    if (!switchOn("cfg-confirm", true)) return true;
    return window.confirm(`Confirmar comando ${label}?`);
  };
}
