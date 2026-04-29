import { useEffect, useState } from "react";
import { usePortfolioStore } from "../store/usePortfolioStore";
import SummaryCards from "../components/Summary/SummaryCards";
import AllocationPie from "../components/Charts/AllocationPie";
import ValueTrendLine from "../components/Charts/ValueTrendLine";
import PnlHeatmap from "../components/Charts/PnlHeatmap";
import { portfolioApi, chatApi } from "../api/client";
import type { AnalysisRecord } from "../api/client";
import type { PortfolioNewsItem } from "../types";
import { markdownToHtml } from "../utils/markdown";

// card shorthand
const card = "bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700";

export default function DashboardPage() {
  const {
    summary, allocation, history, historyDays, holdings,
    loading, refreshing, lastRefreshed, error,
    fetchSummary, fetchAllocation, fetchHistory, fetchHoldings,
    setHistoryDays, refreshPrices, backfill,
  } = usePortfolioStore();

  const [news, setNews] = useState<PortfolioNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [activeAnalysisId, setActiveAnalysisId] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const activeAnalysis = analyses.find((a) => a.id === activeAnalysisId) ?? analyses[0] ?? null;

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const record = await chatApi.analyze();
      setAnalyses((prev) => [record, ...prev]);
      setActiveAnalysisId(record.id);
    } catch {
      setAnalysisError("分析失敗，請稍後再試");
    } finally {
      setAnalyzing(false);
    }
  }

  function timeAgo(isoStr: string) {
    if (!isoStr) return "";
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    return `${Math.floor(diff / 86400)} 天前`;
  }

  useEffect(() => {
    fetchSummary();
    fetchAllocation();
    fetchHistory();
    if (!holdings.length) fetchHoldings();
    setNewsLoading(true);
    portfolioApi.news().then(setNews).finally(() => setNewsLoading(false));
    chatApi.listAnalyses().then(setAnalyses).catch(() => {});
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">投資組合總覽</h2>
        <div className="flex gap-2">
          <button
            onClick={backfill}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "回填中..." : "回填歷史"}
          </button>
          <button
            onClick={refreshPrices}
            disabled={refreshing}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {refreshing ? "更新中..." : "🔄 更新價格"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}

      {/* AI Analysis */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">AI 投資組合分析</h3>
            {analyses.length > 0 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">由 Gemini 生成，僅供參考</p>}
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="px-4 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {analyzing ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                分析中…
              </>
            ) : "✨ 開始分析"}
          </button>
        </div>
        {analysisError && <p className="text-sm text-red-500 mb-3">{analysisError}</p>}
        {analyses.length === 0 && !analyzing && !analysisError && (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">點擊「開始分析」，AI 將根據您目前的持倉資料產生狀況分析報告</p>
        )}
        {analyses.length > 0 && (
          <>
            <div className="flex gap-2 flex-wrap mb-4">
              {analyses.map((a) => {
                const dt = new Date(a.created_at);
                const label = dt.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
                const isActive = (activeAnalysisId ?? analyses[0].id) === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setActiveAnalysisId(a.id)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      isActive
                        ? "bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300 font-medium"
                        : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {activeAnalysis && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(activeAnalysis.analysis) }}
              />
            )}
          </>
        )}
      </div>

      {summary ? (
        <SummaryCards summary={summary} lastRefreshed={lastRefreshed} history={history} />
      ) : (
        <div className="text-gray-400 text-sm">載入中...</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${card} p-5`}>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">持倉配置 Allocation</h3>
          <AllocationPie data={allocation} />
        </div>
        <div className={`${card} p-5`}>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">損益熱力圖 P&amp;L Map</h3>
          <PnlHeatmap holdings={holdings} />
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">資產淨值走勢 Trend</h3>
        <ValueTrendLine data={history} days={historyDays} onDaysChange={setHistoryDays} />
      </div>

      {/* Portfolio News */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">持股相關新聞</h3>
        {newsLoading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">載入新聞中…</p>
        ) : news.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">暫無新聞</p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {news.map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                className="flex gap-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2 -mx-2 transition-colors">
                <span className="shrink-0 mt-0.5 px-1.5 py-0.5 text-xs font-mono bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded h-fit">
                  {n.symbol.replace(".TW", "").replace("-USD", "")}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">{n.title}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {n.publisher}{n.publisher && n.published_at ? " · " : ""}{timeAgo(n.published_at)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
