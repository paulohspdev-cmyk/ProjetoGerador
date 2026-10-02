type Props = {
  cx: number;
  cy: number;
  radius: number;
  angle: number;
  showPointer: boolean;
  pointerClassName: string;
  hubClassName: string;
  groupClassName?: string;
  tipInset?: number;
  baseOffset?: number;
  halfWidth?: number;
  hubRadius?: number;
};

export function GaugeNeedle({
  cx,
  cy,
  radius,
  angle,
  showPointer,
  pointerClassName,
  hubClassName,
  groupClassName,
  tipInset = 12,
  baseOffset = 14,
  halfWidth = 5,
  hubRadius = 6,
}: Props) {
  return (
    <>
      {showPointer ? (
        <g className={groupClassName} transform={`rotate(${angle} ${cx} ${cy})`}>
          <path
            className={pointerClassName}
            d={`M${cx} ${cy - radius + tipInset} L${cx + halfWidth} ${cy - baseOffset} L${cx - halfWidth} ${cy - baseOffset} Z`}
          />
        </g>
      ) : null}
      <circle cx={cx} cy={cy} r={hubRadius} className={hubClassName} />
    </>
  );
}
