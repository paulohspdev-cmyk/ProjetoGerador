import { Network, Router, Signal } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type BridgeSession, type FieldDevice, type SystemDiagnostics } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function errText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação";
}

function dt(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

function bytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function FieldInventory({ kind }: { kind: "modem" | "gateway" }) {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<FieldDevice[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [host, setHost] = useState("");
  const [serial, setSerial] = useState("");
  const [imei, setImei] = useState("");
  const [sim, setSim] = useState("");
  const [carrier, setCarrier] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setRows(await rcApi.fieldDevices.list(kind));
      setError("");
    } catch (loadError) {
      setError(errText(loadError));
    }
  };

  useEffect(() => {
    void load();
  }, [kind]);

  const reset = () => {
    setEditing(null);
    setName("");
    setModel("");
    setHost("");
    setSerial("");
    setImei("");
    setSim("");
    setCarrier("");
  };

  const beginEdit = (row: FieldDevice) => {
    setEditing(row.id);
    setName(row.name);
    setModel(row.model || "");
    setHost(row.host || "");
    setSerial(row.serial || "");
    setImei(row.imei || "");
    setSim(row.sim_iccid || "");
    setCarrier(row.carrier || "");
    setError("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await rcApi.fieldDevices.update(editing, {
          name: name.trim(),
          model: model.trim(),
          host: host.trim(),
          serial: serial.trim(),
          imei: imei.trim(),
          sim_iccid: sim.trim(),
          carrier: carrier.trim(),
        });
      } else {
        await rcApi.fieldDevices.create({
          kind,
          name: name.trim(),
          model: model.trim(),
          host: host.trim(),
          serial: serial.trim(),
          imei: imei.trim(),
          sim_iccid: sim.trim(),
          carrier: carrier.trim(),
          status: "unknown",
          metadata: {},
        });
      }
      reset();
      await load();
    } catch (saveError) {
      setError(errText(saveError));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: FieldDevice) => {
    try {
      await rcApi.fieldDevices.update(row.id, { active: !row.active });
      await load();
    } catch (toggleError) {
      setError(errText(toggleError));
    }
  };

  const remove = async (row: FieldDevice) => {
    if (!window.confirm(`Excluir ${kind === "modem" ? "o modem" : "o gateway"} ${row.name}?`))
      return;
    try {
      await rcApi.fieldDevices.remove(row.id);
      if (editing === row.id) reset();
      await load();
    } catch (removeError) {
      setError(errText(removeError));
    }
  };

  const icon = kind === "modem" ? Router : Network;
  const label = kind === "modem" ? "Modems" : "Gateways";

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon, label: `${label} inventariados`, value: rows.length },
          {
            icon: Signal,
            label: "Cadastros ativos",
            value: rows.filter((row) => row.active).length,
            tone: "text-online",
          },
        ]}
      />
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        Este inventário contém somente dados administrativos informados. Estado físico da sessão TCP
        aparece em Equipamentos → Conectividade; IMEI, SIM, RSSI e conexão nunca são inferidos.
      </p>
      {error && <p className="text-[11px] text-offline">{error}</p>}
      {admin && (
        <Panel title={editing ? `Editar ${kind}` : `Cadastrar ${kind}`}>
          <form onSubmit={save} className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Modelo real"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="IP/host cadastrado"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="Serial"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            {kind === "modem" && (
              <>
                <input
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  placeholder="IMEI"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                />
                <input
                  value={sim}
                  onChange={(e) => setSim(e.target.value)}
                  placeholder="SIM / ICCID"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                />
                <input
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder="Operadora"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                />
              </>
            )}
            <div className="flex gap-1">
              <button
                disabled={busy}
                className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Salvando…" : editing ? "Salvar" : "Cadastrar"}
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
      <Panel title={`${label} persistidos`}>
        {!rows.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum equipamento cadastrado.
          </p>
        ) : (
          <ScadaTable
            rows={rows}
            columns={[
              { label: "Nome", render: (r) => <b>{r.name}</b> },
              { label: "Modelo", render: (r) => r.model || "—" },
              {
                label: "Host cadastrado",
                render: (r) => <span className="num">{r.host || "—"}</span>,
              },
              { label: "IMEI/Serial", render: (r) => r.imei || r.serial || "—" },
              {
                label: "SIM/Operadora",
                render: (r) => [r.sim_iccid, r.carrier].filter(Boolean).join(" · ") || "—",
              },
              {
                label: "Último dado cadastrado",
                render: (r) =>
                  r.last_seen ? <span className="num">{dt(r.last_seen)}</span> : "N/D",
              },
              {
                label: "Cadastro",
                render: (r) => (
                  <Pill tone={r.active ? "ok" : "muted"}>{r.active ? "Ativo" : "Inativo"}</Pill>
                ),
              },
              {
                label: "Ações",
                render: (r) =>
                  admin ? (
                    <span className="flex flex-wrap gap-1">
                      <ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn>
                      <ActionBtn onClick={() => void toggle(r)}>
                        {r.active ? "Desativar" : "Ativar"}
                      </ActionBtn>
                      <ActionBtn tone="danger" onClick={() => void remove(r)}>
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

export function ModemsScreen() {
  return <FieldInventory kind="modem" />;
}

export function GatewaysScreen() {
  return <FieldInventory kind="gateway" />;
}

function sessionState(session: BridgeSession, fresh: boolean) {
  if (!fresh) return { label: "N/D (status desatualizado)", tone: "muted" as const };
  return session.connected
    ? { label: "TCP conectado", tone: "ok" as const }
    : { label: "Sem sessão TCP", tone: "err" as const };
}

export function ConnectivityScreen() {
  const { generators } = useGenerators();
  const [health, setHealth] = useState<SystemDiagnostics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await rcApi.system.health();
        if (active) {
          setHealth(data);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(errText(loadError));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const fresh = health?.bridge.statusFresh === true;
  const available = health?.bridge.statusAvailable === true;
  const sessions = health?.bridge.sessions ?? [];
  const connected = fresh ? sessions.filter((session) => session.connected).length : 0;
  const reverseConfigured = generators.filter((g) => g.transport === "reverse_tcp").length;

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Signal, label: "Reverse TCP configurados", value: reverseConfigured },
          {
            icon: Signal,
            label: "Sessões físicas conectadas",
            value: fresh ? connected : "N/D",
            tone: fresh && connected ? "text-online" : undefined,
          },
          {
            icon: Network,
            label: "Status bridge",
            value: fresh ? "ATUAL" : available ? "DESATUALIZADO" : "N/D",
            tone: fresh ? "text-online" : undefined,
          },
          {
            icon: Signal,
            label: "Idade do status",
            value: health?.bridge.ageSeconds == null ? "N/D" : `${health.bridge.ageSeconds}s`,
          },
        ]}
      />
      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        A tabela física abaixo vem do processo da bridge. Se o arquivo de status estiver ausente ou
        vencido, o painel mostra N/D — nunca converte ausência de evidência em “offline”. Contadores
        são desde o início do processo atual da bridge.
      </p>
      <Panel title="Sessões físicas modem / DTU → gateway → bridge">
        {!sessions.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {available
              ? "Nenhuma porta reverse TCP publicada pela bridge."
              : "Status físico da bridge ainda não disponível nesta máquina."}
          </p>
        ) : (
          <ScadaTable
            rows={sessions.map((session) => ({ ...session, id: String(session.remotePort) }))}
            columns={[
              {
                label: "Estado",
                render: (r) => {
                  const state = sessionState(r, fresh);
                  return <Pill tone={state.tone}>{state.label}</Pill>;
                },
              },
              {
                label: "Modem remoto",
                render: (r) =>
                  fresh && r.connected && r.remoteIp ? (
                    <span className="num">
                      {r.remoteIp}
                      {r.remotePeerPort ? `:${r.remotePeerPort}` : ""}
                    </span>
                  ) : (
                    "N/D"
                  ),
              },
              {
                label: "Porta pública",
                render: (r) => <span className="num">{r.remotePort}</span>,
              },
              {
                label: "Porta Rapid local",
                render: (r) => <span className="num">{r.localPort}</span>,
              },
              {
                label: "Gerador / Unit / Device",
                render: (r) =>
                  r.generators.length ? (
                    <span>
                      {r.generators.map((g) => (
                        <span key={`${g.generatorId}-${g.unit}`} className="block">
                          <b>{g.tag}</b> · Unit {g.unit} · Device {g.rapidDeviceNum ?? "N/D"}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "Sem vínculo"
                  ),
              },
              {
                label: "Conectado desde",
                render: (r) =>
                  fresh && r.connected ? <span className="num">{dt(r.connectedAt)}</span> : "—",
              },
              {
                label: "Último RX/TX",
                render: (r) => (
                  <span className="num text-[10px]">
                    RX {dt(r.lastRxAt)}
                    <br />
                    TX {dt(r.lastTxAt)}
                  </span>
                ),
              },
              {
                label: "Bytes RX/TX",
                render: (r) => (
                  <span className="num">
                    {bytes(r.bytesRx)} / {bytes(r.bytesTx)}
                  </span>
                ),
              },
              {
                label: "Reconexões",
                render: (r) => <span className="num">{r.reconnections}</span>,
              },
              {
                label: "Timeouts/erros",
                render: (r) => (
                  <Tone tone={r.timeouts || r.errors ? "warn" : "muted"}>
                    {r.timeouts}/{r.errors}
                  </Tone>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <Panel title="Estado de telemetria da aplicação">
        <ScadaTable
          rows={generators}
          columns={[
            { label: "Gerador", render: (r) => <b>{r.tag}</b> },
            { label: "Site", render: (r) => r.site || "—" },
            { label: "Transporte", render: (r) => r.transport || "—" },
            {
              label: "Endpoint cadastrado",
              render: (r) => <span className="num">{r.ip || "—"}</span>,
            },
            { label: "Fonte", render: (r) => r.telemetrySource || "none" },
            {
              label: "Estado",
              render: (r) => (
                <Pill
                  tone={
                    r.status === "online"
                      ? "ok"
                      : r.status === "alerta"
                        ? "warn"
                        : r.status === "nao_configurado"
                          ? "muted"
                          : "err"
                  }
                >
                  {r.status}
                </Pill>
              ),
            },
            { label: "Erro", render: (r) => r.lastError || "—" },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
