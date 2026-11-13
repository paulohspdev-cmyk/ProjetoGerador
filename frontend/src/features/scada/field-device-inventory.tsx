import { Network, Router, Signal } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import { rcApi, type FieldDevice } from "@/lib/api";
import { modemAdmissionApi, type ModemAdmission } from "./modem-admission-api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";
import { ModemAdmissionPanel } from "./ModemAdmissionPanel";

function errText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação";
}

function metadataText(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateTime(epoch: number | null | undefined) {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString("pt-BR");
}

function FieldInventory({ kind }: { kind: "modem" | "gateway" }) {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<FieldDevice[]>([]);
  const [admissions, setAdmissions] = useState<ModemAdmission[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [approvalPeer, setApprovalPeer] = useState<ModemAdmission | null>(null);
  const [metadataBase, setMetadataBase] = useState<Record<string, unknown>>({});
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [host, setHost] = useState("");
  const [serial, setSerial] = useState("");
  const [imei, setImei] = useState("");
  const [sim, setSim] = useState("");
  const [simPhone, setSimPhone] = useState("");
  const [carrier, setCarrier] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (kind === "modem" && admin) {
        const [deviceRows, admissionRows] = await Promise.all([
          rcApi.fieldDevices.list(kind),
          modemAdmissionApi.list(),
        ]);
        setRows(deviceRows);
        setAdmissions(admissionRows);
      } else {
        setRows(await rcApi.fieldDevices.list(kind));
        setAdmissions([]);
      }
      setError("");
    } catch (loadError) {
      setError(errText(loadError));
    }
  }, [admin, kind]);

  useEffect(() => {
    void load();
    if (kind !== "modem" || !admin) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [admin, kind, load]);

  const pendingPeers = useMemo(
    () => admissions.filter((entry) => entry.state === "pending" && entry.lastSeenAt > 0),
    [admissions],
  );
  const rejectedAdmissions = useMemo(
    () => admissions.filter((entry) => entry.state === "rejected"),
    [admissions],
  );
  const pendingRows = useMemo(
    () => pendingPeers.map((peer) => ({ ...peer, id: String(peer.remotePort) })),
    [pendingPeers],
  );

  const registeredRows = useMemo(() => rows.filter((row) => row.status !== "rejected"), [rows]);
  const rejectedRows = useMemo(() => rows.filter((row) => row.status === "rejected"), [rows]);

  const reset = () => {
    setEditing(null);
    setApprovalPeer(null);
    setMetadataBase({});
    setName("");
    setManufacturer("");
    setModel("");
    setHost("");
    setSerial("");
    setImei("");
    setSim("");
    setSimPhone("");
    setCarrier("");
    setAdvanced(false);
  };

  const beginApprove = (peer: ModemAdmission) => {
    reset();
    setApprovalPeer(peer);
    setName("MDM-" + String(peer.remotePort));
    setHost(peer.remoteIp);
    setAdvanced(true);
    setError("");
  };

  const beginEdit = (row: FieldDevice) => {
    setEditing(row.id);
    setApprovalPeer(null);
    setMetadataBase(row.metadata || {});
    setName(row.name);
    setManufacturer(metadataText(row.metadata, "manufacturer"));
    setModel(row.model || "");
    setHost(row.host || "");
    setSerial(row.serial || "");
    setImei(row.imei || "");
    setSim(row.sim_iccid || "");
    setSimPhone(metadataText(row.metadata, "simPhone"));
    setCarrier(row.carrier || "");
    setAdvanced(true);
    setError("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const metadata: Record<string, unknown> = {
        ...metadataBase,
        ...(manufacturer.trim() ? { manufacturer: manufacturer.trim() } : {}),
        ...(simPhone.trim() ? { simPhone: simPhone.trim() } : {}),
        ...(approvalPeer
          ? {
              admissionPort: approvalPeer.remotePort,
              admissionIp: approvalPeer.remoteIp,
              admissionFirstSeenAt: approvalPeer.firstSeenAt,
              admissionLastSeenAt: approvalPeer.lastSeenAt,
            }
          : {}),
      };
      const payload = {
        name: name.trim(),
        model: model.trim(),
        host: host.trim(),
        serial: serial.trim(),
        imei: imei.trim(),
        sim_iccid: sim.trim(),
        carrier: carrier.trim(),
        metadata,
      };
      if (editing) {
        await rcApi.fieldDevices.update(editing, payload);
      } else if (kind === "modem" && approvalPeer) {
        await modemAdmissionApi.approve(approvalPeer.remotePort, {
          name: payload.name,
          model: payload.model,
          serial: payload.serial,
          imei: payload.imei,
          sim_iccid: payload.sim_iccid,
          carrier: payload.carrier,
          metadata: payload.metadata,
        });
      } else {
        await rcApi.fieldDevices.create({ kind, ...payload, status: "unknown" });
      }
      reset();
      await load();
    } catch (saveError) {
      setError(errText(saveError));
    } finally {
      setBusy(false);
    }
  };

  const rejectPeer = async (peer: ModemAdmission) => {
    if (!window.confirm("Rejeitar a admissão da porta TCP " + peer.remotePort + "?")) return;
    setBusy(true);
    setError("");
    try {
      await modemAdmissionApi.reject(peer.remotePort);
      await load();
    } catch (rejectError) {
      setError(errText(rejectError));
    } finally {
      setBusy(false);
    }
  };

  const reopenPeer = async (remotePort: number) => {
    setBusy(true);
    setError("");
    try {
      await modemAdmissionApi.reopen(remotePort);
      await load();
    } catch (reopenError) {
      setError(errText(reopenError));
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
    if (!window.confirm(`Excluir ${row.name}?`)) return;
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
      <div>
        <h2 className="text-lg font-extrabold">{label}</h2>
        {kind === "modem" && (
          <p className="mt-1 text-sm text-muted-foreground">
            A admissão por porta TCP exige aprovação administrativa. O gerador só pode ser vinculado
            depois de uma decisão persistida. O cadastro manual de inventário não aprova a porta nem
            configura a VPN.
          </p>
        )}
      </div>

      <Stats
        items={[
          { icon, label: "Cadastrados", value: registeredRows.length },
          ...(kind === "modem" && admin
            ? [
                {
                  icon: Signal,
                  label: "Aguardando",
                  value: pendingPeers.length,
                  tone: "text-alert",
                },
              ]
            : []),
          {
            icon: Signal,
            label: "Cadastros habilitados",
            value: registeredRows.filter((row) => row.active).length,
            tone: "text-online",
          },
        ]}
      />

      {error && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}

      {kind === "modem" && admin && (
        <>
          <ModemAdmissionPanel
            rows={pendingRows}
            onApprove={beginApprove}
            onReject={(peer) => void rejectPeer(peer)}
          />
          {rejectedAdmissions.length > 0 && (
            <Panel title="Admissões rejeitadas">
              <ScadaTable
                rows={rejectedAdmissions.map((entry) => ({
                  ...entry,
                  id: String(entry.remotePort),
                }))}
                columns={[
                  { label: "Porta", render: (entry) => <b>TCP {entry.remotePort}</b> },
                  { label: "Origem observada", render: (entry) => entry.remoteIp || "—" },
                  { label: "Decisão", render: () => <Pill tone="warn">Rejeitada</Pill> },
                  {
                    label: "Ações",
                    render: (entry) => (
                      <ActionBtn disabled={busy} onClick={() => void reopenPeer(entry.remotePort)}>
                        Reabrir análise
                      </ActionBtn>
                    ),
                  },
                ]}
              />
            </Panel>
          )}
        </>
      )}

      {admin && (
        <Panel
          title={
            approvalPeer
              ? "Aprovar modem · TCP " + String(approvalPeer.remotePort)
              : editing
                ? `Editar ${kind === "modem" ? "modem" : "gateway"}`
                : `Adicionar ${kind === "modem" ? "modem" : "gateway"}`
          }
        >
          <form onSubmit={save} className="space-y-3">
            {approvalPeer && (
              <p className="rounded-lg border border-online/30 bg-online/8 p-3 text-xs text-muted-foreground">
                Porta observada: {approvalPeer.remoteIp}:{approvalPeer.remotePort}. A aprovação
                registra a decisão administrativa no backend. Não cria gerador, não configura VPN,
                não cria Rapid Device e não libera comandos.
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm font-semibold">
                Nome
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </label>
              {kind === "modem" && (
                <label className="text-sm font-semibold">
                  Fabricante
                  <input
                    value={manufacturer}
                    onChange={(event) => setManufacturer(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  />
                </label>
              )}
              <label className="text-sm font-semibold">
                Modelo
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="text-sm font-semibold">
                Endereço / IP
                <input
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  readOnly={!!approvalPeer}
                  className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm read-only:opacity-70"
                />
              </label>
            </div>

            {kind === "modem" && (
              <>
                <button
                  type="button"
                  onClick={() => setAdvanced((value) => !value)}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  {advanced ? "Ocultar identificação do modem" : "Identificação do modem"}
                </button>
                {advanced && (
                  <div className="grid gap-3 rounded-xl border border-border bg-background/35 p-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="text-xs font-semibold">
                      IMEI
                      <input
                        value={imei}
                        onChange={(event) => setImei(event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      SIM / ICCID
                      <input
                        value={sim}
                        onChange={(event) => setSim(event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Número do chip
                      <input
                        value={simPhone}
                        onChange={(event) => setSimPhone(event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Operadora
                      <input
                        value={carrier}
                        onChange={(event) => setCarrier(event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Número de série
                      <input
                        value={serial}
                        onChange={(event) => setSerial(event.target.value)}
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            {kind === "gateway" && (
              <label className="block max-w-sm text-xs font-semibold">
                Número de série
                <input
                  value={serial}
                  onChange={(event) => setSerial(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy
                  ? "Salvando…"
                  : approvalPeer
                    ? "Aprovar modem"
                    : editing
                      ? "Salvar alterações"
                      : "Adicionar"}
              </button>
              {(editing || approvalPeer) && (
                <button
                  type="button"
                  onClick={reset}
                  className="h-10 rounded-lg border border-border px-4 text-sm font-semibold"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </Panel>
      )}

      <Panel title={label + " cadastrados"}>
        {!registeredRows.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum equipamento cadastrado.
          </p>
        ) : (
          <ScadaTable
            rows={registeredRows}
            columns={[
              { label: "Nome", render: (row) => <b>{row.name}</b> },
              {
                label: "Fabricante / Modelo",
                render: (row) =>
                  [metadataText(row.metadata, "manufacturer"), row.model]
                    .filter(Boolean)
                    .join(" · ") || "—",
              },
              { label: "IMEI / Série", render: (row) => row.imei || row.serial || "—" },
              {
                label: "SIM",
                render: (row) =>
                  [row.sim_iccid, metadataText(row.metadata, "simPhone"), row.carrier]
                    .filter(Boolean)
                    .join(" · ") || "—",
              },
              {
                label: "Cadastro",
                render: (row) => (
                  <Pill tone={row.active ? "ok" : "muted"}>
                    {row.active === false
                      ? "Desativado no cadastro"
                      : row.status === "approved_unlinked" || row.status === "approved_linked"
                        ? row.status === "approved_linked"
                          ? "Aprovado · vinculado"
                          : "Aprovado · sem gerador"
                        : "Cadastrado · aprovação N/D"}
                  </Pill>
                ),
              },
              {
                label: "Ações",
                render: (row) =>
                  admin ? (
                    <span className="flex flex-wrap gap-1">
                      <ActionBtn onClick={() => beginEdit(row)}>Editar</ActionBtn>
                      <ActionBtn onClick={() => void toggle(row)}>
                        {row.active ? "Desativar" : "Ativar"}
                      </ActionBtn>
                      <ActionBtn tone="danger" onClick={() => void remove(row)}>
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

      {kind === "modem" && rejectedRows.length > 0 && (
        <Panel title="Rejeitados">
          <ScadaTable
            rows={rejectedRows}
            columns={[
              {
                label: "Entrada",
                render: (row) => metadataNumber(row.metadata, "admissionPort") || "—",
              },
              {
                label: "Origem",
                render: (row) => metadataText(row.metadata, "admissionIp") || row.host || "—",
              },
              {
                label: "Primeiro acesso",
                render: (row) => dateTime(metadataNumber(row.metadata, "admissionFirstSeenAt")),
              },
              {
                label: "Ações",
                render: (row) =>
                  admin ? (
                    <ActionBtn tone="danger" onClick={() => void remove(row)}>
                      Excluir registro
                    </ActionBtn>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        </Panel>
      )}
    </ScreenBody>
  );
}

export function ModemsScreen() {
  return <FieldInventory kind="modem" />;
}

export function GatewaysScreen() {
  return <FieldInventory kind="gateway" />;
}
