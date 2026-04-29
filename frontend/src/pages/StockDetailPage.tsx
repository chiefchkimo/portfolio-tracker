import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type { StockPricePoint } from "../types";
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { stocksApi } from "../api/client";
import type { StockAnalysisRecord } from "../api/client";
import { usePortfolioStore } from "../store/usePortfolioStore";
import type { StockDetail } from "../types";
import { useTheme } from "../context/ThemeContext";
import { markdownToHtml } from "../utils/markdown";

// ── Indicator calculations ──────────────────────────────────────────

function calcMA(history: StockPricePoint[], period: number): (number | null)[] {
  return history.map((_, i) => {
    if (i < period - 1) return null;
    const sum = history.slice(i - period + 1, i + 1).reduce((s, p) => s + p.close, 0);
    return +(sum / period).toFixed(3);
  });
}

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < values.length; i++) {
    ema.push(i === 0 ? values[0] : values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcMACD(history: StockPricePoint[]) {
  const closes = history.map((p) => p.close);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine, 9);
  return history.map((p, i) => ({
    date: p.date.slice(5),
    macd: +macdLine[i].toFixed(3),
    signal: +signal[i].toFixed(3),
    hist: +(macdLine[i] - signal[i]).toFixed(3),
  }));
}

function calcKD(history: StockPricePoint[], n = 9) {
  let prevK = 50, prevD = 50;
  return history.map((p, i) => {
    const w = history.slice(Math.max(0, i - n + 1), i + 1);
    const lowest = Math.min(...w.map((x) => x.low));
    const highest = Math.max(...w.map((x) => x.high));
    const rsv = highest === lowest ? 50 : ((p.close - lowest) / (highest - lowest)) * 100;
    const k = prevK * (2 / 3) + rsv * (1 / 3);
    const d = prevD * (2 / 3) + k * (1 / 3);
    prevK = k; prevD = d;
    return { date: p.date.slice(5), k: +k.toFixed(2), d: +d.toFixed(2) };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

const PERIODS = [
  { label: "1個月", value: "1mo" },
  { label: "3個月", value: "3mo" },
  { label: "6個月", value: "6mo" },
  { label: "1年", value: "1y" },
  { label: "2年", value: "2y" },
];

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: decimals }).format(n);
}

function fmtMarketCap(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}兆`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}億`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}萬`;
  return fmt(n, 0);
}

const AXIS_STYLE = { fontSize: 11, fill: "#9ca3af" };
const AXIS_PROPS = { tickLine: false, axisLine: false };

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/60 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <span className="flex items-center gap-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1 text-xs text-gray-400">
          <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function StockDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const [searchParams] = useSearchParams();
  const assetType = searchParams.get("asset_type") ?? "us_stock";
  const navigate = useNavigate();
  const { dark } = useTheme();

  const [period, setPeriod] = useState("1y");
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMA, setShowMA] = useState<Record<string, boolean>>({ ma5: true, ma20: true, ma60: false });

  const [stockAnalyses, setStockAnalyses] = useState<StockAnalysisRecord[]>([]);
  const [activeStockAnalysisId, setActiveStockAnalysisId] = useState<number | null>(null);
  const [stockAnalyzing, setStockAnalyzing] = useState(false);
  const [stockAnalysisError, setStockAnalysisError] = useState<string | null>(null);
  const activeStockAnalysis = stockAnalyses.find((a) => a.id === activeStockAnalysisId) ?? stockAnalyses[0] ?? null;

  async function runStockAnalysis() {
    if (!symbol) return;
    setStockAnalyzing(true);
    setStockAnalysisError(null);
    try {
      const record = await stocksApi.analyze(symbol, assetType);
      setStockAnalyses((prev) => [record, ...prev]);
      setActiveStockAnalysisId(record.id);
    } catch {
      setStockAnalysisError("分析失敗，請稍後再試");
    } finally {
      setStockAnalyzing(false);
    }
  }

  const { holdings } = usePortfolioStore();
  const holding = holdings.find((h) => h.symbol === symbol);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    stocksApi.detail(symbol, assetType, period)
      .then(setDetail)
      .catch(() => setError("無法取得資料，請確認 symbol 是否正確"))
      .finally(() => setLoading(false));
  }, [symbol, assetType, period]);

  useEffect(() => {
    if (!symbol) return;
    stocksApi.listAnalyses(symbol).then(setStockAnalyses).catch(() => {});
  }, [symbol]);

  const isUp = (detail?.change ?? 0) >= 0;
  const changeColor = detail?.change == null ? "text-gray-400" : isUp ? "text-green-600" : "text-red-500";
  const lineColor = detail?.change == null ? "#6b7280" : isUp ? "#16a34a" : "#dc2626";
  const prefix = detail?.currency === "TWD" ? "NT$" : "$";
  const costLine = holding?.cost_per_unit ?? null;

  const h = detail?.history ?? [];
  const ma5 = calcMA(h, 5);
  const ma20 = calcMA(h, 20);
  const ma60 = calcMA(h, 60);

  const priceData = h.map((p, i) => ({ date: p.date.slice(5), close: p.close, ma5: ma5[i], ma20: ma20[i], ma60: ma60[i] }));
  const volumeData = h.map((p) => ({ date: p.date.slice(5), volume: p.volume ?? 0, up: p.close >= p.open }));
  const macdData = h.length > 26 ? calcMACD(h) : [];
  const kdData = h.length > 9 ? calcKD(h) : [];

  const prices = h.map((p) => p.close);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const padding = (maxPrice - minPrice) * 0.08 || 1;

  const MA_CONFIG = [
    { key: "ma5", label: "MA5", color: "#f59e0b" },
    { key: "ma20", label: "MA20", color: "#8b5cf6" },
    { key: "ma60", label: "MA60", color: "#06b6d4" },
  ];

  const tooltipStyle = dark
    ? { fontSize: 12, borderRadius: 8, border: "1px solid #374151", backgroundColor: "#1f2937", color: "#f9fafb" }
    : { fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" };

  const card = "bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700";

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1">
        ← 返回
      </button>

      {loading && <div className="text-center py-24 text-gray-400 text-sm">載入中…</div>}
      {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {detail && !loading && (
        <>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{detail.name}</h2>
                <span className="text-sm text-gray-400 font-mono">{detail.symbol}</span>
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {prefix} {fmt(detail.current_price, (detail.current_price ?? 0) >= 100 ? 1 : 2)}
                </span>
                {detail.change !== null && (
                  <span className={`text-base font-semibold ${changeColor}`}>
                    {detail.change >= 0 ? "+" : ""}{fmt(detail.change, 2)} ({detail.change >= 0 ? "+" : ""}{detail.change_pct?.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              {PERIODS.map((p) => (
                <button key={p.value} onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${period === p.value ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price + MA Chart */}
          <div className={`${card} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">價格走勢</span>
              <div className="flex gap-1">
                {MA_CONFIG.map(({ key, label, color }) => (
                  <button key={key}
                    onClick={() => setShowMA((s) => ({ ...s, [key]: !s[key] }))}
                    className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${showMA[key] ? "text-white border-transparent" : "bg-white dark:bg-gray-700 text-gray-400 border-gray-200 dark:border-gray-600"}`}
                    style={showMA[key] ? { backgroundColor: color, borderColor: color } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={priceData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={AXIS_STYLE} {...AXIS_PROPS} interval="preserveStartEnd" />
                <YAxis domain={[minPrice - padding, maxPrice + padding]} tick={AXIS_STYLE} {...AXIS_PROPS}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)} width={45} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: number, name: string) => {
                    const labels: Record<string, string> = { close: "收盤", ma5: "MA5", ma20: "MA20", ma60: "MA60" };
                    return [fmt(v, v >= 100 ? 1 : 2), labels[name] ?? name];
                  }} />
                {costLine !== null && holding?.currency === detail.currency && (
                  <ReferenceLine y={costLine} stroke="#f59e0b" strokeDasharray="4 3"
                    label={{ value: "成本", fontSize: 11, fill: "#f59e0b", position: "right" }} />
                )}
                <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                {showMA.ma5 && <Line type="monotone" dataKey="ma5" stroke="#f59e0b" strokeWidth={1} dot={false} connectNulls />}
                {showMA.ma20 && <Line type="monotone" dataKey="ma20" stroke="#8b5cf6" strokeWidth={1} dot={false} connectNulls />}
                {showMA.ma60 && <Line type="monotone" dataKey="ma60" stroke="#06b6d4" strokeWidth={1} dot={false} connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Volume Chart */}
          {volumeData.some((d) => d.volume > 0) && (
            <div className={`${card} p-4`}>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">成交量</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={volumeData} margin={{ top: 2, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={AXIS_STYLE} {...AXIS_PROPS} interval="preserveStartEnd" />
                  <YAxis tick={AXIS_STYLE} {...AXIS_PROPS} width={45}
                    tickFormatter={(v) => v >= 1e8 ? `${(v / 1e8).toFixed(0)}億` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number) => [v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v.toLocaleString(), "成交量"]} />
                  <Bar dataKey="volume" maxBarSize={6}>
                    {volumeData.map((d, i) => <Cell key={i} fill={d.up ? "#4ade80" : "#f87171"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* MACD Chart */}
          {macdData.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">MACD (12,26,9)</span>
                <Legend items={[{ color: "#3b82f6", label: "MACD" }, { color: "#f97316", label: "Signal" }, { color: "#9ca3af", label: "Histogram" }]} />
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={macdData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={AXIS_STYLE} {...AXIS_PROPS} interval="preserveStartEnd" />
                  <YAxis tick={AXIS_STYLE} {...AXIS_PROPS} width={45} tickFormatter={(v) => v.toFixed(1)} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number, name: string) => {
                      const labels: Record<string, string> = { macd: "MACD", signal: "Signal", hist: "Histogram" };
                      return [v.toFixed(3), labels[name] ?? name];
                    }} />
                  <ReferenceLine y={0} stroke="#4b5563" />
                  <Bar dataKey="hist" maxBarSize={4}>
                    {macdData.map((d, i) => <Cell key={i} fill={d.hist >= 0 ? "#4ade80" : "#f87171"} />)}
                  </Bar>
                  <Line type="monotone" dataKey="macd" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="signal" stroke="#f97316" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* KD Chart */}
          {kdData.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">KD 隨機指標 (9)</span>
                <Legend items={[{ color: "#3b82f6", label: "K" }, { color: "#f97316", label: "D" }]} />
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={kdData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={AXIS_STYLE} {...AXIS_PROPS} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} ticks={[20, 50, 80]} tick={AXIS_STYLE} {...AXIS_PROPS} width={28} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number, name: string) => [`${v.toFixed(1)}`, name.toUpperCase()]} />
                  <ReferenceLine y={80} stroke="#f87171" strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke="#4ade80" strokeDasharray="3 3" />
                  <ReferenceLine y={50} stroke="#4b5563" strokeDasharray="2 2" />
                  <Line type="monotone" dataKey="k" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="d" stroke="#f97316" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                <span className="text-green-500">↑ 超賣區 (&lt;20)</span>
                <span className="text-red-400">↓ 超買區 (&gt;80)</span>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="前收盤價" value={`${prefix} ${fmt(detail.prev_close)}`} />
            <StatCard label="52週高" value={`${prefix} ${fmt(detail.high_52w)}`} />
            <StatCard label="52週低" value={`${prefix} ${fmt(detail.low_52w)}`} />
            <StatCard label="市值" value={fmtMarketCap(detail.market_cap)} />
            <StatCard label="本益比 (P/E)" value={detail.pe_ratio ? fmt(detail.pe_ratio, 1) : "—"} />
            <StatCard label="殖利率" value={detail.dividend_yield ? `${detail.dividend_yield.toFixed(2)}%` : "—"} />
            <StatCard label="Beta" value={detail.beta ? fmt(detail.beta, 2) : "—"} />
            <StatCard label="幣別" value={detail.currency} />
          </div>

          {/* Holding summary */}
          {holding && (
            <div className={`${card} p-5`}>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">我的持倉</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">持有數量</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                    {new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 3 }).format(holding.quantity)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">平均成本</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                    {holding.currency === "USD" ? "$" : "NT$"} {fmt(holding.cost_per_unit)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">市值 (TWD)</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                    {holding.value_twd != null ? `NT$ ${new Intl.NumberFormat("zh-TW").format(Math.round(holding.value_twd))}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">損益</p>
                  <p className={`text-base font-semibold mt-0.5 ${holding.pnl_pct == null ? "text-gray-400" : holding.pnl_pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {holding.pnl_pct != null ? `${holding.pnl_pct >= 0 ? "+" : ""}${holding.pnl_pct.toFixed(2)}%` : "—"}
                  </p>
                </div>
              </div>
              {holding.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">備注：{holding.notes}</p>}
            </div>
          )}

          {/* Stock AI Analysis */}
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI 個股分析</h3>
                {stockAnalyses.length > 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">技術面 + 基本面 + 操作建議 · 由 Gemini 生成</p>
                )}
              </div>
              <button
                onClick={runStockAnalysis}
                disabled={stockAnalyzing}
                className="px-4 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {stockAnalyzing ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    分析中…
                  </>
                ) : "✨ 分析這支股票"}
              </button>
            </div>
            {stockAnalysisError && <p className="text-sm text-red-500 mb-3">{stockAnalysisError}</p>}
            {stockAnalyses.length === 0 && !stockAnalyzing && !stockAnalysisError && (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
                點擊「分析這支股票」，AI 將結合技術指標、基本面與持倉狀況給出操作參考建議
              </p>
            )}
            {stockAnalyses.length > 0 && (
              <>
                <div className="flex gap-2 flex-wrap mb-4">
                  {stockAnalyses.map((a) => {
                    const dt = new Date(a.created_at);
                    const label = dt.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
                    const isActive = (activeStockAnalysisId ?? stockAnalyses[0].id) === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setActiveStockAnalysisId(a.id)}
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
                {activeStockAnalysis && (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold"
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(activeStockAnalysis.analysis) }}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
