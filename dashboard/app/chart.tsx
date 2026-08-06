interface DayPoint {
  label: string;
  posts: number;
  clicks: number;
}

/** Gráfico de barras (SVG puro, sem dependências): posts e cliques por dia. */
export function ActivityChart({ days }: { days: DayPoint[] }) {
  const width = 900;
  const height = 260;
  const padding = { top: 16, right: 12, bottom: 34, left: 34 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...days.map((d) => Math.max(d.posts, d.clicks)));
  const groupW = innerW / Math.max(1, days.length);
  const barW = Math.min(18, groupW / 2.6);

  const y = (value: number) => padding.top + innerH - (value / max) * innerH;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Posts e cliques por dia">
        {/* linhas de grade */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={padding.left} x2={width - padding.right}
              y1={y(max * f)} y2={y(max * f)}
              stroke="#21262d" strokeWidth={1}
            />
            <text x={padding.left - 6} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill="#8b949e">
              {Math.round(max * f)}
            </text>
          </g>
        ))}

        {days.map((d, i) => {
          const cx = padding.left + i * groupW + groupW / 2;
          return (
            <g key={d.label}>
              <rect
                x={cx - barW - 2} width={barW}
                y={y(d.posts)} height={padding.top + innerH - y(d.posts)}
                rx={3} fill="#2f81f7"
              />
              <rect
                x={cx + 2} width={barW}
                y={y(d.clicks)} height={padding.top + innerH - y(d.clicks)}
                rx={3} fill="#3fb950"
              />
              <text x={cx} y={height - 14} textAnchor="middle" fontSize={10.5} fill="#8b949e">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span><i className="dot dot-blue" /> Posts publicados</span>
        <span><i className="dot dot-green" /> Cliques no afiliado</span>
      </div>
    </div>
  );
}
