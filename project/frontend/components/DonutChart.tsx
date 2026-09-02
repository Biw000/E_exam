"use client";

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  /** Big number shown in the middle. */
  centerLabel?: string;
  centerSub?: string;
  size?: number;
}

/**
 * Small donut chart drawn as SVG arcs.
 *
 * Hand-rolled rather than pulled from a charting library: this is the only
 * chart in the app, and a dependency for one shape would cost more download
 * than the whole page.
 */
export default function DonutChart({ slices, centerLabel, centerSub, size = 180 }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = size / 2;
  const thickness = size * 0.22;
  const inner = radius - thickness;

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border-8 border-slate-100 text-sm text-slate-400"
        style={{ width: size, height: size }}
      >
        ยังไม่มีข้อมูล
      </div>
    );
  }

  // A single non-zero slice would collapse into a zero-length arc, so draw it
  // as a plain ring instead.
  const nonZero = slices.filter((s) => s.value > 0);
  const isSingle = nonZero.length === 1;

  let angle = -Math.PI / 2;
  const paths = nonZero.map((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;

    const x1 = radius + radius * Math.cos(start);
    const y1 = radius + radius * Math.sin(start);
    const x2 = radius + radius * Math.cos(end);
    const y2 = radius + radius * Math.sin(end);
    const x3 = radius + inner * Math.cos(end);
    const y3 = radius + inner * Math.sin(end);
    const x4 = radius + inner * Math.cos(start);
    const y4 = radius + inner * Math.sin(start);
    const largeArc = sweep > Math.PI ? 1 : 0;

    return {
      label: slice.label,
      color: slice.color,
      d:
        `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} ` +
        `L ${x3} ${y3} A ${inner} ${inner} 0 ${largeArc} 0 ${x4} ${y4} Z`,
    };
  });

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} role="img" aria-label="สัดส่วนผู้ผ่านและไม่ผ่าน">
        {isSingle ? (
          <circle
            cx={radius}
            cy={radius}
            r={(radius + inner) / 2}
            fill="none"
            stroke={nonZero[0].color}
            strokeWidth={thickness}
          />
        ) : (
          paths.map((p) => <path key={p.label} d={p.d} fill={p.color} />)
        )}
        {centerLabel && (
          <text
            x={radius}
            y={radius - 2}
            textAnchor="middle"
            className="fill-slate-900 text-xl font-semibold"
            style={{ fontSize: size * 0.18 }}
          >
            {centerLabel}
          </text>
        )}
        {centerSub && (
          <text
            x={radius}
            y={radius + size * 0.14}
            textAnchor="middle"
            className="fill-slate-400"
            style={{ fontSize: size * 0.08 }}
          >
            {centerSub}
          </text>
        )}
      </svg>

      <ul className="space-y-1 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-slate-600">{s.label}</span>
            <span className="font-medium tabular-nums">{s.value}</span>
            <span className="text-xs text-slate-400">
              ({total ? Math.round((s.value / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
