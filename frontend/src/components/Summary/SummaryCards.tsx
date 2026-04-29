import type { Summary, HistoryPoint } from "../../types";
import { ASSET_TYPE_LABELS } from "../../types";
import dayjs from "dayjs";

function fmt(n: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n);
}

function PnlBadge({ pct }: { pct: number }) {
  const color = pct >= 0 ? "text-green-600" : "text-red-600";
  return (
    <span className={`font-semibold ${color}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

function findHistoryAt(history: HistoryPoint[], daysAgo: number): HistoryPoint | null {
  if (!history.length) return null;
  const target = dayjs().subtract(daysAgo, "day");
  let best: HistoryPoint | null = null;
  for (const h of history) {
    if (dayjs(h.date).isBefore(target) || dayjs(h.date).isSame(target, "day")) {
      best = h;
    }
  }
  return best;
}

function PeriodChange({
  label,
  currentValue,
  pastPoint,
}: {
  label: string;
  currentValue: number;
  pastPoint: HistoryPoint | null;
}) {
  if (!pastPoint) {
    return (
      <div className="text-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
        <p className="text-sm text-gray-300 dark:text-gray-600 mt-0.5">—</p>
      </div>
    );
  }
  const change = currentValue - pastPoint.total_value_twd;
  const pct = pastPoint.total_value_twd > 0 ? (change / pastPoint.total_value_twd) * 100 : 0;
  const isUp = change >= 0;
  const color = isUp ? "text-green-600" : "text-red-600";

  return (
    <div className="text-center">
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${color}`}>
        {isUp ? "+" : ""}NT$ {fmt(Math.abs(change))}
      </p>
      <p className={`text-xs ${color}`}>
        {isUp ? "+" : ""}{pct.toFixed(2)}%
      </p>
    </div>
  );
}

interface Props {
  summary: Summary;
  lastRefreshed: Date | null;
  history: HistoryPoint[];
}

export default function SummaryCards({ summary, lastRefreshed, history }: Props) {
  const currentValue = summary.total_value_twd;

  const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const todayRef = sortedHistory.length >= 2 ? sortedHistory[sortedHistory.length - 2] : null;
  const weekRef = findHistoryAt(sortedHistory, 7);
  const monthRef = findHistoryAt(sortedHistory, 30);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">總資產市值</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">NT$ {fmt(summary.total_value_twd)}</p>
          {lastRefreshed && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              更新於 {dayjs(lastRefreshed).format("HH:mm:ss")}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">總成本</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">NT$ {fmt(summary.total_cost_twd)}</p>
          {summary.usd_twd_rate && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">USD/TWD: {summary.usd_twd_rate.toFixed(2)}</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">未實現損益</p>
          <p className={`text-2xl font-bold ${summary.pnl_twd >= 0 ? "text-green-600" : "text-red-600"}`}>
            {summary.pnl_twd >= 0 ? "+" : ""}NT$ {fmt(summary.pnl_twd)}
          </p>
          <div className="mt-1">
            <PnlBadge pct={summary.pnl_pct} />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 px-5 py-4">
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wide">市值變化</p>
        <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-700">
          <PeriodChange label="今日" currentValue={currentValue} pastPoint={todayRef} />
          <PeriodChange label="近 7 日" currentValue={currentValue} pastPoint={weekRef} />
          <PeriodChange label="近 30 日" currentValue={currentValue} pastPoint={monthRef} />
        </div>
      </div>

      {summary.by_type.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">資產類別分布</p>
          <div className="flex flex-wrap gap-3">
            {summary.by_type.map((t) => (
              <div key={t.asset_type} className="flex items-center gap-2 text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  {ASSET_TYPE_LABELS[t.asset_type] ?? t.asset_type}
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">NT$ {fmt(t.value_twd)}</span>
                <span className="text-gray-400 dark:text-gray-500">({t.weight_pct.toFixed(1)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
