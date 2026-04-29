import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Holding } from "../../types";
import { ASSET_TYPE_LABELS } from "../../types";
import { holdingsApi } from "../../api/client";

function fmt(n: number | null, decimals = 0) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(n);
}

function fmtQty(n: number | null) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 3, minimumFractionDigits: 0 }).format(n);
}

function PnlCell({ pct }: { pct: number | null }) {
  if (pct === null) return <td className="px-4 py-3 text-gray-400 dark:text-gray-600">—</td>;
  const color = pct >= 0 ? "text-green-600" : "text-red-600";
  return (
    <td className={`px-4 py-3 text-sm font-medium ${color}`}>
      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
    </td>
  );
}

function NavInputDialog({ holding, onClose, onSaved }: {
  holding: Holding;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const price = parseFloat(value);
    if (!price || price <= 0) return;
    setSaving(true);
    try {
      await holdingsApi.setNav(holding.id, price);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-80 p-6 space-y-4">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">{holding.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">輸入今日基金淨值 (TWD/單位)</p>
        </div>
        <input
          type="number" min="0" step="0.0001" autoFocus
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例：15.32"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        {value && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            市值預估：NT$ {fmt(parseFloat(value) * holding.quantity, 0)}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  holdings: Holding[];
  onEdit: (h: Holding) => void;
  onDelete: (id: number) => void;
  onRefresh: () => void;
}

export default function HoldingTable({ holdings, onEdit, onDelete, onRefresh }: Props) {
  const [navTarget, setNavTarget] = useState<Holding | null>(null);
  const navigate = useNavigate();

  if (!holdings.length) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-600 text-sm">
        尚無持股資料 — 點擊「新增持股」開始
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              {["Symbol", "名稱", "類型", "備注", "數量", "成本/股", "現價", "市值 (TWD)", "損益%", "操作"].map(
                (h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {holdings.map((h) => (
              <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                <td className="px-4 py-3">
                  <button
                    onClick={() => navigate(`/stock/${encodeURIComponent(h.symbol)}?asset_type=${h.asset_type}`)}
                    className="font-mono font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {h.symbol}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{h.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                    {ASSET_TYPE_LABELS[h.asset_type] ?? h.asset_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[120px] truncate" title={h.notes ?? ""}>
                  {h.notes || <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmtQty(h.quantity)}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  {h.currency} {fmt(h.cost_per_unit, 2)}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  {h.current_price !== null ? (
                    <div>
                      <span>{h.price_currency} {fmt(h.current_price, 2)}</span>
                      {h.price_currency !== h.currency && h.value_twd !== null && (
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          ≈ NT$ {fmt(h.value_twd / h.quantity, 0)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-600">未抓取</span>
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                  {h.value_twd !== null ? `NT$ ${fmt(h.value_twd)}` : "—"}
                </td>
                <PnlCell pct={h.pnl_pct} />
                <td className="px-4 py-3">
                  <div className="flex gap-2 items-center">
                    {h.asset_type === "tw_fund" && (
                      <button
                        onClick={() => setNavTarget(h)}
                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap"
                      >
                        輸入淨值
                      </button>
                    )}
                    <button onClick={() => onEdit(h)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      編輯
                    </button>
                    <button onClick={() => onDelete(h.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline">
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {navTarget && (
        <NavInputDialog
          holding={navTarget}
          onClose={() => setNavTarget(null)}
          onSaved={onRefresh}
        />
      )}
    </>
  );
}
