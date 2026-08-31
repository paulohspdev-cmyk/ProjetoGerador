import { Bell, RefreshCcw, Settings2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type AutomationRuleApi, type NotificationItem } from "@/lib/api";
import { useScadaOps } from "./ScadaOpsProvider";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

export { ConnectivityScreen, GatewaysScreen, ModemsScreen } from "./equip-connectivity";

function errText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação";
}

export function CommunicationScreen() {
  const { generators } = useGenerators();
  return (
    <ScreenBody>
      <Panel title="Comunicação industrial">
        <div className="space-y-3 text-[13px]">
          <p className="rounded-md border border-border p-3">
            Acompanhe aqui o estado de comunicação de cada gerador. Detalhes de integração ficam
            restritos às telas administrativas.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {generators.map((g) => (
              <div key={g.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <b>{g.tag}</b>
                  <Pill tone={g.telemetrySource === "rapid_scada" ? "ok" : "muted"}>
                    {g.telemetrySource === "rapid_scada" ? "DISPONÍVEL" : "N/D"}
                  </Pill>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{g.controller}</p>
                <p className="num mt-1 text-[11px]">{g.ip || "Endpoint não informado"}</p>
                {g.lastError && <p className="mt-1 text-[11px] text-offline">{g.lastError}</p>}
              </div>
            ))}
          </div>
          {!generators.length && (
            <p className="py-8 text-center text-muted-foreground">Nenhum gerador cadastrado.</p>
          )}
        </div>
      </Panel>
    </ScreenBody>
  );
}

export function RulesScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const { generators } = useGenerators();
  const { rules, refresh } = useScadaOps();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("generator_offline");
  const [generator, setGenerator] = useState("");
  const [actionType, setActionType] = useState("notify");
  const [actionValue, setActionValue] = useState("panel");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!generator && generators.length) setGenerator(generators[0]!.tag);
  }, [generator, generators]);

  const reset = () => {
    setEditing(null);
    setName("");
    setTriggerType("generator_offline");
    setGenerator(generators[0]?.tag ?? "");
    setActionType("notify");
    setActionValue("panel");
  };

  const parseRule = (row: AutomationRuleApi) => {
    const trigger = row.trigger.split(":", 2);
    const action = row.action.split(":", 2);
    setEditing(row.id);
    setName(row.name);
    setTriggerType(trigger[0] || "generator_offline");
    setGenerator(trigger[1] || "");
    setActionType(action[0] || "notify");
    setActionValue(action[1] || "panel");
    setError("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!generator) {
      setError("Selecione um gerador.");
      return;
    }
    const trigger = `${triggerType}:${generator}`;
    const action = `${actionType}:${actionValue.trim() || (actionType === "notify" ? "panel" : "Inspeção")}`;
    try {
      if (editing) {
        const current = rules.find((rule) => rule.id === editing);
        if (current?.enabled) await rcApi.rules.enable(editing, false);
        await rcApi.rules.update(editing, { name: name.trim(), trigger, action });
      } else {
        await rcApi.rules.create({ name: name.trim(), trigger, action });
      }
      reset();
      await refresh();
    } catch (saveError) {
      setError(errText(saveError));
    }
  };

  const toggle = async (id: string) => {
    const current = rules.find((rule) => rule.id === id);
    if (!current) return;
    setBusy(id);
    setError("");
    try {
      if (!current.enabled && current.safetyState !== "approved_nonindustrial")
        await rcApi.rules.approve(id);
      await rcApi.rules.enable(id, !current.enabled);
      await refresh();
    } catch (toggleError) {
      setError(errText(toggleError));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: AutomationRuleApi) => {
    if (row.enabled) {
      setError("Desative a regra antes de excluir.");
      return;
    }
    if (!window.confirm(`Excluir a regra ${row.name}?`)) return;
    try {
      await rcApi.rules.remove(row.id);
      if (editing === row.id) reset();
      await refresh();
    } catch (removeError) {
      setError(errText(removeError));
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Settings2, label: "Regras cadastradas", value: rules.length },
          { icon: Settings2, label: "Ativas", value: rules.filter((r) => r.enabled).length },
        ]}
      />
      <p className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-muted-foreground">
        Motor fechado: somente generator_online / generator_offline / generator_alert → notify /
        work_order. START, STOP, MCB, GCB e paralelismo são rejeitados pelo backend deste motor.
      </p>
      {error && <p className="text-[11px] text-offline">{error}</p>}
      {admin && (
        <Panel title={editing ? "Editar regra não industrial" : "Nova regra não industrial"}>
          <form onSubmit={save} className="grid gap-2 lg:grid-cols-5">
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da regra"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="generator_offline">Gerador offline</option>
              <option value="generator_online">Gerador online</option>
              <option value="generator_alert">Gerador em alerta</option>
            </select>
            <select
              value={generator}
              onChange={(e) => setGenerator(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {generators.map((g) => (
                <option key={g.id} value={g.tag}>
                  {g.tag}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-1">
              <select
                value={actionType}
                onChange={(e) => {
                  setActionType(e.target.value);
                  setActionValue(e.target.value === "notify" ? "panel" : "Inspeção");
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="notify">Notificar</option>
                <option value="work_order">Criar OS</option>
              </select>
              <input
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                placeholder={actionType === "notify" ? "panel/email/..." : "Inspeção"}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
            <div className="flex gap-1">
              <button className="h-9 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground">
                {editing ? "Salvar" : "Criar"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={reset}
                  className="h-9 rounded-md border border-border px-3 text-xs"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </Panel>
      )}
      <Panel title="Regras de automação">
        {!rules.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma regra cadastrada.
          </p>
        ) : (
          <ScadaTable
            rows={rules}
            columns={[
              { label: "Regra", render: (r) => <b>{r.name}</b> },
              {
                label: "Gatilho",
                render: (r) => <span className="num text-[11px]">{r.trigger}</span>,
              },
              { label: "Ação", render: (r) => <span className="num text-[11px]">{r.action}</span> },
              {
                label: "Homologação",
                render: (r) => (
                  <Pill tone={r.safetyState === "approved_nonindustrial" ? "ok" : "warn"}>
                    {r.safetyState || "draft"}
                  </Pill>
                ),
              },
              {
                label: "Estado",
                render: (r) => (
                  <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "ON" : "OFF"}</Pill>
                ),
              },
              {
                label: "Ações",
                render: (r) =>
                  admin ? (
                    <span className="flex flex-wrap gap-1">
                      <ActionBtn disabled={busy === r.id} onClick={() => void toggle(r.id)}>
                        {busy === r.id ? "Aguarde" : r.enabled ? "Desligar" : "Aprovar e ligar"}
                      </ActionBtn>
                      <ActionBtn onClick={() => parseRule(r)}>Editar</ActionBtn>
                      <ActionBtn tone="danger" disabled={r.enabled} onClick={() => void remove(r)}>
                        Excluir
                      </ActionBtn>
                    </span>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        )}
      </Panel>
    </ScreenBody>
  );
}

export function ExerciseScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const { agenda, addAgenda, refresh } = useScadaOps();
  const [when, setWhen] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState("");
  const exercises = useMemo(
    () => agenda.filter((item) => (item.title || "").toLowerCase().includes("exercício")),
    [agenda],
  );

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    addAgenda({ title: "Exercício de gerador (planejamento)", when, site });
    setWhen("");
    setSite("");
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await rcApi.agenda.update(id, { enabled });
      await refresh();
    } catch (toggleError) {
      setError(errText(toggleError));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Excluir este planejamento de exercício?")) return;
    try {
      await rcApi.agenda.remove(id);
      await refresh();
    } catch (removeError) {
      setError(errText(removeError));
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: RefreshCcw, label: "Exercícios planejados", value: exercises.length },
          {
            icon: RefreshCcw,
            label: "Planos ativos",
            value: exercises.filter((item) => item.enabled !== false).length,
          },
        ]}
      />
      <p className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-muted-foreground">
        Este módulo é agenda/planejamento. Não existe execução automática de START, transferência,
        MCB, GCB ou paralelismo por esta tela.
      </p>
      {error && <p className="text-[11px] text-offline">{error}</p>}
      {can("create") && (
        <Panel title="Planejar exercício">
          <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              required
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              placeholder="Data/hora ou descrição"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <input
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="Site"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <button className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">
              Planejar
            </button>
          </form>
        </Panel>
      )}
      <Panel title="Planejamentos">
        <ScadaTable
          rows={exercises}
          columns={[
            { label: "Quando", render: (r) => <span className="num">{r.when}</span> },
            { label: "Site", render: (r) => r.site || "—" },
            {
              label: "Estado",
              render: (r) => (
                <Pill tone={r.enabled === false ? "muted" : "ok"}>
                  {r.enabled === false ? "Cancelado" : "Planejado"}
                </Pill>
              ),
            },
            {
              label: "Ações",
              render: (r) =>
                can("edit") ? (
                  <span className="flex gap-1">
                    <ActionBtn onClick={() => void toggle(r.id, r.enabled === false)}>
                      {r.enabled === false ? "Reativar" : "Cancelar"}
                    </ActionBtn>
                    {admin && (
                      <ActionBtn tone="danger" onClick={() => void remove(r.id)}>
                        Excluir
                      </ActionBtn>
                    )}
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function NotificationsScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setRows(await rcApi.notifications.list());
      setError("");
    } catch (loadError) {
      setError(errText(loadError));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const testPanel = async () => {
    try {
      await rcApi.notifications.test("panel");
      await load();
    } catch (testError) {
      setError(errText(testError));
    }
  };

  const process = async () => {
    try {
      await rcApi.notifications.process();
      await load();
    } catch (processError) {
      setError(errText(processError));
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Bell, label: "Notificações", value: rows.length },
          {
            icon: Bell,
            label: "Pendentes",
            value: rows.filter((r) => r.status === "queued" || r.status === "retry").length,
          },
        ]}
      />
      <Panel
        title="Fila real de notificações"
        actions={
          <span className="flex gap-1">
            <ActionBtn onClick={() => void testPanel()}>Testar painel</ActionBtn>
            {admin && <ActionBtn onClick={() => void process()}>Processar fila</ActionBtn>}
          </span>
        }
      >
        {error && <p className="text-[11px] text-offline">{error}</p>}
        {!rows.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Fila vazia. E-mail/WhatsApp só enviam quando credenciais reais forem configuradas.
          </p>
        ) : (
          <ScadaTable
            rows={rows.map((r) => ({ ...r, id: String(r.id) }))}
            columns={[
              { label: "Evento", render: (r) => <b>{r.event_type}</b> },
              { label: "Canal", render: (r) => r.channel },
              { label: "Destino", render: (r) => r.destination || "—" },
              {
                label: "Estado",
                render: (r) => (
                  <Pill tone={r.status === "sent" ? "ok" : r.status === "failed" ? "err" : "warn"}>
                    {r.status}
                  </Pill>
                ),
              },
              { label: "Tentativas", render: (r) => `${r.attempts}/${r.max_attempts}` },
              { label: "Último erro", render: (r) => r.last_error || "—" },
            ]}
          />
        )}
      </Panel>
    </ScreenBody>
  );
}
