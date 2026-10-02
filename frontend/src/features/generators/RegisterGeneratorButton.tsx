import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { useAuth } from "@/features/auth/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import { nextGeneratorTag } from "@/data/generators";
import { industrialApi } from "@/lib/industrial-api";
import { rcApi, type FieldDevice, type GeneratorTransport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { connectionOptions, GeneratorConnectionFields } from "./GeneratorConnectionFields";
import { GeneratorEquipmentFields, type CatalogController } from "./GeneratorEquipmentFields";
import {
  approvedModems as selectApprovedModems,
  modemAdmissionPort,
} from "./generator-modem-onboarding";
import { useGenerators } from "./GeneratorsProvider";

type LibraryWithCatalog = {
  catalog?: CatalogController[];
};

function provisionMessage(error: unknown) {
  const detail = error instanceof Error ? `: ${error.message}` : ".";
  return `Gerador cadastrado; configuração pendente${detail}`;
}

export function RegisterGeneratorButton({
  collapsed,
  touchFriendly,
  onNavigate,
}: {
  collapsed?: boolean | undefined;
  touchFriendly?: boolean | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const { user } = useAuth();
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
  const [baudRate, setBaudRate] = useState("");
  const [parity, setParity] = useState("");
  const [stopBits, setStopBits] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [catalog, setCatalog] = useState<CatalogController[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [modems, setModems] = useState<FieldDevice[]>([]);
  const [selectedModemId, setSelectedModemId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const preview = useMemo(() => nextGeneratorTag(generators), [generators]);
  const gensetCatalog = useMemo(
    () => catalog.filter((item) => !item.application || item.application === "genset"),
    [catalog],
  );
  const selectedController = useMemo(
    () => gensetCatalog.find((item) => item.model === controller),
    [controller, gensetCatalog],
  );
  const approvedModems = useMemo(() => selectApprovedModems(modems), [modems]);
  const selectedModem = useMemo(
    () => approvedModems.find((modem) => modem.id === selectedModemId),
    [approvedModems, selectedModemId],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([rcApi.library.get(), rcApi.sites.list(), rcApi.fieldDevices.list("modem")])
      .then(([library, siteRows, modemRows]) => {
        if (!active) return;
        const rows = ((library as typeof library & LibraryWithCatalog).catalog ?? []).filter(
          (item): item is CatalogController => !!item?.model && !!item?.manufacturer,
        );
        setCatalog(rows);
        setSites(siteRows.map((item) => item.name).filter(Boolean));
        setModems(modemRows);
        const approved = selectApprovedModems(modemRows);
        setSelectedModemId(
          (current) => current || (approved.length === 1 ? approved[0]?.id || "" : ""),
        );
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
              : "Não foi possível carregar unidades, controladoras e modems.",
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
    setSelectedModemId("");
    setHost("");
    setTag("");
    setListenPort("");
    setModbusUnit("1");
    setRapidDeviceNum("");
    setBaudRate("");
    setParity("");
    setStopBits("");
    setAdvanced(false);
    setSaving(false);
    setError(null);
    setCreatedId(null);
  };

  const effectiveTag = (tag.trim() || preview.tag).toUpperCase();
  const isSerial = transport === "modbus_rtu_serial";
  const effectivePort = Number(
    transport === "reverse_tcp"
      ? modemAdmissionPort(selectedModem)
      : listenPort || (transport === "modbus_tcp_direct" || transport === "rtu_over_tcp" ? 502 : 0),
  );
  const effectiveUnit = Number(modbusUnit || 1);
  const effectiveBaud = Number(baudRate);

  const isLabReadOnly = selectedController?.onboardingMode === "lab_read_only";
  const isCatalogRegistration = Boolean(
    selectedController && !selectedController.provisionable && !isLabReadOnly,
  );
  const canContinueStep1 = Boolean(site.trim() && controller && selectedController);
  const canContinueStep2 = isSerial
    ? Boolean(
        host.trim() && Number.isInteger(effectiveBaud) && effectiveBaud > 0 && parity && stopBits,
      )
    : transport === "reverse_tcp"
      ? Boolean(selectedModem && effectivePort > 0)
      : Boolean(selectedModem && host.trim() && effectivePort > 0);

  const applyTransportConfig = async (generatorId: string) => {
    if (!isSerial) return;
    await rcApi.generators.setTransportConfig(generatorId, {
      baudRate: effectiveBaud,
      dataBits: 8,
      parity,
      stopBits,
    });
  };

  const retryProvision = async () => {
    if (!createdId) return;
    setSaving(true);
    setError(null);
    try {
      await applyTransportConfig(createdId);
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
    if (!site.trim() || !controller || !selectedController) {
      setError("Escolha a unidade e a controladora.");
      return;
    }
    if (!isSerial && !selectedModem) {
      setError("Selecione um modem aprovado antes de cadastrar o gerador.");
      return;
    }
    if (transport !== "reverse_tcp" && !host.trim()) {
      setError(
        isSerial
          ? "Informe o dispositivo serial."
          : "Informe o endereço da controladora ou gateway.",
      );
      return;
    }
    if (
      !isSerial &&
      (!Number.isInteger(effectivePort) || effectivePort < 1 || effectivePort > 65535)
    ) {
      setError("A porta informada não é válida.");
      return;
    }
    if (!Number.isInteger(effectiveUnit) || effectiveUnit < 1 || effectiveUnit > 247) {
      setError("O endereço Modbus deve ficar entre 1 e 247.");
      return;
    }
    if (
      isSerial &&
      (!Number.isInteger(effectiveBaud) || effectiveBaud <= 0 || !parity || !stopBits)
    ) {
      setError("Informe baud rate, paridade e stop bits para a conexão serial.");
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
        modemId: !isSerial && selectedModem ? selectedModem.id : undefined,
        transport,
        listenPort: isSerial ? 0 : effectivePort,
        modbusUnit: effectiveUnit,
        ...(transport !== "reverse_tcp" && host.trim() ? { ip: host.trim() } : {}),
        ...(rapidDeviceNum ? { rapidDeviceNum: Number(rapidDeviceNum) } : {}),
      });
      setCreatedId(created.id);

      try {
        await applyTransportConfig(created.id);
      } catch (transportError) {
        await refresh();
        setError(
          provisionMessage(
            transportError instanceof Error
              ? new Error(`falha ao salvar parâmetros de transporte: ${transportError.message}`)
              : transportError,
          ),
        );
        return;
      }

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

      // Todo modelo de gerador presente no catálogo pode ser cadastrado com sua
      // identidade industrial (porta/Unit). Sem pack de produção, o cadastro fica
      // disponível para diagnóstico e homologação, mas Rapid e comandos seguem bloqueados.
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
        <DialogContent className="scroll-slim max-h-[90dvh] max-w-2xl overflow-y-auto overscroll-contain bg-card">
          <DialogHeader>
            <DialogTitle>Adicionar gerador</DialogTitle>
            <DialogDescription>
              Para Modem / 4G, aprove primeiro o modem recebido em Comunicação → Modems. Depois
              escolha a controladora e o Unit ID. A configuração automática só é aplicada quando o
              Controller Pack estiver homologado.
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
              <GeneratorEquipmentFields
                name={name}
                setName={setName}
                site={site}
                setSite={setSite}
                sites={sites}
                controller={controller}
                setController={setController}
                controllers={gensetCatalog}
                loading={loading}
              />
            )}

            {step === 2 && (
              <GeneratorConnectionFields
                transport={transport}
                setTransport={setTransport}
                approvedModems={approvedModems}
                selectedModemId={selectedModemId}
                setSelectedModemId={setSelectedModemId}
                host={host}
                setHost={setHost}
                tag={tag}
                setTag={setTag}
                listenPort={listenPort}
                setListenPort={setListenPort}
                modbusUnit={modbusUnit}
                setModbusUnit={setModbusUnit}
                rapidDeviceNum={rapidDeviceNum}
                setRapidDeviceNum={setRapidDeviceNum}
                baudRate={baudRate}
                setBaudRate={setBaudRate}
                parity={parity}
                setParity={setParity}
                stopBits={stopBits}
                setStopBits={setStopBits}
                suggestedTag={preview.tag}
                advanced={advanced}
                setAdvanced={setAdvanced}
                canScan={user?.role === "administrador"}
                setError={setError}
              />
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
                  {transport === "reverse_tcp" && selectedModem && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Modem / Unit ID</dt>
                      <dd className="font-bold">
                        {selectedModem.name} · TCP {effectivePort} · Unit {effectiveUnit}
                      </dd>
                    </div>
                  )}
                  {isSerial && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Serial</dt>
                      <dd className="font-bold">
                        {host} · {effectiveBaud} baud · {parity} · {stopBits}
                      </dd>
                    </div>
                  )}
                </dl>
                {isLabReadOnly && !createdId && (
                  <p className="mt-4 rounded-lg border border-alert/40 bg-alert/10 p-3 text-sm text-alert">
                    Homologação LAB: o gerador será cadastrado para diagnóstico somente leitura.
                    START, STOP, contatores e configuração automática permanecem bloqueados.
                  </p>
                )}
                {isCatalogRegistration && !createdId && (
                  <p className="mt-4 rounded-lg border border-alert/40 bg-alert/10 p-3 text-sm text-alert">
                    {selectedController?.registerable === false
                      ? "Cadastro liberado pelo fluxo de geradores: "
                      : "Cadastro técnico liberado: "}
                    porta/serial e Unit ID serão salvos para diagnóstico e leitura da controladora.
                    Rapid automático, START, STOP e contatores permanecem bloqueados até a
                    homologação do Controller Pack.
                  </p>
                )}
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
                      : isLabReadOnly
                        ? "Cadastrar para homologação"
                        : isCatalogRegistration
                          ? "Cadastrar gerador"
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
