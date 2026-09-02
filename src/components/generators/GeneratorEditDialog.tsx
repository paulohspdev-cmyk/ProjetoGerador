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
import { industrialApi } from "@/lib/industrial-api";
import { useGenerators } from "./GeneratorsProvider";
import { NetworkDiscoveryPanel } from "./NetworkDiscoveryPanel";

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
  const [transport, setTransport] = useState<"reverse_tcp" | "modbus_tcp_direct" | "rtu_over_tcp">(
    generator.transport === "modbus_tcp_direct" || generator.transport === "rtu_over_tcp"
      ? generator.transport
      : "reverse_tcp",
  );
  const [host, setHost] = useState(generator.transport === "reverse_tcp" ? "" : generator.ip || "");
  const [listenPort, setListenPort] = useState(String(generator.listenPort || ""));
  const [modbusUnit, setModbusUnit] = useState(String(generator.modbusUnit || 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(generator.name?.trim() || generator.tag);
    setSite(generator.site);
    setEnabled(generator.enabled !== false);
    setTransport(
      generator.transport === "modbus_tcp_direct" || generator.transport === "rtu_over_tcp"
        ? generator.transport
        : "reverse_tcp",
    );
    setHost(generator.transport === "reverse_tcp" ? "" : generator.ip || "");
    setListenPort(String(generator.listenPort || ""));
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
    const port = Number(listenPort);
    const unit = Number(modbusUnit);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError("Informe uma porta TCP válida entre 1 e 65535.");
      return;
    }
    if (!Number.isInteger(unit) || unit < 1 || unit > 247) {
      setError("O Unit ID Modbus deve ficar entre 1 e 247.");
      return;
    }
    if (transport !== "reverse_tcp" && !host.trim()) {
      setError("Informe o IP da controladora ou do gateway.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateGenerator(generator.id, {
      name: name.trim(),
      site: site.trim(),
      enabled,
    });
    if (result) {
      setSaving(false);
      setError(result);
      return;
    }
    const currentTransport =
      generator.transport === "modbus_tcp_direct" || generator.transport === "rtu_over_tcp"
        ? generator.transport
        : "reverse_tcp";
    const connectionChanged =
      transport !== currentTransport ||
      (transport !== "reverse_tcp" && host.trim() !== generator.ip) ||
      port !== Number(generator.listenPort || 0) ||
      unit !== Number(generator.modbusUnit || 1);
    if (connectionChanged) {
      try {
        await industrialApi.lifecycle.reconfigure(generator.id, generator.tag, {
          transport,
          ip: transport === "reverse_tcp" ? "" : host.trim(),
          listenPort: port,
          modbusUnit: unit,
        });
        await refresh();
      } catch (reconfigureError) {
        setSaving(false);
        setError(
          reconfigureError instanceof Error
            ? reconfigureError.message
            : "Falha ao reconfigurar a comunicação.",
        );
        return;
      }
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
                    const value = event.target.value as typeof transport;
                    setTransport(value);
                    if (value === "modbus_tcp_direct" && !listenPort) setListenPort("502");
                  }}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="reverse_tcp">Modem iniciando conexão (TCP reverso)</option>
                  <option value="modbus_tcp_direct">Controladora por IP / VPN</option>
                  <option value="rtu_over_tcp">Gateway RTU sobre TCP</option>
                </select>
              </label>

              {transport !== "reverse_tcp" && (
                <label className="block text-xs font-semibold">
                  IP da controladora ou gateway
                  <input
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    placeholder="Ex.: 10.40.10.25"
                    className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  />
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
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

              {transport !== "reverse_tcp" && (
                <NetworkDiscoveryPanel
                  port={Number(listenPort || 502)}
                  onSelect={setHost}
                  onError={setError}
                />
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
                Equipamentos desativados permanecem cadastrados, mas saem da operação.
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
