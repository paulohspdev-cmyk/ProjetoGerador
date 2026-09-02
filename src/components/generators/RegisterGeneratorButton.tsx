import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { nextGeneratorTag } from "@/data/generators";
import { industrialApi } from "@/lib/industrial-api";
import { rcApi, type GeneratorTransport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useGenerators } from "./GeneratorsProvider";

type CatalogController = {
  catalogId?: string;
  manufacturer: string;
  family?: string;
  model: string;
  application?: string;
  provisionable?: boolean;
};

type LibraryWithCatalog = {
  catalog?: CatalogController[];
};

function provisionMessage(error: unknown) {
  const detail = error instanceof Error ? `: ${error.message}` : ".";
  return `Gerador cadastrado; configuração pendente${detail}`;
}

const connectionOptions: Array<{
  id: GeneratorTransport;
  title: string;
  description: string;
}> = [
  {
    id: "reverse_tcp",
    title: "Modem / 4G",
    description: "O modem inicia a conexão.",
  },
  {
    id: "modbus_tcp_direct",
    title: "Ethernet",
    description: "Acesso direto pela rede local.",
  },
  {
    id: "rtu_over_tcp",
    title: "Gateway Ethernet",
    description: "Barramento RTU via gateway TCP.",
  },
];

export function RegisterGeneratorButton({
  collapsed,
  touchFriendly,
  onNavigate,
}: {
  collapsed?: boolean | undefined;
  touchFriendly?: boolean | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const { generators, refresh } = useGenerators();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [site, setSite] = useState("");
  const [name, setName] = useState("");
  const [controller, setController] = useState("");
  const [transport, setTransport] = useState<GeneratorTransport>("reverse_tcp");
  const [host, setHost] = useState("");
  const [tag, setTag] = useState("");
  const [listenPort, setListenPort] = useState("");
  const [modbusUnit, setModbusUnit] = useState("1");
  const [rapidDeviceNum, setRapidDeviceNum] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [catalog, setCatalog] = useState<CatalogController[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const preview = useMemo(() => nextGeneratorTag(generators), [generators]);
  const suggestedPort = useMemo(() => {
    const used = generators
      .filter((generator) => generator.transport === "reverse_tcp")
      .map((generator) => Number(generator.listenPort || 0))
      .filter((value) => value >= 15001 && value <= 65535);
    return Math.max(15000, ...used) + 1;
  }, [generators]);

  const gensetCatalog = useMemo(
    () => catalog.filter((item) => !item.application || item.application === "genset"),
    [catalog],
  );
  const selectedController = useMemo(
    () => gensetCatalog.find((item) => item.model === controller),
    [controller, gensetCatalog],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([rcApi.library.get(), rcApi.sites.list()])
      .then(([library, siteRows]) => {
        if (!active) return;
        const rows = ((library as typeof library & LibraryWithCatalog).catalog ?? []).filter(
          (item): item is CatalogController => !!item?.model && !!item?.manufacturer,
        );
        setCatalog(rows);
        setSites(siteRows.map((item) => item.name).filter(Boolean));
        const first =
          rows.find((item) => item.application === "genset" && item.provisionable) ??
          rows.find((item) => item.application === "genset") ??
          rows[0];
        setController((current) => current || first?.model || "");
        setSite((current) => current || siteRows[0]?.name || "");
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar unidades e controladoras.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const reset = () => {
    setStep(1);
    setSite("");
    setName("");
    setController("");
    setTransport("reverse_tcp");
    setHost("");
    setTag("");
    setListenPort("");
    setModbusUnit("1");
    setRapidDeviceNum("");
    setAdvanced(false);
    setSaving(false);
    setError(null);
    setCreatedId(null);
  };

  const effectiveTag = (tag.trim() || preview.tag).toUpperCase();
  const effectivePort = Number(
    listenPort ||
      (transport === "reverse_tcp" ? suggestedPort : transport === "modbus_tcp_direct" ? 502 : 0),
  );
  const effectiveUnit = Number(modbusUnit || 1);

  const canContinueStep1 = Boolean(site.trim() && controller && selectedController?.provisionable);
  const canContinueStep2 =
    transport === "reverse_tcp" || (host.trim().length > 0 && effectivePort > 0);

  const retryProvision = async () => {
    if (!createdId) return;
    setSaving(true);
    setError(null);
    try {
      await industrialApi.lifecycle.provision(createdId);
      await refresh();
      reset();
      setOpen(false);
    } catch (provisionError) {
      setError(provisionMessage(provisionError));
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (createdId) {
      await retryProvision();
      return;
    }
    if (!site.trim() || !controller) {
      setError("Escolha a unidade e a controladora.");
      return;
    }
    if (!selectedController?.provisionable) {
      setError("Esta controladora ainda não possui pacote validado para configuração automática.");
      return;
    }
    if (transport !== "reverse_tcp" && !host.trim()) {
      setError("Informe o endereço da controladora ou gateway.");
      return;
    }
    if (!Number.isInteger(effectivePort) || effectivePort < 1 || effectivePort > 65535) {
      setError("A porta informada não é válida.");
      return;
    }
    if (!Number.isInteger(effectiveUnit) || effectiveUnit < 1 || effectiveUnit > 247) {
      setError("O endereço Modbus deve ficar entre 1 e 247.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await rcApi.generators.create({
        tag: effectiveTag,
        name: name.trim() || effectiveTag,
        controller,
        site: site.trim(),
        transport,
        listenPort: effectivePort,
        modbusUnit: effectiveUnit,
        ...(host.trim() ? { ip: host.trim() } : {}),
        ...(rapidDeviceNum ? { rapidDeviceNum: Number(rapidDeviceNum) } : {}),
      });
      setCreatedId(created.id);
      await refresh();

      if (selectedController?.provisionable) {
        try {
          await industrialApi.lifecycle.provision(created.id);
          await refresh();
          reset();
          setOpen(false);
          return;
        } catch (provisionError) {
          setError(provisionMessage(provisionError));
          return;
        }
      }

      reset();
      setOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Não foi possível cadastrar o gerador.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        title={collapsed ? "Adicionar gerador" : undefined}
        onClick={() => {
          setOpen(true);
          onNavigate?.();
        }}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          touchFriendly ? "min-h-11 py-2" : "min-h-9 py-1.5",
          collapsed && "justify-center px-0",
        )}
      >
        <Plus className="size-4 shrink-0 text-primary" />
        {!collapsed && <span className="truncate font-semibold">Adicionar gerador</span>}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-2xl bg-card">
          <DialogHeader>
            <DialogTitle>Adicionar gerador</DialogTitle>
            <DialogDescription>
              Informe o essencial; o sistema completa a configuração validada.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 text-xs">
            {[1, 2, 3].map((value) => (
              <div key={value} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full border font-bold",
                    step >= value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {step > value ? <Check className="size-4" /> : value}
                </span>
                <span
                  className={cn(
                    "hidden sm:inline",
                    step === value ? "font-bold" : "text-muted-foreground",
                  )}
                >
                  {value === 1 ? "Equipamento" : value === 2 ? "Comunicação" : "Confirmar"}
                </span>
              </div>
            ))}
          </div>

          {error && (
            <p className="rounded-lg border border-offline/40 bg-offline/10 px-3 py-2 text-sm text-offline">
              {error}
            </p>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {step === 1 && (
              <div className="space-y-4">
                <label className="block text-sm font-semibold">
                  Nome do gerador
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Gerador principal"
                    className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    maxLength={160}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Unidade
                  <input
                    list="rc-generator-sites"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    required
                  />
                  <datalist id="rc-generator-sites">
                    {sites.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </label>

                <label className="block text-sm font-semibold">
                  Controladora
                  <select
                    value={controller}
                    onChange={(e) => setController(e.target.value)}
                    disabled={loading || !gensetCatalog.length}
                    className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{loading ? "Carregando…" : "Selecione"}</option>
                    {gensetCatalog.map((item) => (
                      <option key={item.catalogId || item.model} value={item.model}>
                        {item.manufacturer} · {item.model}
                        {item.provisionable ? "" : " · somente inventário"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold">Como este gerador se conecta?</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {connectionOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setTransport(option.id);
                          if (option.id === "modbus_tcp_direct" && !listenPort)
                            setListenPort("502");
                          setError(null);
                        }}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors",
                          transport === option.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-secondary/40",
                        )}
                      >
                        <b className="text-sm">{option.title}</b>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {transport !== "reverse_tcp" && (
                  <label className="block text-sm font-semibold">
                    Endereço do equipamento
                    <input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="IP ou nome na rede"
                      className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      required
                    />
                  </label>
                )}

                <div className="rounded-xl border border-online/30 bg-online/8 p-3 text-sm">
                  <b>Configuração automática</b>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O sistema escolhe identificação, porta e canal. Use o modo avançado apenas
                    quando a instalação exigir.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAdvanced((value) => !value)}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Settings2 className="size-4" />
                  {advanced ? "Ocultar opções avançadas" : "Opções avançadas"}
                </button>

                {advanced && (
                  <div className="grid gap-3 rounded-xl border border-border bg-background/35 p-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold">
                      Identificação
                      <input
                        value={tag}
                        onChange={(e) => setTag(e.target.value.toUpperCase())}
                        placeholder={preview.tag}
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Porta TCP
                      <input
                        inputMode="numeric"
                        value={listenPort}
                        onChange={(e) => setListenPort(e.target.value.replace(/\D/g, ""))}
                        placeholder={String(transport === "reverse_tcp" ? suggestedPort : 502)}
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Endereço Modbus
                      <input
                        inputMode="numeric"
                        value={modbusUnit}
                        onChange={(e) => setModbusUnit(e.target.value.replace(/\D/g, ""))}
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Identificador de telemetria
                      <input
                        inputMode="numeric"
                        value={rapidDeviceNum}
                        onChange={(e) => setRapidDeviceNum(e.target.value.replace(/\D/g, ""))}
                        placeholder="Automático"
                        className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="rounded-xl border border-border bg-background/35 p-4">
                <h3 className="text-sm font-extrabold">Confirmar cadastro</h3>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Gerador</dt>
                    <dd className="font-bold">
                      {name.trim() || effectiveTag} · {effectiveTag}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Unidade</dt>
                    <dd className="font-bold">{site}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Controladora</dt>
                    <dd className="font-bold">{controller}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Comunicação</dt>
                    <dd className="font-bold">
                      {connectionOptions.find((option) => option.id === transport)?.title}
                    </dd>
                  </div>
                </dl>
                {createdId && (
                  <p className="mt-4 rounded-lg border border-alert/40 bg-alert/10 p-3 text-sm text-alert">
                    Cadastro salvo. Tente novamente a configuração.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(1, value - 1))}
                disabled={step === 1 || saving || !!createdId}
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-40"
              >
                <ChevronLeft className="size-4" /> Voltar
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((value) => Math.min(3, value + 1))}
                  disabled={loading || (step === 1 ? !canContinueStep1 : !canContinueStep2)}
                  className="inline-flex h-10 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
                >
                  Continuar <ChevronRight className="size-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="h-10 rounded-lg bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
                >
                  {saving
                    ? "Configurando…"
                    : createdId
                      ? "Tentar configuração novamente"
                      : "Criar e configurar"}
                </button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
