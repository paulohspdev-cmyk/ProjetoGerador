import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/assets";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { cn } from "@/lib/utils";

import { GeneratorEditDialog } from "./GeneratorEditDialog";
import { useGenerators } from "./GeneratorsProvider";
import { GeneratorDetailBottom } from "./detail/GeneratorDetailBottom";
import { GeneratorDetailElectrical } from "./detail/GeneratorDetailElectrical";
import { GeneratorDetailOverview } from "./detail/GeneratorDetailOverview";
import { GeneratorDetailPowerFlow } from "./detail/GeneratorDetailPowerFlow";
import { KpiTile } from "./detail/GeneratorDetailPrimitives";
import { buildGeneratorDetailModel } from "./detail/generator-detail-model";
import { useGeneratorDetailData } from "./detail/useGeneratorDetailData";
import { formatMetric } from "./generator-metrics";
import "./comap-panel.css";
import "./generator-detail.css";

export function GeneratorDetailScreen({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const model = useMemo(() => buildGeneratorDetailModel(gen), [gen]);
  const { events, eventError, trend, trendError, trendLoading } = useGeneratorDetailData(gen);
  const configured = gen.enabled !== false && gen.status !== "nao_configurado";
  const canStart = can("operate") && configured && gen.capabilities?.start === true;
  const canStop = can("operate") && configured && gen.capabilities?.stop === true;
  const labIg4Start = canStart && gen.controller.trim().toLowerCase() === "ig4 200";

  const command = async (action: "start" | "stop") => {
    const allowed = action === "start" ? canStart : canStop;
    if (!can("operate")) {
      setMessage("Seu perfil não possui permissão para operar o gerador.");
      return;
    }
    if (!allowed) {
      setMessage(`${action.toUpperCase()} não está homologado para esta controladora.`);
      return;
    }
    if (!confirmCmd(action.toUpperCase())) return;

    setCommandBusy(action);
    setMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setMessage(result.reason || `Comando ${action.toUpperCase()} aceito pelo controlador.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar o comando.");
    } finally {
      setCommandBusy(null);
    }
  };

  return (
    <article className="gen-detail">
      {message && (
        <div className="gen-toast" role="alert">
          {message}
          <button type="button" onClick={() => setMessage(null)} aria-label="Fechar">
            ×
          </button>
        </div>
      )}

      <div className="gen-top">
        <section className="gen-ident">
          <div className="gen-ident-photo">
            <img
              src={controllerImageSrc(gen.controller)}
              alt={gen.controller}
              onError={(event) => {
                event.currentTarget.src = CONTROLLER_IMAGE_FALLBACK;
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1>{model.name}</h1>
                <p>
                  {gen.controller} · {gen.site || "Sem unidade"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("gen-true", !model.comm && "opacity-60")}>
                  <i />
                  {model.comm ? "ONLINE" : "SEM DADOS"}
                </span>
                <GeneratorEditDialog
                  generator={gen}
                  trigger={
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold hover:bg-secondary"
                    >
                      <Pencil className="size-3.5" /> Editar
                    </button>
                  }
                />
              </div>
            </div>
            <p className="gen-ident-meta">
              {gen.tag} · {model.ready} · {model.modeLabel}
            </p>
          </div>
        </section>

        <div className="gen-kpis">
          <KpiTile
            label="Status"
            value={model.ready}
            sub={model.comm ? "Comunicação ativa" : "Sem comunicação atual"}
            tone={model.comm ? "success" : "danger"}
          />
          <KpiTile label="RPM" value={formatMetric(model.rpm, "rpm", 0)} tone="info" />
          <KpiTile label="Potência" value={formatMetric(model.load, "kW", 0)} tone="accent" />
          <KpiTile label="Frequência" value={formatMetric(model.frequency, "Hz", 2)} tone="info" />
          <KpiTile label="Tensão L1-L2" value={formatMetric(model.genL12, "V", 0)} tone="info" />
        </div>

        <div className="gen-cmds">
          <button
            type="button"
            disabled={!canStop || commandBusy !== null}
            title={canStop ? "Parada homologada" : "STOP indisponível para esta controladora"}
            className={cn(model.running === false && "active off")}
            onClick={() => void command("stop")}
          >
            {commandBusy === "stop" ? "..." : "OFF"}
          </button>
          <button
            type="button"
            disabled={!canStart || commandBusy !== null}
            title={
              labIg4Start
                ? "Partida LAB protegida por intertravamentos"
                : canStart
                  ? "Partida homologada"
                  : "START indisponível para esta controladora"
            }
            className={cn(model.running === true && "active")}
            onClick={() => void command("start")}
          >
            {commandBusy === "start" ? "..." : labIg4Start ? "ON LAB" : "ON"}
          </button>
          <button type="button" disabled title="Função indisponível">
            AUTO
          </button>
          <button type="button" disabled title="Função indisponível">
            TEST
          </button>
        </div>

        <details className="rounded-lg border border-border/70 bg-background/30 px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-foreground">
            Detalhes técnicos
          </summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            <p>Endpoint: {gen.ip || "N/D"}</p>
            <p>Comunicação: {gen.transport || "N/D"}</p>
            <p>Porta: {gen.listenPort ?? "N/D"}</p>
            <p>Endereço Modbus: {gen.modbusUnit ?? "N/D"}</p>
            <p>Dispositivo SCADA: {gen.rapidDeviceNum ?? "N/D"}</p>
            <p>Fonte: {gen.telemetrySource === "rapid_scada" ? "SCADA" : "N/D"}</p>
          </div>
        </details>
      </div>

      <GeneratorDetailPowerFlow
        model={model}
        canStart={canStart}
        canStop={canStop}
        commandBusy={commandBusy}
        onCommand={command}
      />
      <GeneratorDetailOverview gen={gen} model={model} />
      <GeneratorDetailElectrical gen={gen} model={model} />
      <GeneratorDetailBottom
        gen={gen}
        model={model}
        events={events}
        eventError={eventError}
        trend={trend}
        trendLoading={trendLoading}
        trendError={trendError}
      />
    </article>
  );
}
