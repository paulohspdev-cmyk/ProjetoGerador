import { Hand } from "lucide-react";

import type { Generator } from "@/data/generators";
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

export function VerticalModeStrip({
  gen,
  dse,
  modeKnown,
}: {
  gen: Generator;
  dse: boolean;
  modeKnown: boolean;
}) {
  const modes: Array<{ label: string; active: boolean; manual?: boolean }> = [
    { label: "OFF", active: gen.mode === "OFF" || gen.mode === "STOP" },
    { label: "MAN", active: gen.mode === "MANUAL", manual: true },
    { label: "AUT", active: gen.mode === "AUTO" },
    { label: "TEST", active: gen.mode === "TESTE" },
  ];

  return (
    <div className={cn("vref-mode-strip", dse && "is-dse")} aria-label="Modo do controlador">
      <span className="vref-mode-strip-label">{dse ? "DSE MODE" : "MODE"}</span>
      <div className="vref-mode-buttons">
        {modes.map((mode) => (
          <button
            key={mode.label}
            type="button"
            disabled
            aria-pressed={modeKnown && mode.active}
            className={cn(modeKnown && mode.active && "is-active", !modeKnown && "is-unknown")}
          >
            {dse && mode.manual ? <Hand aria-hidden /> : null}
            <span>{mode.label}</span>
          </button>
        ))}
      </div>
      {!modeKnown && <span className="vref-mode-unknown">N/D</span>}
    </div>
  );
}
