import { Activity, History, Radio, ShieldCheck } from "lucide-react";

import type { Generator } from "@/data/generators";
import type { EventItemApi, RapidTrend } from "@/lib/api";

import type { GeneratorDetailModel } from "./generator-detail-model";
import { TrendCard } from "./GeneratorDetailPrimitives";

export function GeneratorDetailBottom({
  gen,
  model,
  events,
  eventError,
  trend,
  trendLoading,
  trendError,
}: {
  gen: Generator;
  model: GeneratorDetailModel;
  events: EventItemApi[];
  eventError: string;
  trend: RapidTrend | null;
  trendLoading: boolean;
  trendError: string;
}) {
  const { available, comm, rpm, frequency, genL1, genL12, mainsKnown, mcbKnown, gcbKnown } = model;

  return (
    <div className="gen-bottom">
      <TrendCard trend={trend} loading={trendLoading} error={trendError} />

      <section className="gen-card min-h-0 overflow-hidden">
        <header className="gen-card-head">
          <h2>Eventos</h2>
          <span className="num text-[10px] text-muted-foreground">{events.length}</span>
        </header>
        <div className="gen-resumo">
          {eventError && (
            <div>
              <span>Erro</span>
              <b>{eventError}</b>
            </div>
          )}
          {!eventError && !events.length && (
            <div>
              <span>Eventos</span>
              <b>Nenhum registrado</b>
            </div>
          )}
          {events.slice(0, 8).map((event) => (
            <div key={event.id} className="gen-log">
              <span>{new Date(event.created_at * 1000).toLocaleTimeString("pt-BR")}</span>
              <b>{event.message}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="gen-card min-h-0 overflow-hidden">
        <header className="gen-card-head">
          <h2>Disponibilidade dos sinais</h2>
          <span className="num text-[10px] text-muted-foreground">{available.size}</span>
        </header>
        <div className="gen-resumo">
          <div>
            <span>Comunicação</span>
            <b>{comm ? "CONECTADO" : "N/D"}</b>
          </div>
          <div>
            <span>RPM</span>
            <b>{rpm != null ? "DISPONÍVEL" : "N/D"}</b>
          </div>
          <div>
            <span>Frequência</span>
            <b>{frequency != null ? "DISPONÍVEL" : "N/D"}</b>
          </div>
          <div>
            <span>Tensão GEN</span>
            <b>{genL1 != null || genL12 != null ? "DISPONÍVEL" : "N/D"}</b>
          </div>
          <div>
            <span>Tensão rede</span>
            <b>{mainsKnown ? "DISPONÍVEL" : "N/D"}</b>
          </div>
          <div>
            <span>MCB / GCB</span>
            <b>{mcbKnown || gcbKnown ? "DISPONÍVEL" : "N/D"}</b>
          </div>
        </div>
      </section>

      <section className="gen-card min-h-0 overflow-hidden">
        <header className="gen-card-head">
          <h2>Resumo</h2>
          <ShieldCheck className="size-3.5 text-online" />
        </header>
        <div className="gen-resumo">
          <div>
            <span>Endpoint</span>
            <b className="num">{gen.ip || "N/D"}</b>
          </div>
          <div>
            <span>Controladora</span>
            <b>{gen.controller}</b>
          </div>
          <div>
            <span>Dispositivo</span>
            <b className="num">{gen.rapidDeviceNum ?? "N/D"}</b>
          </div>
          <div>
            <span>Telemetria</span>
            <b>{gen.telemetrySource === "rapid_scada" ? "DISPONÍVEL" : "N/D"}</b>
          </div>
          <div>
            <span>MCB / GCB</span>
            <b>
              {mcbKnown ? (gen.mcb ? "I" : "O") : "N/D"} /{" "}
              {gcbKnown ? (gen.gcb ? "I" : "O") : "N/D"}
            </b>
          </div>
          <div>
            <span>Último erro</span>
            <b>{gen.lastError || "—"}</b>
          </div>
          <div className="gen-log">
            <span>
              <Radio className="inline size-3" />
            </span>
            <b>Sem valores estimados ou simulados</b>
          </div>
          <div className="gen-log">
            <span>
              <Activity className="inline size-3" />
            </span>
            <b>START/STOP disponíveis conforme permissão</b>
          </div>
          <div className="gen-log">
            <span>
              <History className="inline size-3" />
            </span>
            <b>Histórico baseado em dados reais</b>
          </div>
        </div>
      </section>
    </div>
  );
}
