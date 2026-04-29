import dayjs from "dayjs";
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { HistoryPoint } from "../../types";
import { useTheme } from "../../context/ThemeContext";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

interface Props {
  data: HistoryPoint[];
  days: number;
  onDaysChange: (d: number) => void;
}

const RANGE_OPTIONS = [
  { label: "30天", value: 30 },
  { label: "90天", value: 90 },
  { label: "180天", value: 180 },
  { label: "1年", value: 365 },
];

export default function ValueTrendLine({ data, days, onDaysChange }: Props) {
  const { dark } = useTheme();
  const tickFormat = days <= 90 ? "MM/DD" : "YYYY/MM";

  const gridColor = dark ? "#374151" : "#f0f0f0";
  const tickColor = dark ? "#9ca3af" : "#6b7280";
  const tooltipStyle = dark
    ? { fontSize: 12, borderRadius: 8, border: "1px solid #374151", backgroundColor: "#1f2937", color: "#f9fafb" }
    : { fontSize: 12, borderRadius: 8 };

  return (
    <div>
      <div className="flex justify-end gap-1 mb-3">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onDaysChange(opt.value)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              days === opt.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-600 text-sm">
          尚無歷史資料 — 請點擊「回填歷史」載入過去資料
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => dayjs(v).format(tickFormat)}
              tick={{ fontSize: 11, fill: tickColor }}
            />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: tickColor }} width={60} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [
                `NT$ ${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value)}`,
                name,
              ]}
              labelFormatter={(l) => dayjs(l).format("YYYY/MM/DD")}
            />
            <Legend />
            <Line type="monotone" dataKey="total_value_twd" name="市值" stroke="#3b82f6" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="total_cost_twd" name="成本" stroke="#9ca3af" dot={false} strokeWidth={1.5} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
