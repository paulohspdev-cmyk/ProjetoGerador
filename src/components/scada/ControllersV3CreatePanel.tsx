import { type FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { domainApi, type AssetKind } from "@/lib/domain-api";
import { Panel } from "./kit";

export type CatalogController = {
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

type Props = {
  catalog: CatalogController[];
  sites: string[];
  onCreated: () => Promise<void> | void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
};

export function ControllersV3CreatePanel({ catalog, sites, onCreated, onError, onMessage }: Props) {
  const { can } = useAuth();
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

  if (!can("create")) return null;

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    onMessage("");
    onError("");
    if (!selected) {
      onError("Selecione uma controladora do catálogo.");
      return;
    }
    if (!genericAssetAllowed) {
      onError(
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
      onError("Informe uma porta TCP válida.");
      return;
    }
    if (withConnection && (!Number.isInteger(modbusUnit) || modbusUnit < 1 || modbusUnit > 247)) {
      onError("Modbus Unit ID deve ficar entre 1 e 247.");
      return;
    }
    if (withConnection && transport !== "reverse_tcp" && !host.trim()) {
      onError(
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
      onMessage(
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
      await onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao cadastrar equipamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
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
  );
}
