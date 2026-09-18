import { Hand, Play, Square } from "lucide-react";

import type { Generator } from "@/data/generators";
import { cn } from "@/lib/utils";

function modeShort(mode: Generator["mode"]) {
  if (mode === "MANUAL") return "MAN";
  if (mode === "AUTO") return "AUT";
  if (mode === "TESTE") return "TEST";
  return "OFF";
}

export function headerMode(mode: Generator["mode"], known: boolean) {
  return known ? modeShort(mode) : "—";
}

export function VerticalControls({
  gen,
  dse,
  modeKnown,
  canStart,
  canStop,
  busy,
  onStart,
  onStop,
}: {
  gen: Generator;
  dse: boolean;
  modeKnown: boolean;
  canStart: boolean;
  canStop: boolean;
  busy: "start" | "stop" | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const activeMode = modeKnown ? modeShort(gen.mode) : "";

  return (
    <section className="vref-section vref-control">
      <h4>{dse ? "CONTROL (DSE STYLE)" : "CONTROL"}</h4>

      {dse ? (
        <div className="vref-dse-control-row">
          <button
            type="button"
            disabled
            aria-label="DSE manual mode"
            className={cn("vref-dse-hand", modeKnown && gen.mode === "MANUAL" && "is-active")}
          >
            <Hand aria-hidden />
          </button>
          <button
            type="button"
            disabled
            className={cn("vref-dse-auto", modeKnown && gen.mode === "AUTO" && "is-active")}
          >
            <span className="vref-auto-badge">A</span>
            <span>AUTO</span>
            <i />
          </button>
        </div>
      ) : (
        <div className="vref-mode-row">
          {["OFF", "MAN", "AUT", "TEST"].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              aria-pressed={activeMode === label}
              className={cn(activeMode === label && "is-active")}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="vref-start-stop-row">
        <button
          type="button"
          className="start"
          disabled={!canStart || busy !== null}
          onClick={onStart}
        >
          <Play aria-hidden /> {busy === "start" ? "..." : "START"}
        </button>
        <button
          type="button"
          className="stop"
          disabled={!canStop || busy !== null}
          onClick={onStop}
        >
          <Square aria-hidden /> {busy === "stop" ? "..." : "STOP"}
        </button>
      </div>
    </section>
  );
}
