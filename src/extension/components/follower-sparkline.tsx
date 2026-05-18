interface FollowerSparklineProps {
  points: number[];
  className?: string;
  height?: number;
}

function buildSparklinePath(points: number[], width: number, height: number) {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    const y = height / 2;
    return `M 0 ${y} L ${width} ${y}`;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const step = width / Math.max(points.length - 1, 1);

  return points
    .map((point, index) => {
      const x = step * index;
      const y = height - ((point - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildAreaPath(linePath: string, width: number, height: number) {
  if (!linePath) {
    return '';
  }

  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

export function FollowerSparkline({ points, className = '', height = 60 }: FollowerSparklineProps) {
  const width = 240;
  const chartHeight = Math.max(height - 8, 12);
  const linePath = buildSparklinePath(points, width, chartHeight);
  const areaPath = buildAreaPath(linePath, width, chartHeight);
  const min = points.length > 0 ? Math.min(...points) : 0;
  const max = points.length > 0 ? Math.max(...points) : 0;
  const range = Math.max(max - min, 1);
  const endY =
    points.length <= 1
      ? chartHeight / 2
      : chartHeight - ((points[points.length - 1]! - min) / range) * chartHeight;

  return (
    <div class={`w-full ${className}`}>
      <svg
        aria-hidden="true"
        class="block h-full w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        <path d={`M 0 ${chartHeight} L ${width} ${chartHeight}`} stroke="rgba(36,36,36,0.08)" />
        {areaPath ? <path d={areaPath} fill="rgba(207,218,245,0.5)" /> : null}
        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke="rgba(36,36,36,0.88)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        ) : null}
        {points.length > 0 ? (
          <circle
            cx={width}
            cy={Number(endY.toFixed(2))}
            fill="rgba(36,36,36,0.88)"
            r="2.2"
            stroke="rgba(246,243,241,0.96)"
            strokeWidth="1.2"
          />
        ) : null}
      </svg>
    </div>
  );
}
