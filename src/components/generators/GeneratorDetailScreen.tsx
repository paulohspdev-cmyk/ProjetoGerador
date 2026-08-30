import { useMemo, useState } from "react";

import { CONTROLLER_IMAGE_FALLBACK, controllerImageSrc } from "@/assets";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { cn } from "@/lib/utils";

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

  const command = async (action: "start" | "stop") => {
    if (!can("operate")) {
      setMessage("Seu perfil não possui permissão para operar o gerador.");
      return;
    }
    if (!confirmCmd(action.toUpperCase())) return;

    setCommandBusy(action);
    setMessage(null);
    try {
      const result = await rcApi.generators.command(gen.id, action);
      setMessage(result.reason || `${action.toUpperCase()} aceito pelo caminho homologado.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar comando homologado.");
    } finally {
      setCommandBusy(null);
    }
  };

  const configured = gen.status !== "nao_configurado";
  const operate = can("operate") && configured;

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
              <h1>{model.name}</h1>
              <span className={cn("gen-true", !model.comm && "opacity-60")}>
                <i />
                {model.comm ? "true" : "false"}
              </span>
            </div>
            <p>
              {gen.controller} · {model.ready} · {model.modeLabel} · {gen.site || "Sem site"}
            </p>
            <p className="gen-ident-meta">
              {gen.ip || "Endpoint N/D"} · {gen.tag} · Rapid Device {gen.rapidDeviceNum ?? "N/D"}
            </p>
          </div>
        </section>

        <div className="gen-kpis">
          <KpiTile
            label="Status"
            value={model.ready}
            sub={model.comm ? "Rapid SCADA conectado" : "Sem telemetria atual"}
            tone={model.comm ? "success" : "danger"}
          />
          <KpiTile
            label="RPM"
            value={formatMetric(model.rpm, "rpm", 0)}
            sub="Canal Rapid homologado"
            tone="info"
          />
          <KpiTile
            label="Gerador kW"
            value={formatMetric(model.load, "kW", 0)}
            sub={model.load == null ? "Canal não homologado" : "Rapid SCADA"}
            tone="accent"
          />
          <KpiTile
            label="Gerador Hz"
            value={formatMetric(model.frequency, "Hz", 2)}
            sub={model.frequency == null ? "Canal não homologado" : "Rapid SCADA"}
            tone="info"
          />
          <KpiTile
            label="Tensão L1-L2"
            value={formatMetric(model.genL12, "V", 0)}
            sub={model.genL12 == null ? "Canal não homologado" : "Rapid SCADA"}
            tone="info"
          />
          <KpiTile
            label="Rapid Device"
            value={gen.rapidDeviceNum == null ? "N/D" : String(gen.rapidDeviceNum)}
            sub={`Fonte ${gen.telemetrySource || "none"}`}
            tone="warning"
          />
        </div>

        <div className="gen-cmds">
          <button
            type="button"
            disabled={!operate || commandBusy !== null}
            className={cn(model.running === false && "active off")}
            onClick={() => void command("stop")}
          >
            {commandBusy === "stop" ? "..." : "OFF"}
          </button>
          <button
            type="button"
            disabled={!operate || commandBusy !== null}
            className={cn(model.running === true && "active")}
            onClick={() => void command("start")}
          >
            {commandBusy === "start" ? "..." : "ON"}
          </button>
          <button type="button" disabled title="AUTO ainda não homologado">
            AUTO
          </button>
          <button type="button" disabled title="TEST ainda não homologado">
            TEST
          </button>
        </div>
      </div>

      <GeneratorDetailPowerFlow
        model={model}
        operate={operate}
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
