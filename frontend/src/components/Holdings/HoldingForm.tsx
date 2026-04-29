import { useEffect, useState } from "react";
import axios from "axios";
import type { AssetType, Holding, HoldingCreate } from "../../types";
import { ASSET_TYPE_CURRENCY, ASSET_TYPE_LABELS } from "../../types";

interface Props {
  initial?: Holding;
  onSave: (data: HoldingCreate) => Promise<void>;
  onCancel: () => void;
}

const ASSET_TYPES: AssetType[] = ["tw_stock", "us_stock", "tw_etf", "us_etf", "tw_fund", "crypto", "commodity"];

export default function HoldingForm({ initial, onSave, onCancel }: Props) {
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [assetType, setAssetType] = useState<AssetType>(initial?.asset_type ?? "tw_stock");
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? "");
  const [cost, setCost] = useState(initial?.cost_per_unit?.toString() ?? "");
  const [currency, setCurrency] = useState<"TWD" | "USD">(initial?.currency ?? "TWD");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    setCurrency(ASSET_TYPE_CURRENCY[assetType]);
  }, [assetType]);

  async function lookupName() {
    if (!symbol.trim() || name) return;
    setLookingUp(true);
    try {
      const res = await axios.get(`/api/prices/lookup?symbol=${encodeURIComponent(symbol.trim())}`);
      if (res.data?.name) setName(res.data.name);
    } catch {
      // ignore
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol || !name || !quantity || !cost) return;
    setSaving(true);
    try {
      await onSave({
        symbol: symbol.trim().toUpperCase(),
        name: name.trim(),
        asset_type: assetType,
        quantity: parseFloat(quantity),
        cost_per_unit: parseFloat(cost),
        currency,
        notes: notes.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">
          {initial ? "編輯持股" : "新增持股"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Symbol（股票/基金代碼）
            </label>
            <input
              className={inputCls + " uppercase"}
              placeholder={
                assetType === "crypto" ? "例：BTC-USD / ETH-USD" :
                assetType === "commodity" ? "例：GC=F（黃金）/ SI=F（白銀）/ CL=F（原油）" :
                "例：2330.TW / AAPL / VOO"
              }
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onBlur={lookupName}
              disabled={!!initial}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              名稱
              {lookingUp && <span className="ml-2 text-xs text-gray-400">查詢中...</span>}
            </label>
            <input
              className={inputCls}
              placeholder="顯示名稱"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">資產類型</label>
            <select
              className={inputCls}
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSET_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">持有數量</label>
              <input
                type="number" min="0" step="any"
                className={inputCls}
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                平均成本（{currency}/單位）
              </label>
              <input
                type="number" min="0" step="any"
                className={inputCls}
                placeholder="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">計價幣別</label>
            <div className="flex gap-4">
              {(["TWD", "USD"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
                  <input
                    type="radio" value={c}
                    checked={currency === c}
                    onChange={() => setCurrency(c)}
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">備注（券商 / 平台）</label>
            <input
              className={inputCls}
              placeholder="例：永豐金、富途、Coinbase"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "儲存中..." : "儲存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
