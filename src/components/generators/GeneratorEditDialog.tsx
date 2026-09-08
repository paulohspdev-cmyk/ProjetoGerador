import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Generator } from "@/data/generators";
import { industrialApi, type LifecycleTransport } from "@/lib/industrial-api";
import { useGenerators } from "./GeneratorsProvider";
import { NetworkDiscoveryPanel } from "./NetworkDiscoveryPanel";

function normalizedTransport(generator: Generator): LifecycleTransport {
  switch (generator.transport) {
    case "modbus_tcp_direct":
    case "rtu_over_tcp":
    case "modbus_rtu_serial":
      return generator.transport;
    default:
      return "reverse_tcp";
  }
}

export function GeneratorEditDialog({
  generator,
  trigger,
}: {
  generator: Generator;
  trigger?: ReactNode;
}) {
  const { can, user } = useAuth();
  const { updateGenerator, refresh } = useGenerators();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(generator.name?.trim() || generator.tag);
  const [site, setSite] = useState(generator.site);
  const [enabled, setEnabled] = useState(generator.enabled !== false);
  const [transport, setTransport] = useState<LifecycleTransport>(normalizedTransport(generator));
  const [host, setHost] = useState(generator.transport === "reverse_tcp" ? "" : generator.ip || "");
  const [listenPort, setListenPort] = useState(
    String(generator.transport === "modbus_rtu_serial" ? "" : generator.listenPort || ""),
  );
  const [modbusUnit, setModbusUnit] = useState(String(generator.modbusUnit || 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(generator.name?.trim() || generator.tag);
    setSite(generator.site);
    setEnabled(generator.enabled !== false);
    setTransport(normalizedTransport(generator));
    setHost(generator.transport === "reverse_tcp" ? "" : generator.ip || "");
    setListenPort(
      String(generator.transport === "modbus_rtu_serial" ? "" : generator.listenPort || ""),
    );
    setModbusUnit(String(generator.modbusUnit || 1));
    setError(null);
  }, [generator, open]);

  if (!can("edit")) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !site.trim()) {
      setError("Informe o nome e a unidade.");
      return;
    }

    const isSerial = transport === "modbus_rtu_serial";
    const port = isSerial ? 0 : Number(listenPort || (transport === "reverse_tcp" ? 0 : 502));
    const unit = Number(modbusUnit);
    if (!isSerial && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      setError("Informe uma porta TCP válida entre 1 e 65535.");
      return;
    }
    if (!Number.isInteger(unit) || unit < 1 || unit > 247) {
      setError("O Unit ID Modbus deve ficar entre 1 e 247.");
      return;
    }
    if (transport !== "reverse_tcp" && !host.trim()) {
      setError(
        isSerial ? "Informe o dispositivo serial." : "Informe o IP da controladora ou do gateway.",
      );
      return;
    }

    const currentTransport = normalizedTransport(generator);
    const currentPort =
      currentTransport === "modbus_rtu_serial" ? 0 : Number(generator.listenPort || 0);
    const connectionChanged =
      transport !== currentTransport ||
      (transport !== "reverse_tcp" && host.trim() !== generator.ip) ||
      port !== currentPort ||
      unit !== Number(generator.modbusUnit || 1);
    const enabledChanged = enabled !== (generator.enabled !== false);

    setSaving(true);
    setError(null);

    try {
      // Identidade industrial e estado operacional são uma única transação no
      // backend. Isso evita desabilitar primeiro e depois tentar reprovisionar um
      // cadastro já marcado como inativo.
      if (connectionChanged || enabledChanged) {
        await industrialApi.lifecycle.reconfigure(generator.id, generator.tag, {
          transport,
          ip: transport === "reverse_tcp" ? "" : host.trim(),
          listenPort: port,
          modbusUnit: unit,
          enabled,
        });
      }

      // Nome/site não fazem parte da identidade industrial e podem ser salvos
      // depois da transação sem reabrir o Rapid SCADA.
      const result = await updateGenerator(generator.id, {
        name: name.trim(),
        site: site.trim(),
      });
      if (result) throw new Error(result);
      await refresh();
    } catch (saveError) {
      setSaving(false);
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar as alterações.");
      return;
    }

    setSaving(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-secondary"
          >
            <Pencil className="size-3.5" /> Editar
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle>Editar gerador</DialogTitle>
          <DialogDescription>
            Altere os dados cadastrais e a conexão. Mudanças industriais são aplicadas com retirada,
            reprovisionamento e restauração automática em caso de falha.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm font-semibold">
            Nome do gerador
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              maxLength={160}
              required
            />
          </label>

          {user?.role === "administrador" && (
            <fieldset className="space-y-3 rounded-xl border border-border bg-background/35 p-3">
              <legend className="px-1 text-sm font-bold">Comunicação da controladora</legend>
              <label className="block text-xs font-semibold">
                Tipo de conexão
                <select
                  value={transport}
                  onChange={(event) => {
                    const value = event.target.value as LifecycleTransport;
                    setTransport(value);
                    if (
                      (value === "modbus_tcp_direct" || value === "rtu_over_tcp") &&
                      !listenPort
                    ) {
                      setListenPort("502");
                    }
                    if (value === "modbus_rtu_serial") setListenPort("");
                  }}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="reverse_tcp">Modem iniciando conexão (TCP reverso)</option>
                  <option value="modbus_tcp_direct">Controladora por IP / VPN</option>
                  <option value="rtu_over_tcp">Gateway RTU sobre TCP</option>
                  <option value="modbus_rtu_serial">Serial Modbus RTU local</option>
                </select>
              </label>

              {transport !== "reverse_tcp" && (
                <label className="block text-xs font-semibold">
                  {transport === "modbus_rtu_serial"
                    ? "Dispositivo serial"
                    : "IP da controladora ou gateway"}
                  <input
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    placeholder={
                      transport === "modbus_rtu_serial" ? "/dev/ttyUSB0" : "Ex.: 10.40.10.25"
                    }
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {transport !== "modbus_rtu_serial" && (
                  <label className="text-xs font-semibold">
                    Porta TCP
                    <input
                      inputMode="numeric"
                      value={listenPort}
                      onChange={(event) => setListenPort(event.target.value.replace(/\D/g, ""))}
                      placeholder={transport === "reverse_tcp" ? "15006" : "502"}
                      className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </label>
                )}
                <label className="text-xs font-semibold">
                  Unit ID Modbus
                  <input
                    inputMode="numeric"
                    value={modbusUnit}
                    onChange={(event) => setModbusUnit(event.target.value.replace(/\D/g, ""))}
                    placeholder="10"
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </label>
              </div>

              {(transport === "modbus_tcp_direct" || transport === "rtu_over_tcp") && (
                <NetworkDiscoveryPanel
                  port={Number(listenPort || 502)}
                  onSelect={setHost}
                  onError={setError}
                />
              )}

              {transport === "modbus_rtu_serial" && (
                <p className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
                  Baud rate, paridade e stop bits devem estar definidos na configuração de
                  transporte antes de provisionar. O sistema não inventa parâmetros seriais.
                </p>
              )}
            </fieldset>
          )}

          <label className="block text-sm font-semibold">
            Unidade
            <input
              value={site}
              onChange={(event) => setSite(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
              required
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <b className="block text-sm">Cadastro ativo</b>
              <span className="text-xs text-muted-foreground">
                Ao desativar um equipamento provisionado, a configuração ativa é retirada do Rapid
                SCADA com histórico preservado.
              </span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4"
            />
          </label>

          <details className="rounded-xl border border-border bg-background/35 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground">
              Identidade técnica protegida
            </summary>
            <div className="mt-2 space-y-1">
              <p>Tag: {generator.tag}</p>
              <p>Controladora: {generator.controller}</p>
              <p>Comunicação: {generator.transport || "não informada"}</p>
              <p>Identificador interno: {generator.rapidDeviceNum ?? "não provisionado"}</p>
            </div>
          </details>

          {error && <p className="text-sm text-offline">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="h-11 w-full rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
