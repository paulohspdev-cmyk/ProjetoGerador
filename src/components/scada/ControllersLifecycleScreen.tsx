import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Cable, Cpu, Layers } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  domainApi,
  type AssetV3,
  type ControllerConnectionV3,
  type ControllerInstanceV3,
  type TopologyV3,
} from "@/lib/domain-api";
import { ControllersV3Screen } from "./ControllersV3Screen";
import { ActionBtn, Panel, Pill, ScadaTable, ScreenBody, Stats } from "./kit";

const emptyTopology: TopologyV3 = {
  assets: [],
  links: [],
  counts: { assets: 0, controllers: 0, connections: 0, links: 0 },
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação.";
}

type ControllerRow = ControllerInstanceV3 & {
  legacy: boolean;
  assetTag: string;
};

type ConnectionRow = ControllerConnectionV3 & {
  legacy: boolean;
  assetTag: string;
  controllerModel: string;
};

export function ControllersLifecycleScreen() {
  const { can } = useAuth();
  const [topology, setTopology] = useState<TopologyV3>(emptyTopology);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingController, setEditingController] = useState<ControllerRow | null>(null);
  const [firmware, setFirmware] = useState("");
  const [editingConnection, setEditingConnection] = useState<ConnectionRow | null>(null);
  const [connectionName, setConnectionName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [unit, setUnit] = useState("1");
  const [rapidDevice, setRapidDevice] = useState("");

  const load = async () => {
    try {
      setTopology(await domainApi.topology());
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  };

  useEffect(() => { void load(); }, []);

  const controllerRows = useMemo<ControllerRow[]>(() => topology.assets.flatMap((asset) =>
    (asset.controllers ?? []).map((controller) => ({
      ...controller,
      legacy: Boolean(asset.legacy_generator_id),
      assetTag: asset.tag,
    })),
  ), [topology.assets]);

  const connectionRows = useMemo<ConnectionRow[]>(() => topology.assets.flatMap((asset) =>
    (asset.controllers ?? []).flatMap((controller) => (controller.connections ?? []).map((connection) => ({
      ...connection,
      legacy: Boolean(asset.legacy_generator_id),
      assetTag: asset.tag,
      controllerModel: controller.model,
    }))),
  ), [topology.assets]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setError(""); setMessage("");
    try { await work(); setMessage(success); await load(); }
    catch (err) { setError(errorText(err)); }
  };

  const editController = (row: ControllerRow) => {
    setEditingController(row);
    setFirmware(row.firmware ?? "");
    setEditingConnection(null);
  };

  const saveController = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingController) return;
    await run(
      () => domainApi.updateController(editingController.id, { firmware: firmware.trim() }),
      "Controladora atualizada.",
    );
    setEditingController(null);
  };

  const editConnection = (row: ConnectionRow) => {
    setEditingConnection(row);
    setConnectionName(row.name);
    setHost(row.host ?? "");
    setPort(String(row.listen_port ?? 0));
    setUnit(String(row.modbus_unit ?? 1));
    setRapidDevice(row.rapid_device_num == null ? "" : String(row.rapid_device_num));
    setEditingController(null);
  };

  const saveConnection = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingConnection) return;
    const listenPort = Number(port);
    const modbusUnit = Number(unit);
    const rapidDeviceNum = rapidDevice.trim() ? Number(rapidDevice) : undefined;
    if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
      setError("Porta inválida."); return;
    }
    if (!Number.isInteger(modbusUnit) || modbusUnit < 1 || modbusUnit > 247) {
      setError("Modbus Unit ID deve ficar entre 1 e 247."); return;
    }
    await run(
      () => domainApi.updateConnection(editingConnection.id, {
        name: connectionName.trim() || "Principal",
        host: host.trim(),
        listen_port: listenPort,
        modbus_unit: modbusUnit,
        ...(rapidDeviceNum != null && Number.isInteger(rapidDeviceNum) && rapidDeviceNum > 0
          ? { rapid_device_num: rapidDeviceNum }
          : {}),
      }),
      "Conexão atualizada.",
    );
    setEditingConnection(null);
  };

  const removeAsset = async (row: AssetV3) => {
    if (row.legacy_generator_id) { setError("Asset de gerador legado deve ser retirado pelo lifecycle do gerador."); return; }
    if (row.enabled) { setError("Desative o asset antes de excluí-lo."); return; }
    if (!window.confirm(`Excluir o asset ${row.tag}?`)) return;
    await run(() => domainApi.removeAsset(row.id), "Asset removido.");
  };

  return <>
    <ControllersV3Screen />
    <ScreenBody>
      <Stats items={[
        { icon: Layers, label: "Assets", value: topology.counts.assets },
        { icon: Cpu, label: "Controladoras", value: topology.counts.controllers },
        { icon: Cable, label: "Conexões", value: topology.counts.connections },
      ]} />
      <p className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        Lifecycle seguro: equipamentos derivados de geradores legados não são apagados aqui. Para eles, use a retirada do gerador. Controladoras e conexões independentes precisam ser desativadas antes da exclusão.
      </p>
      {error && <p className="rounded-md border border-offline/40 bg-offline/10 p-3 text-sm text-offline">{error}</p>}
      {message && <p className="rounded-md border border-online/30 bg-online/10 p-3 text-sm text-online">{message}</p>}

      {editingController && can("edit") && <Panel title={`Editar controladora · ${editingController.assetTag}`}>
        <form onSubmit={saveController} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={`${editingController.manufacturer} ${editingController.model}`} disabled className="h-9 rounded-md border border-input bg-secondary px-2 text-sm" />
          <input value={firmware} onChange={(e) => setFirmware(e.target.value)} placeholder="Firmware real, se conhecido" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <div className="flex gap-1"><button className="h-9 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground">Salvar</button><button type="button" onClick={() => setEditingController(null)} className="h-9 rounded-md border border-border px-3 text-xs">Cancelar</button></div>
        </form>
      </Panel>}

      {editingConnection && can("edit") && <Panel title={`Editar conexão · ${editingConnection.assetTag}`}>
        <form onSubmit={saveConnection} className="grid gap-2 md:grid-cols-5">
          <input required value={connectionName} onChange={(e) => setConnectionName(e.target.value)} placeholder="Nome" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host/IP" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} placeholder="Porta" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <input inputMode="numeric" value={unit} onChange={(e) => setUnit(e.target.value.replace(/\D/g, ""))} placeholder="Unit" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <input inputMode="numeric" value={rapidDevice} onChange={(e) => setRapidDevice(e.target.value.replace(/\D/g, ""))} placeholder="Rapid Device" className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          <div className="flex gap-1 md:col-span-5"><button className="h-9 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground">Salvar</button><button type="button" onClick={() => setEditingConnection(null)} className="h-9 rounded-md border border-border px-3 text-xs">Cancelar</button></div>
        </form>
      </Panel>}

      <Panel title="Assets e lifecycle">
        <ScadaTable rows={topology.assets} columns={[
          { label: "Asset", render: (r) => <span><b>{r.tag}</b><span className="block text-[10px] text-muted-foreground">{r.name}</span></span> },
          { label: "Tipo", render: (r) => r.kind },
          { label: "Site", render: (r) => r.site || "—" },
          { label: "Origem", render: (r) => <Pill tone={r.legacy_generator_id ? "info" : "muted"}>{r.legacy_generator_id ? "Gerador legado" : "Domínio v3"}</Pill> },
          { label: "Estado", render: (r) => <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "Ativo" : "Inativo"}</Pill> },
          { label: "Ações", render: (r) => r.legacy_generator_id ? "Lifecycle do gerador" : <span className="flex flex-wrap gap-1">{can("edit") && <ActionBtn onClick={() => void run(() => domainApi.updateAsset(r.id, { enabled: !r.enabled }), r.enabled ? "Asset desativado." : "Asset ativado.")}>{r.enabled ? "Desativar" : "Ativar"}</ActionBtn>}{can("remove") && <ActionBtn tone="danger" disabled={r.enabled} onClick={() => void removeAsset(r)}>Excluir</ActionBtn>}</span> },
        ]} />
      </Panel>

      <Panel title="Controladoras">
        <ScadaTable rows={controllerRows} min="900px" columns={[
          { label: "Asset", render: (r) => <b>{r.assetTag}</b> },
          { label: "Controladora", render: (r) => <span><b>{r.manufacturer} {r.model}</b><span className="block text-[10px] text-muted-foreground">{r.family || "—"}</span></span> },
          { label: "Firmware", render: (r) => r.firmware || "N/D" },
          { label: "Pack", render: (r) => <Pill tone={r.pack_lifecycle === "production" ? "ok" : r.pack_lifecycle === "lab" ? "warn" : "muted"}>{r.pack_lifecycle || "N/D"}</Pill> },
          { label: "Estado", render: (r) => <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "Ativa" : "Inativa"}</Pill> },
          { label: "Ações", render: (r) => r.legacy ? "Lifecycle do gerador" : <span className="flex flex-wrap gap-1">{can("edit") && <ActionBtn onClick={() => editController(r)}>Editar</ActionBtn>}{can("edit") && <ActionBtn onClick={() => void run(() => domainApi.updateController(r.id, { enabled: !r.enabled }), r.enabled ? "Controladora desativada." : "Controladora ativada.")}>{r.enabled ? "Desativar" : "Ativar"}</ActionBtn>}{can("remove") && <ActionBtn tone="danger" disabled={r.enabled || (r.connections ?? []).some((c) => c.enabled)} onClick={() => { if (window.confirm(`Excluir ${r.model}?`)) void run(() => domainApi.removeController(r.id), "Controladora removida."); }}>Excluir</ActionBtn>}</span> },
        ]} />
      </Panel>

      <Panel title="Conexões de controladoras">
        <ScadaTable rows={connectionRows} min="1050px" columns={[
          { label: "Asset", render: (r) => <b>{r.assetTag}</b> },
          { label: "Controladora", render: (r) => r.controllerModel },
          { label: "Conexão", render: (r) => r.name },
          { label: "Transporte", render: (r) => <span className="num">{r.transport}</span> },
          { label: "Host / porta", render: (r) => <span className="num">{r.host || "—"}{r.listen_port ? `:${r.listen_port}` : ""}</span> },
          { label: "Unit / Device", render: (r) => <span className="num">{r.modbus_unit} / {r.rapid_device_num ?? "N/D"}</span> },
          { label: "Estado", render: (r) => <Pill tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "Ativa" : "Inativa"}</Pill> },
          { label: "Ações", render: (r) => r.legacy ? "Lifecycle do gerador" : <span className="flex flex-wrap gap-1">{can("edit") && <ActionBtn onClick={() => editConnection(r)}>Editar</ActionBtn>}{can("edit") && <ActionBtn onClick={() => void run(() => domainApi.updateConnection(r.id, { enabled: !r.enabled }), r.enabled ? "Conexão desativada." : "Conexão ativada.")}>{r.enabled ? "Desativar" : "Ativar"}</ActionBtn>}{can("remove") && <ActionBtn tone="danger" disabled={r.enabled} onClick={() => { if (window.confirm(`Excluir conexão ${r.name}?`)) void run(() => domainApi.removeConnection(r.id), "Conexão removida."); }}>Excluir</ActionBtn>}</span> },
        ]} />
      </Panel>

      <Panel title="Relações da topologia">
        <ScadaTable rows={topology.links} columns={[
          { label: "Origem", render: (r) => <span className="num">{r.from_asset_id}</span> },
          { label: "Relação", render: (r) => <b>{r.relation}</b> },
          { label: "Destino", render: (r) => <span className="num">{r.to_asset_id}</span> },
          { label: "Ação", render: (r) => can("remove") ? <ActionBtn tone="danger" onClick={() => { if (window.confirm("Excluir esta relação de topologia?")) void run(() => domainApi.removeLink(r.id), "Relação removida."); }}>Excluir relação</ActionBtn> : "—" },
        ]} />
      </Panel>
    </ScreenBody>
  </>;
}
