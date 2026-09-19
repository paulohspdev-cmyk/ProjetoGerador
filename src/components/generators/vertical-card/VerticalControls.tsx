import { Hand } from "lucide-react";

import type { Generator } from "@/data/generators";
import type { IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";

function modeShort(mode: Generator["mode"]) {
  if (mode === "MANUAL") return "MAN";
  if (mode === "AUTO") return "AUT";
  if (mode === "TESTE") return "TEST";
  return "OFF";
}

export function headerMode(mode: Generator["mode"], known: boolean) {
  return known ? modeShort(mode) : "N/D";
}

function modeEnabled(gen: Generator, action: IndustrialCommandAction) {
  if (action === "manual") return gen.capabilities?.manual === true;
  if (action === "auto") return gen.capabilities?.auto === true;
  if (action === "test") return gen.capabilities?.test === true;
  return false;
}

export function VerticalControls({
  gen,
  dse,
  modeKnown,
  canOperate,
  busy,
  onCommand,
}: {
  gen: Generator;
  dse: boolean;
  modeKnown: boolean;
  canOperate: boolean;
  busy: IndustrialCommandAction | null;
  onCommand: (action: IndustrialCommandAction) => void;
}) {
  const activeMode = modeKnown ? modeShort(gen.mode) : "";
  const modeButton = (label: "OFF" | "MAN" | "AUT" | "TEST", action?: IndustrialCommandAction) => {
    const available = Boolean(action && canOperate && modeEnabled(gen, action));
    return (
      <button
        key={label}
        type="button"
        disabled={!available || busy !== null}
        aria-pressed={activeMode === label}
        className={cn(activeMode === label && "is-active")}
        title={
          available
            ? `Comando ${label} homologado para esta controladora`
            : label === "OFF"
              ? "OFF permanece indicação de modo; parada usa STOP"
              : "Comando ainda não homologado para esta controladora"
        }
        onClick={() => action && available && onCommand(action)}
      >
        {busy === action ? "..." : label}
      </button>
    );
  };

  return (
    <section className="vref-section vref-control">
      <h4>{dse ? "CONTROL (DSE STYLE)" : "CONTROL"}</h4>

      {dse ? (
        <div className="vref-dse-control-row">
          <button
            type="button"
            disabled={!canOperate || !modeEnabled(gen, "manual") || busy !== null}
            aria-label="DSE manual mode"
            className={cn("vref-dse-hand", modeKnown && gen.mode === "MANUAL" && "is-active")}
            title={
              modeEnabled(gen, "manual")
                ? "Selecionar modo manual homologado"
                : "MANUAL ainda não homologado para esta controladora"
            }
            onClick={() => onCommand("manual")}
          >
            <Hand aria-hidden />
          </button>
          <button
            type="button"
            disabled={!canOperate || !modeEnabled(gen, "auto") || busy !== null}
            className={cn("vref-dse-auto", modeKnown && gen.mode === "AUTO" && "is-active")}
            title={
              modeEnabled(gen, "auto")
                ? "Selecionar modo AUTO homologado"
                : "AUTO ainda não homologado para esta controladora"
            }
            onClick={() => onCommand("auto")}
          >
            <span className="vref-auto-badge">A</span>
            <span>{busy === "auto" ? "..." : "AUTO"}</span>
            <i />
          </button>
        </div>
      ) : (
        <div className="vref-mode-row">
          {modeButton("OFF")}
          {modeButton("MAN", "manual")}
          {modeButton("AUT", "auto")}
          {modeButton("TEST", "test")}
        </div>
      )}
    </section>
  );
}
