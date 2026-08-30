import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { nextGeneratorTag } from "@/data/generators";
import { rcApi, type GeneratorTransport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useGenerators } from "./GeneratorsProvider";

type CatalogController = {
  catalogId?: string;
  manufacturer: string;
  family?: string;
  model: string;
  application?: string;
  category?: string;
  packLifecycle?: "production" | "lab" | null;
  packStatus?: string | null;
  provisionable?: boolean;
  transports?: string[];
};

type LibraryWithCatalog = {
  catalog?: CatalogController[];
};

const transportLabels: Record<GeneratorTransport, string> = {
  reverse_tcp: "Modem / DTU como TCP Client (conexão reversa)",
  modbus_tcp_direct: "Modbus TCP direto / Ethernet",
  rtu_over_tcp: "Modbus RTU sobre TCP / gateway Ethernet",
  modbus_rtu_serial: "Modbus RTU serial local",
};

export function RegisterGeneratorButton({
  collapsed,
  touchFriendly,
  onNavigate,
}: {
  collapsed?: boolean | undefined;
  touchFriendly?: boolean | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const { generators, addGenerator } = useGenerators();
  const [open, setOpen] = useState(false);
  const preview = useMemo(() => nextGeneratorTag(generators).tag, [generators]);
  const [tag, setTag] = useState("");
  const [controller, setController] = useState("");
  const [site, setSite] = useState("");
  const [ip, setIp] = useState("");
  const [transport, setTransport] = useState<GeneratorTransport>("reverse_tcp");
  const [listenPort, setListenPort] = useState("");
  const [modbusUnit, setModbusUnit] = useState("1");
  const [rapidDeviceNum, setRapidDeviceNum] = useState("");
  const [catalog, setCatalog] = useState<CatalogController[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const gensetCatalog = useMemo(
    () => catalog.filter((item) => !item.application || item.application === "genset"),
    [catalog],
  );
  const selected = useMemo(
    () => gensetCatalog.find((item) => item.model === controller),
    [controller, gensetCatalog],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCatalogLoading(true);
    setCatalogError(null);
    void Promise.all([rcApi.library.get(), rcApi.sites.list()])
      .then(([library, siteRows]) => {
        if (!active) return;
        const rows = ((library as typeof library & LibraryWithCatalog).catalog ?? []).filter(
          (item): item is CatalogController => !!item?.model && !!item?.manufacturer,
        );
        setCatalog(rows);
        setSites(siteRows.map((item) => item.name).filter(Boolean));
        const production = rows.find((item) => item.application === "genset" && item.provisionable);
        const first = production ?? rows.find((item) => item.application === "genset");
        setController((current) => current || first?.model || "");
        setSite((current) => current || siteRows[0]?.name || "");
      })
      .catch((err) => {
        if (active)
          setCatalogError(
            err instanceof Error ? err.message : "Falha ao carregar biblioteca de controladoras.",
          );
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, CatalogController[]>();
    for (const item of gensetCatalog) {
      const key = `${item.manufacturer} — ${item.family || "Outros"}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(item);
      groups.set(key, bucket);
    }
    return [...groups.entries()];
  }, [gensetCatalog]);

  const reset = () => {
    setTag("");
    setSite("");
    setIp("");
    setTransport("reverse_tcp");
    setListenPort("");
    setModbusUnit("1");
    setRapidDeviceNum("");
    setError(null);
    setSaving(false);
  };

  const changeTransport = (value: GeneratorTransport) => {
    setTransport(value);
    if (value === "modbus_tcp_direct" && !listenPort) setListenPort("502");
    if (value === "modbus_rtu_serial") setListenPort("0");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!controller) {
      setError("Selecione uma controladora do catálogo.");
      setSaving(false);
      return;
    }
    if (!site.trim()) {
      setError("Informe o site/unidade.");
      setSaving(false);
      return;
    }

    const port = Number(listenPort || 0);
    const unit = Number(modbusUnit || 1);
    const rapidDevice = rapidDeviceNum ? Number(rapidDeviceNum) : undefined;

    if (
      transport !== "modbus_rtu_serial" &&
      (!Number.isInteger(port) || port < 1 || port > 65535)
    ) {
      setError("Informe uma porta TCP válida.");
      setSaving(false);
      return;
    }
    if (!Number.isInteger(unit) || unit < 1 || unit > 247) {
      setError("O Modbus Unit ID deve ficar entre 1 e 247.");
      setSaving(false);
      return;
    }
    if (transport !== "reverse_tcp" && !ip.trim()) {
      setError(
        transport === "modbus_rtu_serial"
          ? "Informe o dispositivo serial, por exemplo /dev/ttyUSB0."
          : "Informe o IP ou hostname da controladora/gateway.",
      );
      setSaving(false);
      return;
    }

    const err = await addGenerator({
      tag: tag || preview,
      controller,
      site: site.trim(),
      ip,
      transport,
      listenPort: port,
      modbusUnit: unit,
      rapidDeviceNum: rapidDevice,
    });
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    reset();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        title={collapsed ? "Cadastrar gerador" : undefined}
        onClick={() => {
          setOpen(true);
          onNavigate?.();
        }}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          touchFriendly ? "min-h-11 py-2" : "py-1.5",
          collapsed && "justify-center px-0",
        )}
      >
        <Plus className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        {!collapsed && <span className="truncate">Cadastrar gerador</span>}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-xl bg-card">
          <DialogHeader>
            <DialogTitle>Cadastrar gerador</DialogTitle>
            <DialogDescription>
              A controladora vem da Biblioteca RC. Cadastro e provisionamento industrial são etapas
              separadas; somente Controller Packs de produção podem ser provisionados no Rapid
              SCADA.
            </DialogDescription>
          </DialogHeader>

          {catalogError && (
            <p className="rounded-md border border-offline/40 bg-offline/10 px-3 py-2 text-[12px] text-offline">
              {catalogError}
            </p>
          )}

          <form onSubmit={onSubmit} className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold text-muted-foreground">
                Tag
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value.toUpperCase())}
                  placeholder={preview}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>
              <label className="text-[12px] font-semibold text-muted-foreground">
                Site / unidade
                <input
                  list="rc-generator-sites"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="Informe a unidade"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  required
                />
                <datalist id="rc-generator-sites">
                  {sites.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
            </div>

            <label className="text-[12px] font-semibold text-muted-foreground">
              Controladora
              <select
                value={controller}
                onChange={(e) => setController(e.target.value)}
                disabled={catalogLoading || !gensetCatalog.length}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{catalogLoading ? "Carregando catálogo…" : "Selecione"}</option>
                {groupedCatalog.map(([label, items]) => (
                  <optgroup key={label} label={label}>
                    {items.map((item) => (
                      <option key={item.catalogId || item.model} value={item.model}>
                        {item.model}
                        {item.provisionable ? " · PRODUÇÃO" : " · CATÁLOGO"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {selected && (
              <div
                className={`rounded-md border px-3 py-2 text-[11px] ${selected.provisionable ? "border-online/30 bg-online/10" : "border-alert/30 bg-alert/5"}`}
              >
                <p className="font-semibold">
                  {selected.manufacturer} · {selected.family || "Família não informada"}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {selected.provisionable
                    ? `Controller Pack de produção${selected.packStatus ? ` · ${selected.packStatus}` : ""}.`
                    : "Modelo presente no catálogo, mas sem Controller Pack de produção. O cadastro é permitido; provisionamento/telemetria/comandos continuam bloqueados até homologação."}
                </p>
              </div>
            )}

            <label className="text-[12px] font-semibold text-muted-foreground">
              Tipo de conexão
              <select
                value={transport}
                onChange={(e) => changeTransport(e.target.value as GeneratorTransport)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {(Object.keys(transportLabels) as GeneratorTransport[]).map((value) => (
                  <option key={value} value={value}>
                    {transportLabels[value]}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 text-[12px] font-semibold text-muted-foreground">
                {transport === "reverse_tcp"
                  ? "IP remoto (opcional)"
                  : transport === "modbus_rtu_serial"
                    ? "Dispositivo serial"
                    : "IP / hostname"}
                <input
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder={
                    transport === "reverse_tcp"
                      ? "modem conecta ao servidor"
                      : transport === "modbus_rtu_serial"
                        ? "/dev/ttyUSB0"
                        : "10.50.1.130"
                  }
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>
              <label className="text-[12px] font-semibold text-muted-foreground">
                Porta TCP
                <input
                  inputMode="numeric"
                  value={listenPort}
                  disabled={transport === "modbus_rtu_serial"}
                  onChange={(e) => setListenPort(e.target.value.replace(/\D/g, ""))}
                  placeholder={transport === "modbus_tcp_direct" ? "502" : "15001"}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-semibold text-muted-foreground">
                Modbus Unit ID
                <input
                  inputMode="numeric"
                  value={modbusUnit}
                  onChange={(e) => setModbusUnit(e.target.value.replace(/\D/g, ""))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>
              <label className="text-[12px] font-semibold text-muted-foreground">
                Rapid Device Nº (opcional)
                <input
                  inputMode="numeric"
                  value={rapidDeviceNum}
                  onChange={(e) => setRapidDeviceNum(e.target.value.replace(/\D/g, ""))}
                  placeholder="automático"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>
            </div>

            {error && <p className="text-[12px] text-offline">{error}</p>}
            <button
              type="submit"
              disabled={saving || catalogLoading || !controller}
              className="mt-1 h-9 rounded-md bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Cadastrando..." : "Cadastrar"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
