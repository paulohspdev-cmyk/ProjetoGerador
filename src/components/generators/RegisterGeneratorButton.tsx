import { type FormEvent, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CONTROLLER_MODELS, GEN_SITES, nextGeneratorTag } from "@/data/generators";
import { useGenerators } from "./GeneratorsProvider";
import { cn } from "@/lib/utils";
import type { GeneratorTransport } from "@/lib/api";

const IG200 = "ComAp InteliGen 200";
const CONTROLLERS = [IG200, ...CONTROLLER_MODELS.filter((item) => item !== IG200)];

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
  const [controller, setController] = useState(IG200);
  const [site, setSite] = useState(GEN_SITES[0]!);
  const [ip, setIp] = useState("");
  const [transport, setTransport] = useState<GeneratorTransport>("reverse_tcp");
  const [listenPort, setListenPort] = useState("15001");
  const [modbusUnit, setModbusUnit] = useState("2");
  const [rapidDeviceNum, setRapidDeviceNum] = useState("200");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTag("");
    setController(IG200);
    setSite(GEN_SITES[0]!);
    setIp("");
    setTransport("reverse_tcp");
    setListenPort("15001");
    setModbusUnit("2");
    setRapidDeviceNum("200");
    setError(null);
    setSaving(false);
  };

  const changeController = (value: string) => {
    setController(value);
    if (value === IG200) {
      setTransport("reverse_tcp");
      setListenPort("15001");
      setModbusUnit("2");
      setRapidDeviceNum("200");
    } else {
      setRapidDeviceNum("");
    }
  };

  const changeTransport = (value: GeneratorTransport) => {
    setTransport(value);
    if (value === "modbus_tcp_direct" && (!listenPort || listenPort === "15001")) setListenPort("502");
    if (value === "reverse_tcp" && (!listenPort || listenPort === "502")) setListenPort("15001");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const port = Number(listenPort || 0);
    const unit = Number(modbusUnit || 1);
    const rapidDevice = rapidDeviceNum ? Number(rapidDeviceNum) : undefined;

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
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
      setError("Informe o IP ou hostname da controladora/gateway.");
      setSaving(false);
      return;
    }

    const err = await addGenerator({
      tag: tag || preview,
      controller,
      site,
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
        <DialogContent className="max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle>Cadastrar gerador</DialogTitle>
            <DialogDescription>
              Cadastre a identidade e a conexão industrial. O Rapid SCADA continua responsável pelo polling e pela telemetria.
            </DialogDescription>
          </DialogHeader>
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
                Site
                <select
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {GEN_SITES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="text-[12px] font-semibold text-muted-foreground">
              Controladora
              <select
                value={controller}
                onChange={(e) => changeController(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {CONTROLLERS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            {controller === IG200 && (
              <p className="rounded-md border border-online/30 bg-online/10 px-3 py-2 text-[11px] text-muted-foreground">
                Perfil homologado: TCP reverso 15001 · Unit ID 2 · Rapid Device 200.
              </p>
            )}

            <label className="text-[12px] font-semibold text-muted-foreground">
              Tipo de conexão
              <select
                value={transport}
                onChange={(e) => changeTransport(e.target.value as GeneratorTransport)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="reverse_tcp">Modem / DTU como TCP Client (conexão reversa)</option>
                <option value="modbus_tcp_direct">Modbus TCP direto / Ethernet</option>
                <option value="rtu_over_tcp">Modbus RTU sobre TCP / gateway Ethernet</option>
                <option value="modbus_rtu_serial">Modbus RTU serial local</option>
              </select>
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 text-[12px] font-semibold text-muted-foreground">
                {transport === "reverse_tcp" ? "IP remoto (opcional)" : "IP / hostname"}
                <input
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder={transport === "reverse_tcp" ? "modem conecta ao servidor" : "10.50.1.130"}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>
              <label className="text-[12px] font-semibold text-muted-foreground">
                Porta TCP
                <input
                  inputMode="numeric"
                  value={listenPort}
                  onChange={(e) => setListenPort(e.target.value.replace(/\D/g, ""))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
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
                  placeholder="200"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>
            </div>

            {error && <p className="text-[12px] text-offline">{error}</p>}
            <button
              type="submit"
              disabled={saving}
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
