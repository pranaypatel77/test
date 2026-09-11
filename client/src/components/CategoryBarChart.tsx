import { formatCurrency } from '../format.js';

interface CategoryBarChartProps {
  categoryTotals: Record<string, number>;
  categoryColors: Record<string, string>;
}

const CHART_WIDTH = 400;
const BAR_HEIGHT = 24;
const ROW_HEIGHT = 32;
const DEFAULT_BAR_COLOR = '#888888';

/**
 * A horizontal bar chart of category spending, drawn with plain SVG (no
 * charting library). Bar width is proportional to the largest category
 * total, and each bar is filled with its category's color.
 */
export default function CategoryBarChart({ categoryTotals, categoryColors }: CategoryBarChartProps) {
  const entries = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    return null;
  }

  const maxAmount = Math.max(...entries.map(([, cents]) => cents));
  const height = entries.length * ROW_HEIGHT;

  return (
    <svg
      role="img"
      aria-label="Spending by category"
      viewBox={`0 0 ${CHART_WIDTH} ${height}`}
      width="100%"
      height={height}
      className="category-bar-chart"
    >
      {entries.map(([name, cents], index) => {
        const barWidth = maxAmount > 0 ? Math.max((cents / maxAmount) * CHART_WIDTH, 2) : 0;
        const y = index * ROW_HEIGHT;

        return (
          <g key={name} data-testid={`category-bar-${name}`}>
            <rect
              x={0}
              y={y}
              width={barWidth}
              height={BAR_HEIGHT}
              fill={categoryColors[name] ?? DEFAULT_BAR_COLOR}
            />
            <text x={8} y={y + BAR_HEIGHT / 2} dominantBaseline="middle" className="category-bar-label">
              {name}
            </text>
            <text
              x={barWidth + 8}
              y={y + BAR_HEIGHT / 2}
              dominantBaseline="middle"
              className="category-bar-amount"
            >
              {formatCurrency(cents)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
