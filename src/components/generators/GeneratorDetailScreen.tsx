import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useCommandGuard } from "@/components/scada/ScadaOpsProvider";
import type { Generator } from "@/data/generators";
import { rcApi } from "@/lib/api";
import { industrialApi, type MaintenancePlan } from "@/lib/industrial-api";

import { useGenerators } from "./GeneratorsProvider";
import { buildGeneratorDetailModel } from "./detail/generator-detail-model";
import { GeneratorDetailProfessionalLower } from "./detail/GeneratorDetailProfessionalLower";
import { GeneratorDetailProfessionalTop } from "./detail/GeneratorDetailProfessionalTop";
import { useGeneratorDetailData } from "./detail/useGeneratorDetailData";
import "./generator-detail.css";

export function GeneratorDetailScreen({ gen }: { gen: Generator }) {
  const { can } = useAuth();
  const { refresh } = useGenerators();
  const confirmCmd = useCommandGuard();
  const [commandBusy, setCommandBusy] = useState<"start" | "stop" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [maintenanceError, setMaintenanceError] = useState("");

  const model = useMemo(() => buildGeneratorDetailModel(gen), [gen]);
  const { events, eventError, trend, trendError, trendLoading } = useGeneratorDetailData(gen);

  useEffect(() => {
    let active = true;
    void industrialApi.maintenance
      .list()
      .then((rows) => {
        if (!active) return;
        setPlans(
          rows.filter((row) => row.generator_id === gen.id || row.generator_tag === gen.tag),
        );
        setMaintenanceError("");
      })
      .catch((error) => {
        if (active) {
          setMaintenanceError(
            error instanceof Error ? error.message : "Falha ao consultar manutenção.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [gen.id, gen.tag]);

  const configured = gen.enabled !== false && gen.status !== "nao_configurado";
  const normalizedController = gen.controller.trim().toLowerCase();
  const homologatedIg200 =
    normalizedController === "inteligen 200" &&
    gen.transport === "reverse_tcp" &&
    Number(gen.rapidDeviceNum || 0) > 0;
  const canStart =
    can("operate") && configured && (gen.capabilities?.start === true || homologatedIg200);
  const canStop =
    can("operate") && configured && (gen.capabilities?.stop === true || homologatedIg200);

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
      const rpmConfirmation =
        result.rpm_after != null
          ? ` · RPM após comando: ${Math.round(result.rpm_after)} · sincronizando telemetria`
          : " · aguardando sincronização da telemetria";
      setMessage(
        `${result.reason || `Comando ${action.toUpperCase()} aceito pelo controlador`}${rpmConfirmation}`,
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar o comando.");
    } finally {
      setCommandBusy(null);
    }
  };

  return (
    <article className="gen-detail-professional scroll-slim min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
      {message && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            aria-label="Fechar"
            className="grid size-7 place-items-center rounded-md hover:bg-white/5"
          >
            ×
          </button>
        </div>
      )}

      <GeneratorDetailProfessionalTop
        gen={gen}
        model={model}
        canStart={canStart}
        canStop={canStop}
        commandBusy={commandBusy}
        onCommand={command}
      />
      <GeneratorDetailProfessionalLower
        gen={gen}
        model={model}
        events={events}
        eventError={eventError}
        trend={trend}
        trendLoading={trendLoading}
        trendError={trendError}
        plans={plans}
        maintenanceError={maintenanceError}
        canStart={canStart}
        canStop={canStop}
      />
    </article>
  );
}
