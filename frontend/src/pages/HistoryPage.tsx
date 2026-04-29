import { useEffect } from "react";
import dayjs from "dayjs";
import ValueTrendLine from "../components/Charts/ValueTrendLine";
import { usePortfolioStore } from "../store/usePortfolioStore";

function fmt(n: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n);
}

const card = "bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700";

export default function HistoryPage() {
  const { history, historyDays, loading, backfill, fetchHistory, setHistoryDays } = usePortfolioStore();

  useEffect(() => { fetchHistory(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">歷史記錄</h2>
        <button
          onClick={backfill}
          disabled={loading}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "回填中..." : "回填過去1年歷史"}
        </button>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">資產淨值走勢 Trend</h3>
        <ValueTrendLine data={history} days={historyDays} onDaysChange={setHistoryDays} />
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">每日快照資料</p>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-600 text-sm">尚無歷史資料</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  {["日期", "市值 (NT$)", "成本 (NT$)", "損益 (NT$)", "損益%"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {[...history].reverse().map((row) => {
                  const pnl = row.total_value_twd - row.total_cost_twd;
                  const pnlPct = row.total_cost_twd > 0 ? (pnl / row.total_cost_twd) * 100 : 0;
                  const color = pnl >= 0 ? "text-green-600" : "text-red-600";
                  return (
                    <tr key={row.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{dayjs(row.date).format("YYYY/MM/DD")}</td>
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{fmt(row.total_value_twd)}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{fmt(row.total_cost_twd)}</td>
                      <td className={`px-5 py-3 font-medium ${color}`}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</td>
                      <td className={`px-5 py-3 font-medium ${color}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
