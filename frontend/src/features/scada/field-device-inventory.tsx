import { Clock3, Network, Router, Signal } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import { rcApi, type FieldDevice, type ModemAdmission } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

function errText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação";
}

function dateTime(epoch?: number | null) {
  return epoch ? new Date(epoch * 1000).toLocaleString("pt-BR") : "—";
}

type ModemDraft = {
  name: string;
  manufacturer: string;
  model: string;
  serial: string;
  imei: string;
  simPhone: string;
  simIccid: string;
  carrier: string;
  apn: string;
};

const EMPTY_MODEM: ModemDraft = {
  name: "",
  manufacturer: "",
  model: "",
  serial: "",
  imei: "",
  simPhone: "",
  simIccid: "",
  carrier: "",
  apn: "",
};

function ModemFields({
  value,
  onChange,
}: {
  value: ModemDraft;
  onChange: (next: ModemDraft) => void;
}) {
  const field = (key: keyof ModemDraft, next: string) => onChange({ ...value, [key]: next });
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <label className="text-sm font-semibold">
        Nome do modem
        <input
          required
          value={value.name}
          onChange={(event) => field("name", event.target.value)}
          placeholder="Ex.: MDM-15001"
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        Fabricante
        <input
          value={value.manufacturer}
          onChange={(event) => field("manufacturer", event.target.value)}
          placeholder="Ex.: Teltonika"
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        Modelo
        <input
          value={value.model}
          onChange={(event) => field("model", event.target.value)}
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        Número de série
        <input
          value={value.serial}
          onChange={(event) => field("serial", event.target.value)}
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        IMEI
        <input
          value={value.imei}
          onChange={(event) => field("imei", event.target.value.replace(/\s/g, ""))}
          inputMode="numeric"
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        Número do chip / linha
        <input
          value={value.simPhone}
          onChange={(event) => field("simPhone", event.target.value)}
          placeholder="Ex.: +55 35 99999-9999"
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        ICCID do chip
        <input
          value={value.simIccid}
          onChange={(event) => field("simIccid", event.target.value.replace(/\s/g, ""))}
          inputMode="numeric"
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        Operadora
        <input
          value={value.carrier}
          onChange={(event) => field("carrier", event.target.value)}
          placeholder="Vivo, Claro, TIM..."
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        APN
        <input
          value={value.apn}
          onChange={(event) => field("apn", event.target.value)}
          placeholder="Se aplicável"
          className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        />
      </label>
    </div>
  );
}

export function ModemsScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<FieldDevice[]>([]);
  const [admissions, setAdmissions] = useState<ModemAdmission[]>([]);
  const [approvingPort, setApprovingPort] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ModemDraft>(EMPTY_MODEM);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [devices, arrivals] = await Promise.all([
        rcApi.fieldDevices.list("modem"),
        admin ? rcApi.modemAdmissions.list() : Promise.resolve([] as ModemAdmission[]),
      ]);
      setRows(devices);
      setAdmissions(arrivals);
      setError("");
    } catch (loadError) {
      setError(errText(loadError));
    }
  }, [admin]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = useMemo(
    () => admissions.filter((item) => item.state === "pending"),
    [admissions],
  );
  const rejected = useMemo(
    () => admissions.filter((item) => item.state === "rejected"),
    [admissions],
  );
  const linked = rows.filter((row) => (row.linked_generator_ids?.length ?? 0) > 0).length;

  const startApproval = (item: ModemAdmission) => {
    setEditing(null);
    setApprovingPort(item.remotePort);
    setDraft({ ...EMPTY_MODEM, name: `MDM-${item.remotePort}` });
    setError("");
  };

  const startEdit = (row: FieldDevice) => {
    setApprovingPort(null);
    setEditing(row.id);
    setDraft({
      name: row.name,
      manufacturer: row.manufacturer || "",
      model: row.model || "",
      serial: row.serial || "",
      imei: row.imei || "",
      simPhone: row.sim_phone || "",
      simIccid: row.sim_iccid || "",
      carrier: row.carrier || "",
      apn: row.apn || "",
    });
    setError("");
  };

  const cancelForm = () => {
    setApprovingPort(null);
    setEditing(null);
    setDraft(EMPTY_MODEM);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: draft.name.trim(),
        manufacturer: draft.manufacturer.trim(),
        model: draft.model.trim(),
        serial: draft.serial.trim(),
        imei: draft.imei.trim(),
        sim_phone: draft.simPhone.trim(),
        sim_iccid: draft.simIccid.trim(),
        carrier: draft.carrier.trim(),
        apn: draft.apn.trim(),
      };
      if (approvingPort != null) {
        await rcApi.modemAdmissions.approve(approvingPort, payload);
      } else if (editing) {
        await rcApi.fieldDevices.update(editing, payload);
      }
      cancelForm();
      await load();
    } catch (saveError) {
      setError(errText(saveError));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (item: ModemAdmission) => {
    const reason = window.prompt(
      `Motivo para rejeitar a chegada na porta ${item.remotePort} (opcional):`,
      "",
    );
    if (reason === null) return;
    try {
      await rcApi.modemAdmissions.reject(item.remotePort, reason);
      await load();
    } catch (rejectError) {
      setError(errText(rejectError));
    }
  };

  const reopen = async (item: ModemAdmission) => {
    try {
      await rcApi.modemAdmissions.reopen(item.remotePort);
      await load();
    } catch (reopenError) {
      setError(errText(reopenError));
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
    if (!window.confirm(`Excluir o cadastro ${row.name}?`)) return;
    try {
      await rcApi.fieldDevices.remove(row.id);
      await load();
    } catch (removeError) {
      setError(errText(removeError));
    }
  };

  const selectedAdmission =
    approvingPort == null
      ? null
      : admissions.find((item) => item.remotePort === approvingPort) ?? null;

  return (
    <ScreenBody>
      <div>
        <h2 className="text-lg font-extrabold">Modems</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          O modem entra primeiro. Somente depois de aprovado ele pode ser usado no cadastro de um gerador.
        </p>
      </div>

      <Stats
        items={[
          { icon: Clock3, label: "Aguardando aprovação", value: admin ? pending.length : "—" },
          { icon: Router, label: "Cadastrados", value: rows.length },
          { icon: Signal, label: "Vinculados", value: linked, tone: linked ? "text-online" : undefined },
        ]}
      />

      {error && (
        <p className="rounded-xl border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}

      {admin && (
        <Panel title="Aguardando aprovação">
          {!pending.length ? (
            <p className="py-7 text-center text-sm text-muted-foreground">
              Nenhum modem novo aguardando aprovação.
            </p>
          ) : (
            <ScadaTable
              rows={pending.map((item) => ({ ...item, id: String(item.remotePort) }))}
              columns={[
                { label: "Porta", render: (row) => <b className="num">{row.remotePort}</b> },
                { label: "Origem observada", render: (row) => <span className="num">{row.remoteIp || "N/D"}</span> },
                { label: "Primeiro acesso", render: (row) => dateTime(row.firstSeenAt) },
                { label: "Último acesso", render: (row) => dateTime(row.lastSeenAt) },
                { label: "Peers", render: (row) => <span className="num">{row.peerCount}</span> },
                {
                  label: "Estado",
                  render: () => <Pill tone="warn">AGUARDANDO</Pill>,
                },
                {
                  label: "Ações",
                  render: (row) => (
                    <span className="flex gap-1">
                      <ActionBtn onClick={() => startApproval(row)}>Aceitar</ActionBtn>
                      <ActionBtn tone="danger" onClick={() => void reject(row)}>Rejeitar</ActionBtn>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Panel>
      )}

      {admin && rejected.length > 0 && (
        <Panel title="Rejeitados">
          <ScadaTable
            rows={rejected.map((item) => ({ ...item, id: String(item.remotePort) }))}
            columns={[
              { label: "Porta", render: (row) => <b className="num">{row.remotePort}</b> },
              { label: "Última origem", render: (row) => <span className="num">{row.remoteIp || "N/D"}</span> },
              { label: "Último acesso", render: (row) => dateTime(row.lastSeenAt) },
              { label: "Motivo", render: (row) => row.reason || "—" },
              { label: "Estado", render: () => <Pill tone="err">REJEITADO</Pill> },
              { label: "Ação", render: (row) => <ActionBtn onClick={() => void reopen(row)}>Reabrir</ActionBtn> },
            ]}
          />
        </Panel>
      )}

      {admin && (approvingPort != null || editing) && (
        <Panel title={approvingPort != null ? "Aceitar e cadastrar modem" : "Editar modem"}>
          {selectedAdmission && (
            <div className="mb-3 grid gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs sm:grid-cols-3">
              <span><b>Porta detectada:</b> <span className="num">{selectedAdmission.remotePort}</span></span>
              <span><b>Origem observada:</b> <span className="num">{selectedAdmission.remoteIp || "N/D"}</span></span>
              <span><b>Última chegada:</b> {dateTime(selectedAdmission.lastSeenAt)}</span>
            </div>
          )}
          <form onSubmit={save} className="space-y-3">
            <ModemFields value={draft} onChange={setDraft} />
            <p className="text-[11px] text-muted-foreground">
              IMEI, série e dados do chip não são inferidos da conexão TCP. Preencha com os dados reais do equipamento.
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Salvando…" : approvingPort != null ? "Aprovar modem" : "Salvar alterações"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="h-10 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Modems cadastrados">
        {!rows.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum modem aprovado ainda.
          </p>
        ) : (
          <ScadaTable
            rows={rows}
            columns={[
              {
                label: "Modem",
                render: (row) => (
                  <span>
                    <b>{row.name}</b>
                    <small className="block text-[10px] text-muted-foreground">
                      {[row.manufacturer, row.model].filter(Boolean).join(" · ") || "Modelo não informado"}
                    </small>
                  </span>
                ),
              },
              { label: "Porta", render: (row) => <span className="num">{row.listen_port ?? "—"}</span> },
              { label: "IMEI / Série", render: (row) => row.imei || row.serial || "—" },
              {
                label: "Chip / Operadora",
                render: (row) =>
                  [row.sim_phone, row.sim_iccid, row.carrier].filter(Boolean).join(" · ") || "—",
              },
              {
                label: "Vínculo",
                render: (row) => {
                  const count = row.linked_generator_ids?.length ?? 0;
                  return (
                    <Pill tone={count ? "ok" : "warn"}>
                      {count ? `VINCULADO · ${count}` : "SEM GERADOR"}
                    </Pill>
                  );
                },
              },
              {
                label: "Cadastro",
                render: (row) => (
                  <Pill tone={row.active ? "ok" : "muted"}>{row.active ? "ATIVO" : "INATIVO"}</Pill>
                ),
              },
              {
                label: "Ações",
                render: (row) =>
                  admin ? (
                    <span className="flex flex-wrap gap-1">
                      <ActionBtn onClick={() => startEdit(row)}>Editar</ActionBtn>
                      <ActionBtn onClick={() => void toggle(row)}>
                        {row.active ? "Desativar" : "Ativar"}
                      </ActionBtn>
                      <ActionBtn
                        tone="danger"
                        disabled={(row.linked_generator_ids?.length ?? 0) > 0}
                        onClick={() => void remove(row)}
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
        )}
      </Panel>
    </ScreenBody>
  );
}

function GatewayInventory() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<FieldDevice[]>([]);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [host, setHost] = useState("");
  const [serial, setSerial] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await rcApi.fieldDevices.list("gateway"));
      setError("");
    } catch (loadError) {
      setError(errText(loadError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setName("");
    setModel("");
    setHost("");
    setSerial("");
    setEditing(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { name: name.trim(), model: model.trim(), host: host.trim(), serial: serial.trim() };
      if (editing) await rcApi.fieldDevices.update(editing, payload);
      else await rcApi.fieldDevices.create({ kind: "gateway", ...payload, imei: "", sim_iccid: "", carrier: "", status: "unknown", metadata: {} });
      reset();
      await load();
    } catch (saveError) {
      setError(errText(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenBody>
      <h2 className="text-lg font-extrabold">Gateways</h2>
      <Stats items={[{ icon: Network, label: "Cadastrados", value: rows.length }]} />
      {error && <p className="text-sm text-offline">{error}</p>}
      {admin && (
        <Panel title={editing ? "Editar gateway" : "Adicionar gateway"}>
          <form onSubmit={save} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Modelo" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="IP / endereço" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
            <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Número de série" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
            <div className="flex gap-2 md:col-span-2 xl:col-span-4">
              <button type="submit" disabled={busy} className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
                {busy ? "Salvando…" : editing ? "Salvar" : "Adicionar"}
              </button>
              {editing && <button type="button" onClick={reset} className="h-10 rounded-lg border border-border px-4 text-sm">Cancelar</button>}
            </div>
          </form>
        </Panel>
      )}
      <Panel title="Gateways cadastrados">
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Nome", render: (row) => <b>{row.name}</b> },
            { label: "Modelo", render: (row) => row.model || "—" },
            { label: "Endereço", render: (row) => row.host || "—" },
            { label: "Série", render: (row) => row.serial || "—" },
            {
              label: "Ações",
              render: (row) =>
                admin ? (
                  <ActionBtn
                    onClick={() => {
                      setEditing(row.id);
                      setName(row.name);
                      setModel(row.model || "");
                      setHost(row.host || "");
                      setSerial(row.serial || "");
                    }}
                  >
                    Editar
                  </ActionBtn>
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

export function GatewaysScreen() {
  return <GatewayInventory />;
}
