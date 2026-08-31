import { cn } from "@/lib/utils";

import { formatMetric } from "../generator-metrics";
import { IoBtn, PowerFlowSld } from "../power-flow/PowerFlowDiagram";
import type { GeneratorDetailModel } from "./generator-detail-model";

export function GeneratorDetailPowerFlow({
  model,
  operate,
  commandBusy,
  onCommand,
}: {
  model: GeneratorDetailModel;
  operate: boolean;
  commandBusy: "start" | "stop" | null;
  onCommand: (action: "start" | "stop") => void | Promise<void>;
}) {
  const {
    running,
    runningKnown,
    mcbKnown,
    gcbKnown,
    mcb,
    gcb,
    mainsKnown,
    mainsOk,
    modeLabel,
    frequency,
    load,
    mainsL1,
    mainsL2,
    mainsL3,
    mainsL12,
    genL1,
    genL2,
    genL3,
    genL12,
  } = model;

  return (
    <section className="comap-panel gen-flow">
      <header className="comap-header">
        <span className={cn("comap-logo", running === true ? "online" : "offline")}>G</span>
        <h3 className="comap-name">Power Flow</h3>
        <span className="comap-mode">MODE: {modeLabel}</span>
      </header>

      <div className="comap-sld min-h-0 flex-1 px-1 pb-1">
        <div className="comap-sld-stage">
          <button
            type="button"
            disabled
            title="Paralelismo indisponível"
            className="comap-prll absolute left-0 top-[1%] z-20 cursor-not-allowed opacity-60"
          >
            PRLL
            <br />
            N/D
          </button>

          <div className="absolute left-[1%] top-[24%] z-[2] flex flex-col items-center gap-0.5">
            <span className="flow-breaker-name">MCB</span>
            <div className="flex flex-col gap-0.5">
              <IoBtn
                label="I"
                tone="close"
                active={mcbKnown && mcb}
                ariaLabel={mcbKnown ? "MCB fechado" : "Estado MCB indisponível"}
              />
              <IoBtn
                label="O"
                tone="open"
                active={mcbKnown && !mcb}
                ariaLabel={mcbKnown ? "MCB aberto" : "Estado MCB indisponível"}
              />
            </div>
          </div>

          <div className="absolute left-[1%] top-[50%] z-[2] flex flex-col items-center gap-0.5">
            <span className="flow-breaker-name">GCB</span>
            <div className="flex flex-col gap-0.5">
              <IoBtn
                label="I"
                tone="close"
                active={gcbKnown && gcb}
                ariaLabel={gcbKnown ? "GCB fechado" : "Estado GCB indisponível"}
              />
              <IoBtn
                label="O"
                tone="open"
                active={gcbKnown && !gcb}
                ariaLabel={gcbKnown ? "GCB aberto" : "Estado GCB indisponível"}
              />
            </div>
          </div>

          <PowerFlowSld
            mcb={mcb}
            gcb={gcb}
            running={running === true}
            mainsOk={mainsOk}
            gridHz={0}
            genHz={frequency ?? 0}
            loadKw={load ?? 0}
            mcbKnown={mcbKnown}
            gcbKnown={gcbKnown}
            runningKnown={runningKnown}
            mainsKnown={mainsKnown}
            gridHzKnown={false}
            genHzKnown={frequency != null}
            loadKnown={load != null}
          />

          <div className="absolute bottom-[2%] right-[1%] z-10 flex flex-col gap-1">
            <button
              type="button"
              className="comap-start"
              disabled={!operate || commandBusy !== null}
              onClick={() => void onCommand("start")}
            >
              {commandBusy === "start" ? "..." : "START"}
            </button>
            <button
              type="button"
              className="comap-stop"
              disabled={!operate || commandBusy !== null}
              onClick={() => void onCommand("stop")}
            >
              {commandBusy === "stop" ? "..." : "STOP"}
            </button>
          </div>
        </div>
      </div>

      <div className="comap-mg">
        <div className="comap-table-head">
          <span>Mains / Gen</span>
          <span>Rede</span>
          <span>Gerador</span>
        </div>
        {[
          ["L1-N", formatMetric(mainsL1, "V", 0), formatMetric(genL1, "V", 0)],
          ["L2-N", formatMetric(mainsL2, "V", 0), formatMetric(genL2, "V", 0)],
          ["L3-N", formatMetric(mainsL3, "V", 0), formatMetric(genL3, "V", 0)],
          ["L1-L2", formatMetric(mainsL12, "V", 0), formatMetric(genL12, "V", 0)],
          ["Hz", "N/D", formatMetric(frequency, "Hz", 2)],
          ["kW", "N/D", formatMetric(load, "kW", 0)],
        ].map(([label, mainsValue, genValue]) => (
          <div key={label} className="comap-table-row">
            <span className="label">{label}</span>
            <span className="mains">{mainsValue}</span>
            <span className="gen">{genValue}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
