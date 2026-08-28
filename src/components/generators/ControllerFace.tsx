import { useId } from "react";

import { cn } from "@/lib/utils";

type Props = {
  model: string;
  live?: boolean;
  className?: string;
};

export function ControllerFace({ model, live = false, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const brand = model.toLowerCase().includes("comap") ? "comap" : "dse";
  const lcd = live ? (brand === "comap" ? "#1ad4c8" : "#7CFF4A") : "#1a3a22";
  const label = model.split(" ")[0] ?? "CTRL";
  const body = `ctrl-body-${uid}`;
  const bezel = `ctrl-bezel-${uid}`;
  const glow = `ctrl-glow-${uid}`;

  return (
    <svg viewBox="0 0 88 108" className={cn("h-full w-full", className)} aria-hidden>
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a323c" />
          <stop offset="55%" stopColor="#14181e" />
          <stop offset="100%" stopColor="#0b0d11" />
        </linearGradient>
        <linearGradient id={bezel} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4a5562" />
          <stop offset="100%" stopColor="#1c222b" />
        </linearGradient>
        <filter id={glow} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      <rect x="2" y="2" width="84" height="104" rx="7" fill={`url(#${body})`} stroke="#5b6572" strokeWidth="1.2" />
      <rect x="6" y="6" width="76" height="96" rx="5" fill="#0e1218" stroke={`url(#${bezel})`} strokeWidth="0.8" />

      <rect x="12" y="12" width="64" height="34" rx="3" fill="#07140b" stroke="#2c3832" />
      {live && (
        <rect
          x="14"
          y="14"
          width="60"
          height="30"
          rx="2"
          fill={lcd}
          opacity="0.22"
          filter={`url(#${glow})`}
        />
      )}
      <rect x="14" y="14" width="60" height="30" rx="2" fill="#08150c" />
      <text x="18" y="26" fill={live ? lcd : "#3d5a44"} fontSize="6.5" fontFamily="ui-monospace, monospace" fontWeight="700">
        {label.slice(0, 10)}
      </text>
      <text x="18" y="36" fill={live ? lcd : "#2f4a38"} fontSize="5.5" fontFamily="ui-monospace, monospace">
        {live ? "AUTO  RUN" : "STOPPED"}
      </text>
      <text x="54" y="36" fill={live ? lcd : "#2f4a38"} fontSize="5.5" fontFamily="ui-monospace, monospace">
        {live ? "60Hz" : "0Hz"}
      </text>

      <g>
        {["#22c55e", "#eab308", "#ef4444", "#64748b", "#22c55e", "#38bdf8"].map((c, i) => (
          <circle key={c + i} cx={18 + i * 10.4} cy={54} r="2.1" fill={live ? c : "#2a313c"} />
        ))}
      </g>

      <g fill="#1c242e" stroke="#3d4754" strokeWidth="0.6">
        <rect x="12" y="62" width="14" height="10" rx="2" />
        <rect x="29" y="62" width="14" height="10" rx="2" />
        <rect x="46" y="62" width="14" height="10" rx="2" />
        <rect x="63" y="62" width="13" height="10" rx="2" />
        <rect x="12" y="75" width="14" height="10" rx="2" />
        <rect x="29" y="75" width="14" height="10" rx="2" />
        <rect x="46" y="75" width="14" height="10" rx="2" />
        <rect x="63" y="75" width="13" height="10" rx="2" />
      </g>

      <circle cx="29" cy="96" r="6.2" fill={live ? "#16a34a" : "#14532d"} stroke="#4ade80" strokeWidth="0.7" />
      <circle cx="59" cy="96" r="6.2" fill="#7f1d1d" stroke="#f87171" strokeWidth="0.7" />
      <text x="29" y="98" textAnchor="middle" fill="#ecfdf5" fontSize="5" fontWeight="700">
        I
      </text>
      <text x="59" y="98" textAnchor="middle" fill="#fff1f2" fontSize="5" fontWeight="700">
        O
      </text>
    </svg>
  );
}
