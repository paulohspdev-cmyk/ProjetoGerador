import { type FormEvent, useEffect, useState } from "react";
import { BellRing, CalendarClock, ShieldAlert } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { industrialApi, type EscalationPolicy } from "@/lib/industrial-api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function duration(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} d`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

function severityTone(value: string): "err" | "warn" | "info" | "muted" {
  if (value === "fault") return "err";
  if (value === "alarm" || value === "warning") return "warn";
  if (value === "info") return "info";
  return "muted";
}

export function EscalationV3Screen() {
  const { user } = useAuth();
  const admin = user?.role === "administrador";
  const [rows, setRows] = useState<EscalationPolicy[]>([]);
  const [name, setName] = useState("Falha crítica");
  const [severity, setSeverity] = useState("fault");
  const [afterMinutes, setAfterMinutes] = useState("5");
  const [channel, setChannel] = useState("panel");
  const [destination, setDestination] = useState("");
  const [repeatMinutes, setRepeatMinutes] = useState("0");
  const [maxRepeats, setMaxRepeats] = useState("1");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setRows(await industrialApi.escalations.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar escalonamento.");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await industrialApi.escalations.create({
        name,
        severity,
        afterSeconds: Number(afterMinutes || 0) * 60,
        channel,
        destination,
        repeatSeconds: Number(repeatMinutes || 0) * 60,
        maxRepeats: Number(maxRepeats || 1),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar política.");
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: ShieldAlert, label: "Políticas", value: rows.length },
          {
            icon: BellRing,
            label: "Ativas",
            value: rows.filter((r) => r.enabled).length,
            tone: "text-online",
          },
          {
            icon: CalendarClock,
            label: "Com repetição",
            value: rows.filter((r) => r.repeat_seconds > 0).length,
          },
        ]}
      />
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        Escalonamento atua somente sobre alarmes industriais ativos e não reconhecidos. As ações são
        notificações; START, STOP, MCB, GCB, modos e paralelismo não fazem parte deste motor.
      </p>
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      {admin && (
        <Panel title="Nova política de escalonamento">
          <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
            <label className="text-[11px] font-semibold text-muted-foreground xl:col-span-2">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Severidade
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="fault">Fault</option>
                <option value="alarm">Alarm</option>
                <option value="warning">Warning</option>
                <option value="any">Qualquer</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Após (min)
              <input
                inputMode="numeric"
                value={afterMinutes}
                onChange={(e) => setAfterMinutes(e.target.value.replace(/\D/g, ""))}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Canal
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="panel">Painel</option>
                <option value="email">E-mail</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="webhook">Webhook</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Repete (min)
              <input
                inputMode="numeric"
                value={repeatMinutes}
                onChange={(e) => setRepeatMinutes(e.target.value.replace(/\D/g, ""))}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Máx. envios
              <input
                inputMode="numeric"
                value={maxRepeats}
                onChange={(e) => setMaxRepeats(e.target.value.replace(/\D/g, ""))}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground sm:col-span-3 xl:col-span-6">
              Destino
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e-mail / telefone / URL; vazio para painel"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground"
              >
                Criar
              </button>
            </div>
          </form>
        </Panel>
      )}
      <Panel title="Políticas">
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Nome", render: (r) => <b>{r.name}</b> },
            {
              label: "Severidade",
              render: (r) => <Pill tone={severityTone(r.severity)}>{r.severity}</Pill>,
            },
            {
              label: "Espera",
              render: (r) => <span className="num">{duration(r.after_seconds)}</span>,
            },
            { label: "Canal", render: (r) => r.channel },
            { label: "Destino", render: (r) => r.destination || "Painel" },
            {
              label: "Repetição",
              render: (r) =>
                r.repeat_seconds ? `${duration(r.repeat_seconds)} · máx ${r.max_repeats}` : "Não",
            },
            {
              label: "Estado",
              render: (r) => (
                <Tone tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "Ativa" : "Pausada"}</Tone>
              ),
            },
            {
              label: "Ações",
              render: (r) =>
                admin ? (
                  <span className="flex gap-1">
                    <ActionBtn
                      onClick={() =>
                        void industrialApi.escalations
                          .update(r.id, { enabled: !r.enabled })
                          .then(load)
                          .catch((err) => setError(err instanceof Error ? err.message : "Falha"))
                      }
                    >
                      {r.enabled ? "Pausar" : "Ativar"}
                    </ActionBtn>
                    <ActionBtn
                      tone="danger"
                      onClick={() => {
                        if (window.confirm(`Excluir política ${r.name}?`))
                          void industrialApi.escalations
                            .remove(r.id)
                            .then(load)
                            .catch((err) => setError(err instanceof Error ? err.message : "Falha"));
                      }}
                    >
                      Excluir
                    </ActionBtn>
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
