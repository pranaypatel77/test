import type { Transaction } from '../types.js';

interface SpendingChartProps {
  transactions: Transaction[];
}

interface CategoryTotal {
  key: string;
  name: string;
  color: string;
  totalCents: number;
}

const UNCATEGORIZED_COLOR = '#8a8f98';

/** Aggregates expense transactions into a total per category, largest first. */
function summarizeByCategory(transactions: Transaction[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();

  for (const transaction of transactions) {
    if (transaction.amount_cents >= 0) {
      continue;
    }

    const key = transaction.category_name ?? 'Uncategorized';
    const existing = totals.get(key);
    const amount = Math.abs(transaction.amount_cents);

    if (existing) {
      existing.totalCents += amount;
    } else {
      totals.set(key, {
        key,
        name: key,
        color: transaction.category_color ?? UNCATEGORIZED_COLOR,
        totalCents: amount,
      });
    }
  }

  return Array.from(totals.values()).sort((a, b) => b.totalCents - a.totalCents);
}

const CHART_WIDTH = 480;
const BAR_HEIGHT = 24;
const BAR_GAP = 12;
const LABEL_WIDTH = 140;

/** An SVG bar chart of spending by category, used on the dashboard. */
export default function SpendingChart({ transactions }: SpendingChartProps) {
  const totals = summarizeByCategory(transactions);

  if (totals.length === 0) {
    return <p>No spending recorded yet.</p>;
  }

  const maxCents = Math.max(...totals.map((total) => total.totalCents));
  const barAreaWidth = CHART_WIDTH - LABEL_WIDTH;
  const height = totals.length * (BAR_HEIGHT + BAR_GAP);

  return (
    <svg
      className="spending-chart"
      role="img"
      aria-label="Spending by category"
      viewBox={`0 0 ${CHART_WIDTH} ${height}`}
      width="100%"
      height={height}
    >
      {totals.map((total, index) => {
        const y = index * (BAR_HEIGHT + BAR_GAP);
        const width = maxCents === 0 ? 0 : (total.totalCents / maxCents) * barAreaWidth;
        const amount = (total.totalCents / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        });

        return (
          <g key={total.key}>
            <text x={0} y={y + BAR_HEIGHT / 2} dy="0.35em" className="spending-chart-label">
              {total.name}
            </text>
            <rect x={LABEL_WIDTH} y={y} width={width} height={BAR_HEIGHT} rx={4} fill={total.color} />
            <text
              x={LABEL_WIDTH + width + 8}
              y={y + BAR_HEIGHT / 2}
              dy="0.35em"
              className="spending-chart-value"
            >
              {amount}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
