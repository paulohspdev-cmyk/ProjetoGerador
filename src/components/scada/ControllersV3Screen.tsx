import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Cable, Cpu, Layers, Network } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi } from "@/lib/api";
import { domainApi, type AssetKind, type TopologyV3 } from "@/lib/domain-api";
import { Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

type CatalogController = {
  catalogId?: string;
  manufacturer: string;
  family: string;
  model: string;
  application: string;
  category: string;
  catalogStatus: string;
  packLifecycle?: "production" | "lab" | null;
  packStatus?: string | null;
  provisionable: boolean;
};

type LibraryWithCatalog = {
  catalog?: CatalogController[];
};

const applicationKind: Record<string, AssetKind> = {
  genset: "genset",
  mains: "mains",
  ats: "ats",
  bus: "bus",
  bess: "bess",
  engine: "engine",
  light_tower: "light_tower",
  field_gateway: "field_gateway",
  microgrid: "microgrid",
};

const emptyTopology: TopologyV3 = {
  assets: [],
  links: [],
  counts: { assets: 0, controllers: 0, connections: 0, links: 0 },
};

export function ControllersV3Screen() {
  const { can } = useAuth();
  const [topology, setTopology] = useState<TopologyV3>(emptyTopology);
  const [catalog, setCatalog] = useState<CatalogController[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [model, setModel] = useState("");
  const [firmware, setFirmware] = useState("");
  const [withConnection, setWithConnection] = useState(true);
  const [transport, setTransport] = useState<
    "reverse_tcp" | "modbus_tcp_direct" | "rtu_over_tcp" | "modbus_rtu_serial"
  >("reverse_tcp");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [unit, setUnit] = useState("1");
  const [rapidDevice, setRapidDevice] = useState("");
  const [saving, setSaving] = useState(false);

  const [linkFrom, setLinkFrom] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const [relation, setRelation] = useState("feeds");

  const load = async () => {
    setLoading(true);
    try {
      const [topologyData, library, siteRows] = await Promise.all([
        domainApi.topology(),
        rcApi.library.get(),
        rcApi.sites.list(),
      ]);
      setTopology(topologyData);
      const rows = ((library as typeof library & LibraryWithCatalog).catalog ?? []).filter(
        (item): item is CatalogController => !!item?.model,
      );
      setCatalog(rows);
      setSites(siteRows.map((row) => row.name).filter(Boolean));
      setError("");
      setLinkFrom((value) => value || topologyData.assets[0]?.id || "");
      setLinkTo((value) => value || topologyData.assets[1]?.id || topologyData.assets[0]?.id || "");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar inventário de controladoras.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(() => catalog.find((item) => item.model === model), [catalog, model]);
  const assetKind = applicationKind[selected?.application || ""] ?? "other";
  const genericAssetAllowed = assetKind !== "genset";
  const grouped = useMemo(() => {
    const map = new Map<string, CatalogController[]>();
    for (const item of catalog) {
      const key = `${item.manufacturer} — ${item.family || "Outros"}`;
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return [...map.entries()];
  }, [catalog]);
  const assetById = useMemo(
    () => new Map(topology.assets.map((asset) => [asset.id, asset])),
    [topology.assets],
  );

  const rows = useMemo(
    () =>
      topology.assets.flatMap((asset) =>
        (asset.controllers ?? []).map((controller) => ({
          id: controller.id,
          asset: asset.tag,
          kind: asset.kind,
          site: asset.site,
          manufacturer: controller.manufacturer,
          family: controller.family,
          model: controller.model,
          firmware: controller.firmware,
          lifecycle: controller.pack_lifecycle || "catalog",
          state: controller.state,
          connections: controller.connections?.length ?? 0,
          enabled: asset.enabled && controller.enabled,
          legacy: !!asset.legacy_generator_id,
        })),
      ),
    [topology],
  );

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    if (!selected) {
      setError("Selecione uma controladora do catálogo.");
      return;
    }
    if (!genericAssetAllowed) {
      setError(
        "Controladoras de gerador devem ser cadastradas em RC Geradores → Geradores para manter cards, telemetria e comandos no fluxo legado compatível.",
      );
      return;
    }
    const listenPort = Number(port || 0);
    const modbusUnit = Number(unit || 1);
    if (
      withConnection &&
      transport !== "modbus_rtu_serial" &&
      (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535)
    ) {
      setError("Informe uma porta TCP válida.");
      return;
    }
    if (withConnection && (!Number.isInteger(modbusUnit) || modbusUnit < 1 || modbusUnit > 247)) {
      setError("Modbus Unit ID deve ficar entre 1 e 247.");
      return;
    }
    if (withConnection && transport !== "reverse_tcp" && !host.trim()) {
      setError(
        transport === "modbus_rtu_serial"
          ? "Informe o dispositivo serial."
          : "Informe IP/hostname da conexão.",
      );
      return;
    }

    setSaving(true);
    try {
      const result = await domainApi.createBundle({
        asset: {
          tag: tag.trim().toUpperCase(),
          name: name.trim() || tag.trim().toUpperCase(),
          kind: assetKind,
          site: site.trim(),
        },
        controller: {
          model: selected.model,
          manufacturer: selected.manufacturer,
          family: selected.family,
          firmware: firmware.trim(),
        },
        ...(withConnection
          ? {
              connection: {
                transport,
                host: host.trim(),
                listen_port: transport === "modbus_rtu_serial" ? 0 : listenPort,
                modbus_unit: modbusUnit,
                ...(rapidDevice ? { rapid_device_num: Number(rapidDevice) } : {}),
              },
            }
          : {}),
      });
      setMessage(
        result.provisionable
          ? "Equipamento cadastrado. O Controller Pack é de produção, mas o Rapid SCADA ainda deve ser provisionado pelo fluxo industrial controlado."
          : "Equipamento cadastrado em inventário. Sem Controller Pack de produção, polling e comandos permanecem bloqueados.",
      );
      setTag("");
      setName("");
      setFirmware("");
      setHost("");
      setPort("");
      setRapidDevice("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar equipamento.");
    } finally {
      setSaving(false);
    }
  };

  const onCreateLink = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!linkFrom || !linkTo || linkFrom === linkTo) {
      setError("Selecione dois assets diferentes para a relação.");
      return;
    }
    try {
      await domainApi.createLink(linkFrom, linkTo, relation);
      setMessage("Relação de topologia cadastrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar relação.");
    }
  };

  return (
    <ScreenBody>
      <Stats
        items={[
          { icon: Layers, label: "Assets", value: topology.counts.assets },
          { icon: Cpu, label: "Controladoras", value: topology.counts.controllers },
          { icon: Cable, label: "Conexões", value: topology.counts.connections },
          { icon: Network, label: "Topologias", value: topology.counts.links },
        ]}
      />

      {error && (
        <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md border border-online/30 bg-online/10 p-3 text-sm text-online">
          {message}
        </p>
      )}

      {can("create") && (
        <Panel title="Cadastrar asset / controladora">
          <form onSubmit={onCreate} className="grid gap-2 lg:grid-cols-4">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Tag do asset
              <input
                required
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
                placeholder="ATS001 / REDE01 / BESS01"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Site
              <input
                required
                list="controller-v3-sites"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
              <datalist id="controller-v3-sites">
                {sites.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Firmware
              <input
                value={firmware}
                onChange={(e) => setFirmware(e.target.value)}
                placeholder="opcional"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>

            <label className="text-[11px] font-semibold text-muted-foreground lg:col-span-2">
              Controladora
              <select
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Selecione</option>
                {grouped.map(([label, items]) => (
                  <optgroup key={label} label={label}>
                    {items.map((item) => (
                      <option key={item.catalogId || item.model} value={item.model}>
                        {item.model} ·{" "}
                        {item.provisionable
                          ? "PRODUÇÃO"
                          : item.packLifecycle === "lab"
                            ? "LAB"
                            : "CATÁLOGO"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="lg:col-span-2 flex items-end">
              <div className="w-full rounded-md border border-border bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
                {selected ? (
                  <>
                    <b>{selected.application}</b> → asset <b>{assetKind}</b> ·{" "}
                    {selected.provisionable
                      ? "Controller Pack de produção"
                      : selected.packLifecycle === "lab"
                        ? "Pack em laboratório"
                        : "somente catálogo"}
                    {!genericAssetAllowed && (
                      <span className="block mt-1 text-alert">
                        Para geradores, use o cadastro do menu Geradores.
                      </span>
                    )}
                  </>
                ) : (
                  "Selecione um modelo para classificar o asset automaticamente."
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-[12px] font-semibold lg:col-span-4">
              <input
                type="checkbox"
                checked={withConnection}
                onChange={(e) => setWithConnection(e.target.checked)}
              />
              Cadastrar conexão de campo agora
            </label>

            {withConnection && (
              <>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  Transporte
                  <select
                    value={transport}
                    onChange={(e) => setTransport(e.target.value as typeof transport)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="reverse_tcp">Reverse TCP</option>
                    <option value="modbus_tcp_direct">Modbus TCP direto</option>
                    <option value="rtu_over_tcp">RTU sobre TCP</option>
                    <option value="modbus_rtu_serial">Modbus RTU serial</option>
                  </select>
                </label>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  Host / dispositivo
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={
                      transport === "modbus_rtu_serial"
                        ? "/dev/ttyUSB0"
                        : transport === "reverse_tcp"
                          ? "opcional"
                          : "10.10.10.10"
                    }
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </label>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  Porta TCP
                  <input
                    disabled={transport === "modbus_rtu_serial"}
                    inputMode="numeric"
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
                    placeholder={transport === "modbus_tcp_direct" ? "502" : "15002"}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Unit ID
                    <input
                      inputMode="numeric"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value.replace(/\D/g, ""))}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Rapid Device
                    <input
                      inputMode="numeric"
                      value={rapidDevice}
                      onChange={(e) => setRapidDevice(e.target.value.replace(/\D/g, ""))}
                      placeholder="opcional"
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    />
                  </label>
                </div>
              </>
            )}

            <div className="lg:col-span-4">
              <button
                type="submit"
                disabled={saving || !genericAssetAllowed || !selected}
                className="h-9 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Cadastrando…" : "Cadastrar equipamento"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Inventário de controladoras / assets">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando topologia…</p>
        ) : !rows.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma controladora cadastrada.
          </p>
        ) : (
          <ScadaTable
            rows={rows}
            columns={[
              { label: "Asset", render: (r) => <b>{r.asset}</b> },
              { label: "Tipo", render: (r) => r.kind },
              { label: "Site", render: (r) => r.site || "—" },
              {
                label: "Controladora",
                render: (r) => (
                  <span>
                    <b>
                      {r.manufacturer} {r.model}
                    </b>
                    {r.family && (
                      <span className="block text-[10px] text-muted-foreground">{r.family}</span>
                    )}
                  </span>
                ),
              },
              { label: "Firmware", render: (r) => r.firmware || "—" },
              {
                label: "Pack",
                render: (r) => (
                  <Pill
                    tone={
                      r.lifecycle === "production" ? "ok" : r.lifecycle === "lab" ? "warn" : "muted"
                    }
                  >
                    {r.lifecycle}
                  </Pill>
                ),
              },
              { label: "Conexões", render: (r) => <span className="num">{r.connections}</span> },
              {
                label: "Estado",
                render: (r) => (
                  <Tone tone={r.enabled ? "ok" : "muted"}>
                    {r.enabled ? (r.legacy ? "LEGADO/V3" : "ATIVO") : "INATIVO"}
                  </Tone>
                ),
              },
            ]}
          />
        )}
      </Panel>

      <Panel title="Topologia elétrica / funcional">
        <p className="mb-3 text-[11px] text-muted-foreground">
          As relações descrevem a planta sem assumir que uma controladora pertence a um gerador.
          Exemplos: REDE feeds ATS, ATS feeds BUS, GEN001 feeds BUS, BESS01 connects BUS.
        </p>
        {can("create") && topology.assets.length >= 2 && (
          <form onSubmit={onCreateLink} className="mb-3 grid gap-2 sm:grid-cols-4">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Origem
              <select
                value={linkFrom}
                onChange={(e) => setLinkFrom(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {topology.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag} · {a.kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Relação
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="feeds">feeds / alimenta</option>
                <option value="connects">connects / conecta</option>
                <option value="controls">controls / controla</option>
                <option value="measures">measures / mede</option>
                <option value="backs_up">backs_up / backup</option>
                <option value="shares_bus">shares_bus / compartilha barramento</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-muted-foreground">
              Destino
              <select
                value={linkTo}
                onChange={(e) => setLinkTo(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {topology.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag} · {a.kind}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="h-9 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground"
              >
                Adicionar relação
              </button>
            </div>
          </form>
        )}
        <ScadaTable
          rows={topology.links}
          columns={[
            {
              label: "Origem",
              render: (r) => <b>{assetById.get(r.from_asset_id)?.tag || r.from_asset_id}</b>,
            },
            { label: "Relação", render: (r) => <span className="num">{r.relation}</span> },
            {
              label: "Destino",
              render: (r) => <b>{assetById.get(r.to_asset_id)?.tag || r.to_asset_id}</b>,
            },
            { label: "Site origem", render: (r) => assetById.get(r.from_asset_id)?.site || "—" },
            { label: "Site destino", render: (r) => assetById.get(r.to_asset_id)?.site || "—" },
          ]}
        />
      </Panel>
    </ScreenBody>
  );
}
