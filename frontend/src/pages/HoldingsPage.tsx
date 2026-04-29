import { useEffect, useState } from "react";
import { holdingsApi, pricesApi } from "../api/client";
import HoldingTable from "../components/Holdings/HoldingTable";
import HoldingForm from "../components/Holdings/HoldingForm";
import { usePortfolioStore } from "../store/usePortfolioStore";
import type { Holding, HoldingCreate } from "../types";

export default function HoldingsPage() {
  const { holdings, loading, error, fetchHoldings, refreshPrices, refreshing } = usePortfolioStore();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [refreshingNames, setRefreshingNames] = useState(false);
  const [brokerFilter, setBrokerFilter] = useState<string>("全部");

  const brokers = ["全部", ...Array.from(
    new Set(holdings.map((h) => h.notes?.trim()).filter(Boolean) as string[])
  ).sort()];

  const filteredHoldings = brokerFilter === "全部"
    ? holdings
    : holdings.filter((h) => h.notes?.trim() === brokerFilter);

  function handleExportCsv() {
    const headers = ["Symbol", "名稱", "類型", "備注", "數量", "成本/股", "幣別", "現價", "市值(TWD)", "損益%"];
    const rows = holdings.map((h) => [
      h.symbol, h.name, h.asset_type, h.notes ?? "", h.quantity, h.cost_per_unit, h.currency,
      h.current_price ?? "", h.value_twd != null ? Math.round(h.value_twd) : "",
      h.pnl_pct != null ? h.pnl_pct.toFixed(2) + "%" : "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRefreshNames() {
    setRefreshingNames(true);
    try {
      await pricesApi.refreshNames();
      await fetchHoldings();
    } finally {
      setRefreshingNames(false);
    }
  }

  useEffect(() => { fetchHoldings(); }, []);

  async function handleSave(data: HoldingCreate) {
    if (editTarget) {
      await holdingsApi.update(editTarget.id, data);
    } else {
      await holdingsApi.create(data);
    }
    setShowForm(false);
    setEditTarget(undefined);
    await fetchHoldings();
  }

  async function handleDelete(id: number) {
    await holdingsApi.delete(id);
    setDeleteConfirm(null);
    await fetchHoldings();
  }

  function openEdit(h: Holding) { setEditTarget(h); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditTarget(undefined); }

  const outlineBtn = "px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors";

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">持股明細</h2>
        <div className="flex gap-2">
          <button onClick={handleExportCsv} className={outlineBtn}>⬇ 匯出 CSV</button>
          <button onClick={handleRefreshNames} disabled={refreshingNames} className={outlineBtn}>
            {refreshingNames ? "更新中..." : "🇹🇼 更新中文名稱"}
          </button>
          <button onClick={refreshPrices} disabled={refreshing} className={outlineBtn}>
            {refreshing ? "更新中..." : "🔄 更新價格"}
          </button>
          <button
            onClick={() => { setEditTarget(undefined); setShowForm(true); }}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 新增持股
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}

      {brokers.length > 2 && (
        <div className="flex flex-wrap gap-2">
          {brokers.map((b) => (
            <button
              key={b}
              onClick={() => setBrokerFilter(b)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                brokerFilter === b
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {b}
              {b !== "全部" && (
                <span className="ml-1.5 text-xs opacity-70">
                  {holdings.filter((h) => h.notes?.trim() === b).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-600 text-sm">載入中...</div>
        ) : (
          <HoldingTable holdings={filteredHoldings} onEdit={openEdit} onDelete={(id) => setDeleteConfirm(id)} onRefresh={fetchHoldings} />
        )}
      </div>

      {showForm && <HoldingForm initial={editTarget} onSave={handleSave} onCancel={closeForm} />}

      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-80 p-6 text-center space-y-4">
            <p className="text-gray-800 dark:text-gray-200 font-medium">確定要刪除這筆持股嗎？</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
