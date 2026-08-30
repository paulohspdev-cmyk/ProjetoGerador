import { Building2, Users, Webhook } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { rcApi, type OpsClient, type OpsSite, type WebhookApi } from "@/lib/api";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
      {message}
    </p>
  );
}

function ConfirmButton({
  label,
  onConfirm,
  disabled,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <ActionBtn tone="danger" disabled={disabled} onClick={onConfirm}>
      {label}
    </ActionBtn>
  );
}

export function ClientsScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const canCreate = can("create");
  const canEdit = can("edit");
  const [rows, setRows] = useState<OpsClient[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [units, setUnits] = useState("0");
  const [gens, setGens] = useState("0");
  const [sla, setSla] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setRows(await rcApi.clients.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar clientes.");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const reset = () => {
    setEditing(null);
    setName("");
    setUnits("0");
    setGens("0");
    setSla("");
  };
  const beginEdit = (row: OpsClient) => {
    setEditing(row.id);
    setName(row.name);
    setUnits(String(row.units));
    setGens(String(row.gens));
    setSla(row.sla || "");
    setError("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        units: Number(units) || 0,
        gens: Number(gens) || 0,
        sla: sla.trim(),
      };
      if (editing) await rcApi.clients.update(editing, payload);
      else await rcApi.clients.create(payload);
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar cliente.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (row: OpsClient) => {
    try {
      await rcApi.clients.update(row.id, { active: !row.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar cliente.");
    }
  };
  const remove = async (row: OpsClient) => {
    if (
      !window.confirm(
        `Excluir o cliente ${row.name}? A exclusão será recusada se houver unidades vinculadas.`,
      )
    )
      return;
    try {
      await rcApi.clients.remove(row.id);
      if (editing === row.id) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir cliente.");
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Users, label: "Clientes", value: rows.length },
          {
            icon: Users,
            label: "Ativos",
            value: rows.filter((row) => row.active !== false).length,
            tone: "text-online",
          },
        ]}
      />
      <ErrorBox message={error} />
      {(canCreate || (editing && canEdit)) && (
        <Panel title={editing ? "Editar cliente" : "Cadastrar cliente"}>
          <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Nome
              <input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Unidades previstas
              <input
                type="number"
                min="0"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Geradores previstos
              <input
                type="number"
                min="0"
                value={gens}
                onChange={(e) => setGens(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              SLA
              <input
                value={sla}
                onChange={(e) => setSla(e.target.value)}
                placeholder="ex.: 99,9%"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <div className="flex items-end gap-1">
              <button
                disabled={busy}
                type="submit"
                className="h-9 flex-1 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
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
      <Panel title="Clientes persistidos">
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Cliente", render: (r) => <b>{r.name}</b> },
            { label: "Unidades", render: (r) => r.units },
            { label: "Geradores", render: (r) => r.gens },
            { label: "SLA", render: (r) => <span className="num">{r.sla || "—"}</span> },
            {
              label: "Estado",
              render: (r) => (
                <Tone tone={r.active === false ? "muted" : "ok"}>
                  {r.active === false ? "Inativo" : "Ativo"}
                </Tone>
              ),
            },
            {
              label: "Ações",
              render: (r) => (
                <span className="flex flex-wrap gap-1">
                  {canEdit && <ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn>}
                  {canEdit && (
                    <ActionBtn onClick={() => void toggle(r)}>
                      {r.active === false ? "Ativar" : "Desativar"}
                    </ActionBtn>
                  )}
                  {admin && <ConfirmButton label="Excluir" onConfirm={() => void remove(r)} />}
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function UnitsScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const canCreate = can("create");
  const canEdit = can("edit");
  const { generators } = useGenerators();
  const [rows, setRows] = useState<OpsSite[]>([]);
  const [clients, setClients] = useState<OpsClient[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [siteRows, clientRows] = await Promise.all([rcApi.sites.list(), rcApi.clients.list()]);
      setRows(siteRows);
      setClients(clientRows);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar unidades.");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const reset = () => {
    setEditing(null);
    setName("");
    setClientId("");
    setCity("");
    setState("");
    setAddress("");
    setLatitude("");
    setLongitude("");
  };
  const beginEdit = (row: OpsSite) => {
    setEditing(row.id);
    setName(row.name);
    setClientId(row.clientId || "");
    setCity(row.city || "");
    setState(row.state || "");
    setAddress(row.address || "");
    setLatitude(row.lat == null ? "" : String(row.lat));
    setLongitude(row.lng == null ? "" : String(row.lng));
    setError("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const lat = latitude.trim() ? Number(latitude) : null;
    const lng = longitude.trim() ? Number(longitude) : null;
    if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
      setError("Latitude/longitude inválidas.");
      setBusy(false);
      return;
    }
    try {
      if (editing) {
        await rcApi.sites.update(editing, {
          name: name.trim(),
          clientId: clientId || null,
          city: city.trim(),
          state: state.trim().toUpperCase(),
          address: address.trim(),
          latitude: lat,
          longitude: lng,
        });
      } else {
        await rcApi.sites.create({
          name: name.trim(),
          ...(clientId ? { clientId } : {}),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          address: address.trim(),
          ...(lat != null ? { latitude: lat } : {}),
          ...(lng != null ? { longitude: lng } : {}),
        });
      }
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar unidade.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (row: OpsSite) => {
    try {
      await rcApi.sites.update(row.id, { active: !row.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar unidade.");
    }
  };
  const remove = async (row: OpsSite) => {
    if (
      !window.confirm(
        `Excluir a unidade ${row.name}? Geradores, assets, equipamentos, OS ou agenda vinculados bloquearão a operação.`,
      )
    )
      return;
    try {
      await rcApi.sites.remove(row.id);
      if (editing === row.id) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir unidade.");
    }
  };
  const tableRows = useMemo(
    () =>
      rows.map((site) => {
        const gens = generators.filter(
          (g) => g.site.trim().toLowerCase() === site.name.trim().toLowerCase(),
        );
        return {
          ...site,
          total: gens.length,
          online: gens.filter((g) => g.status === "online").length,
        };
      }),
    [generators, rows],
  );

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Building2, label: "Unidades", value: rows.length },
          {
            icon: Building2,
            label: "Ativas",
            value: rows.filter((row) => row.active !== false).length,
            tone: "text-online",
          },
          {
            icon: Building2,
            label: "Com coordenadas",
            value: rows.filter((row) => row.lat != null && row.lng != null).length,
          },
        ]}
      />
      <ErrorBox message={error} />
      {(canCreate || (editing && canEdit)) && (
        <Panel title={editing ? "Editar unidade / site" : "Cadastrar unidade / site"}>
          <form onSubmit={submit} className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Nome
              <input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Cliente
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Sem vínculo</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Cidade
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              UF
              <input
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                maxLength={2}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground md:col-span-2">
              Endereço
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Latitude
              <input
                inputMode="decimal"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="-23.5505"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Longitude
              <input
                inputMode="decimal"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="-46.6333"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <div className="md:col-span-2 xl:col-span-4 flex gap-1">
              <button
                disabled={busy}
                type="submit"
                className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar unidade"}
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
      <Panel title="Unidades persistidas">
        <ScadaTable
          rows={tableRows}
          columns={[
            { label: "Unidade", render: (r) => <b>{r.name}</b> },
            { label: "Cliente", render: (r) => r.clientName || "—" },
            {
              label: "Cidade",
              render: (r) => [r.city, r.state].filter(Boolean).join(" / ") || "—",
            },
            { label: "Geradores", render: (r) => r.total },
            {
              label: "Online",
              render: (r) => <Tone tone={r.online ? "ok" : "muted"}>{r.online}</Tone>,
            },
            {
              label: "Estado",
              render: (r) => (
                <Pill tone={r.active === false ? "muted" : "ok"}>
                  {r.active === false ? "Inativa" : "Ativa"}
                </Pill>
              ),
            },
            {
              label: "Coordenadas",
              render: (r) =>
                r.lat != null && r.lng != null ? (
                  <span className="num">
                    {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                  </span>
                ) : (
                  "—"
                ),
            },
            {
              label: "Ações",
              render: (r) => (
                <span className="flex flex-wrap gap-1">
                  {canEdit && <ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn>}
                  {canEdit && (
                    <ActionBtn onClick={() => void toggle(r)}>
                      {r.active === false ? "Ativar" : "Desativar"}
                    </ActionBtn>
                  )}
                  {admin && <ConfirmButton label="Excluir" onConfirm={() => void remove(r)} />}
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}

export function WebhooksScreen() {
  const { can } = useAuth();
  const admin = can("manageUsers");
  const [rows, setRows] = useState<WebhookApi[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState("alarme.criado");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setRows(await rcApi.webhooks.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar webhooks.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const reset = () => {
    setEditing(null);
    setUrl("");
    setEvent("alarme.criado");
  };
  const beginEdit = (row: WebhookApi) => {
    setEditing(row.id);
    setUrl(row.url);
    setEvent(row.event);
    setError("");
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) await rcApi.webhooks.update(editing, { url: url.trim(), event: event.trim() });
      else await rcApi.webhooks.create({ url: url.trim(), event: event.trim() });
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar webhook.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (row: WebhookApi) => {
    try {
      await rcApi.webhooks.update(row.id, { status: row.status === "Ativo" ? "Pausado" : "Ativo" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar webhook.");
    }
  };
  const remove = async (row: WebhookApi) => {
    if (!window.confirm(`Excluir o webhook ${row.event} → ${row.url}?`)) return;
    try {
      await rcApi.webhooks.remove(row.id);
      if (editing === row.id) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir webhook.");
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Webhook, label: "Webhooks", value: rows.length },
          {
            icon: Webhook,
            label: "Ativos",
            value: rows.filter((row) => row.status === "Ativo").length,
            tone: "text-online",
          },
        ]}
      />
      <ErrorBox message={error} />
      {admin && (
        <Panel title={editing ? "Editar webhook" : "Cadastrar webhook"}>
          <form onSubmit={submit} className="grid gap-2 md:grid-cols-[1fr_220px_auto]">
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <input
              required
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="evento"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
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
      <Panel title="Webhooks persistidos">
        <ScadaTable
          rows={rows}
          columns={[
            { label: "Evento", render: (r) => <b>{r.event}</b> },
            { label: "URL", render: (r) => <span className="num text-[11px]">{r.url}</span> },
            {
              label: "Status",
              render: (r) => <Pill tone={r.status === "Ativo" ? "ok" : "muted"}>{r.status}</Pill>,
            },
            { label: "Falhas", render: (r) => r.failures ?? 0 },
            {
              label: "Ações",
              render: (r) =>
                admin ? (
                  <span className="flex flex-wrap gap-1">
                    <ActionBtn onClick={() => beginEdit(r)}>Editar</ActionBtn>
                    <ActionBtn onClick={() => void toggle(r)}>
                      {r.status === "Ativo" ? "Pausar" : "Ativar"}
                    </ActionBtn>
                    <ConfirmButton label="Excluir" onConfirm={() => void remove(r)} />
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
