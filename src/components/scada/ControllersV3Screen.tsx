import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Cable, Cpu, Layers, Network } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { rcApi } from "@/lib/api";
import { domainApi, type TopologyV3 } from "@/lib/domain-api";
import { ControllersV3CreatePanel, type CatalogController } from "./ControllersV3CreatePanel";
import { Panel, Pill, ScadaTable, ScreenBody, Stats, Tone } from "./kit";

type LibraryWithCatalog = {
  catalog?: CatalogController[];
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
      setError(err instanceof Error ? err.message : "Falha ao carregar controladoras.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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

      <ControllersV3CreatePanel
        catalog={catalog}
        sites={sites}
        onCreated={load}
        onError={setError}
        onMessage={setMessage}
      />

      <Panel title="Controladoras / assets cadastrados">
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
