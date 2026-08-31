import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  rcApi,
  type AgendaItemApi,
  type AlarmAckApi,
  type AutomationRuleApi,
  type BackupApi,
  type OpsClient,
  type ReportApi,
  type WebhookApi,
  type WorkOrderApi,
} from "@/lib/api";
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
  window.setTimeout(() => el.remove(), 2400);
}

export type ReportRow = ReportApi;
export type AgendaItem = AgendaItemApi;
export type RuleRow = AutomationRuleApi;
export type ClientRow = OpsClient;
export type BackupRow = BackupApi;
export type WebhookRow = WebhookApi;
export type WorkOrder = WorkOrderApi;

type OpsState = {
  settings: Record<string, unknown>;
  alarmAcks: AlarmAckApi[];
  reports: ReportRow[];
  workOrders: WorkOrder[];
  agenda: AgendaItem[];
  rules: RuleRow[];
  clients: ClientRow[];
  backups: BackupRow[];
  webhooks: WebhookRow[];
};

const empty: OpsState = {
  settings: {},
  alarmAcks: [],
  reports: [],
  workOrders: [],
  agenda: [],
  rules: [],
  clients: [],
  backups: [],
  webhooks: [],
};

type Ctx = {
  ready: boolean;
  error: string;
  refresh: () => Promise<void>;
  switches: Record<string, boolean>;
  switchOn: (id: string, fallback?: boolean) => boolean;
  toggleSwitch: (id: string, fallback?: boolean) => void;
  acks: Record<string, boolean>;
  isAcked: (id: string, seedAck: boolean) => boolean;
  ackAlarm: (id: string) => void;
  ackAll: (ids: string[]) => void;
  reports: ReportRow[];
  generateReport: (
    input: { name: string; period: string; format: string },
    gens: Generator[],
  ) => void;
  downloadReport: (id: string, gens: Generator[]) => void;
  workOrders: WorkOrder[];
  setWorkOrderStatus: (id: string, status: string) => void;
  addWorkOrder: (input: { gen: string; type: string; site: string; tech?: string }) => void;
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

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function stateFromPayload(payload: Awaited<ReturnType<typeof rcApi.ops.bootstrap>>): OpsState {
  return {
    settings: payload.settings ?? {},
    alarmAcks: payload.alarmAcks ?? [],
    reports: payload.reports ?? [],
    workOrders: payload.workOrders ?? [],
    agenda: payload.agenda ?? [],
    rules: payload.rules ?? [],
    clients: payload.clients ?? [],
    backups: payload.backups ?? [],
    webhooks: payload.webhooks ?? [],
  };
}

export function ScadaOpsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpsState>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const payload = await rcApi.ops.bootstrap();
      setState(stateFromPayload(payload));
      setError("");
    } catch (err) {
      setError(message(err, "Falha ao carregar dados operacionais."));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switches = useMemo(() => {
    const values: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(state.settings)) {
      if (!key.startsWith("switch.")) continue;
      values[key.slice(7)] = Boolean(value);
    }
    return values;
  }, [state.settings]);

  const ackMap = useMemo(() => {
    const values: Record<string, boolean> = {};
    for (const item of state.alarmAcks) values[item.alarmKey] = true;
    return values;
  }, [state.alarmAcks]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      error,
      refresh,
      switches,
      switchOn: (id, fallback = true) => switches[id] ?? fallback,
      toggleSwitch: (id, fallback = true) => {
        const next = !(switches[id] ?? fallback);
        setState((prev) => ({
          ...prev,
          settings: { ...prev.settings, [`switch.${id}`]: next },
        }));
        void rcApi.settings
          .set(`switch.${id}`, next)
          .then(() => notify(next ? "Ligado" : "Desligado"))
          .catch((err) => {
            notify(message(err, "Não foi possível alterar a configuração."));
            void refresh();
          });
      },
      acks: ackMap,
      isAcked: (id, seedAck) => ackMap[id] ?? seedAck,
      ackAlarm: (id) => {
        void rcApi.alarms
          .acknowledge(id)
          .then((ack) => {
            setState((prev) => ({
              ...prev,
              alarmAcks: [ack, ...prev.alarmAcks.filter((x) => x.alarmKey !== id)],
            }));
            notify("Alarme reconhecido");
          })
          .catch((err) => notify(message(err, "Falha ao reconhecer alarme.")));
      },
      ackAll: (ids) => {
        void Promise.all(ids.map((id) => rcApi.alarms.acknowledge(id)))
          .then((items) => {
            setState((prev) => {
              const keys = new Set(items.map((x) => x.alarmKey));
              return {
                ...prev,
                alarmAcks: [...items, ...prev.alarmAcks.filter((x) => !keys.has(x.alarmKey))],
              };
            });
            notify("Alarmes reconhecidos");
          })
          .catch((err) => notify(message(err, "Falha ao reconhecer alarmes.")));
      },
      reports: state.reports,
      generateReport: (input) => {
        void rcApi.reports
          .create(input)
          .then(async (report) => {
            setState((prev) => ({ ...prev, reports: [report, ...prev.reports] }));
            await rcApi.reports.download(report.id);
            notify("Relatório gerado");
          })
          .catch((err) => notify(message(err, "Falha ao gerar relatório.")));
      },
      downloadReport: (id) => {
        void rcApi.reports
          .download(id)
          .then(() => notify("Download iniciado"))
          .catch((err) => notify(message(err, "Falha no download.")));
      },
      workOrders: state.workOrders,
      setWorkOrderStatus: (id, status) => {
        void rcApi.workOrders
          .update(id, { status })
          .then((updated) => {
            setState((prev) => ({
              ...prev,
              workOrders: prev.workOrders.map((workOrder) =>
                workOrder.id === id ? updated : workOrder,
              ),
            }));
            notify(`OS ${id}: ${status}`);
          })
          .catch((err) => notify(message(err, "Falha ao atualizar ordem de serviço.")));
      },
      addWorkOrder: (input) => {
        void rcApi.workOrders
          .create({
            ...input,
            due: 0,
            tech: input.tech?.trim() || "",
            status: "Planejada",
          })
          .then((created) => {
            setState((prev) => ({ ...prev, workOrders: [created, ...prev.workOrders] }));
            notify("Ordem de serviço criada");
          })
          .catch((err) => notify(message(err, "Falha ao criar ordem de serviço.")));
      },
      agenda: state.agenda,
      addAgenda: (input) => {
        void rcApi.agenda
          .create(input)
          .then((created) => {
            setState((prev) => ({ ...prev, agenda: [created, ...prev.agenda] }));
            notify("Compromisso adicionado");
          })
          .catch((err) => notify(message(err, "Falha ao adicionar compromisso.")));
      },
      rules: state.rules,
      toggleRule: (id) => {
        const current = state.rules.find((rule) => rule.id === id);
        if (!current) return;
        void rcApi.rules
          .update(id, { enabled: !current.enabled })
          .then((updated) => {
            setState((prev) => ({
              ...prev,
              rules: prev.rules.map((rule) => (rule.id === id ? updated : rule)),
            }));
            notify(updated.enabled ? "Regra habilitada" : "Regra desabilitada");
          })
          .catch((err) => notify(message(err, "Falha ao alterar regra.")));
      },
      clients: state.clients,
      addClient: (input) => {
        void rcApi.clients
          .create(input)
          .then((created) => {
            setState((prev) => ({ ...prev, clients: [...prev.clients, created] }));
            notify("Cliente cadastrado");
          })
          .catch((err) => notify(message(err, "Falha ao cadastrar cliente.")));
      },
      backups: state.backups,
      runBackup: () => {
        void rcApi.backups
          .create()
          .then((created) => {
            setState((prev) => ({ ...prev, backups: [created, ...prev.backups] }));
            notify(created.result === "OK" ? "Backup concluído" : "Backup falhou");
          })
          .catch((err) => notify(message(err, "Falha ao executar backup.")));
      },
      webhooks: state.webhooks,
      toggleWebhook: (id) => {
        const current = state.webhooks.find((webhook) => webhook.id === id);
        if (!current) return;
        const status = current.status === "Ativo" ? "Pausado" : "Ativo";
        void rcApi.webhooks
          .update(id, { status })
          .then((updated) => {
            setState((prev) => ({
              ...prev,
              webhooks: prev.webhooks.map((webhook) => (webhook.id === id ? updated : webhook)),
            }));
          })
          .catch((err) => notify(message(err, "Falha ao alterar webhook.")));
      },
    }),
    [ackMap, error, ready, refresh, state, switches],
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
