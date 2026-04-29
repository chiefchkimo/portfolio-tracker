import { useState } from "react";
import type { AllocationItem } from "../../types";
import { useTheme } from "../../context/ThemeContext";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
];

function fmt(n: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n);
}

interface Props {
  data: AllocationItem[];
}

export default function AllocationPie({ data }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { dark } = useTheme();

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 dark:text-gray-600 text-sm">
        尚無持股資料
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.value_twd - a.value_twd);
  const colorMap = Object.fromEntries(
    data.map((item, i) => [item.symbol, COLORS[i % COLORS.length]])
  );

  const hovBg = dark ? "#1f2937" : "#f8fafc";

  return (
    <div className="space-y-4">
      <div className="flex h-8 rounded-lg overflow-hidden gap-px">
        {sorted.map((item) => (
          <div
            key={item.symbol}
            className="relative transition-all duration-150"
            style={{
              width: `${item.weight_pct}%`,
              backgroundColor: colorMap[item.symbol],
              opacity: hovered && hovered !== item.symbol ? 0.35 : 1,
              minWidth: item.weight_pct > 1 ? 2 : 0,
            }}
            onMouseEnter={() => setHovered(item.symbol)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </div>

      <div className="space-y-2">
        {sorted.map((item) => {
          const color = colorMap[item.symbol];
          const isHov = hovered === item.symbol;
          return (
            <div
              key={item.symbol}
              className="flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors cursor-default"
              style={{ backgroundColor: isHov ? hovBg : "transparent" }}
              onMouseEnter={() => setHovered(item.symbol)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-sm text-gray-800 dark:text-gray-200 w-28 truncate font-medium">
                {item.name || item.symbol}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 w-16 truncate">{item.symbol}</span>
              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${item.weight_pct}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 w-24 text-right">
                NT$ {fmt(item.value_twd)}
              </span>
              <span className="text-sm font-bold w-12 text-right" style={{ color }}>
                {item.weight_pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
