import { useState } from "react";
import type { Holding } from "../../types";

interface TileData {
  id: number;
  symbol: string;
  name: string;
  value: number;
  pnl_pct: number | null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LayoutTile extends TileData, Rect {}

// Row-based treemap layout
function tileLayout(items: TileData[], totalW: number, totalH: number): LayoutTile[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const totalValue = sorted.reduce((s, i) => s + i.value, 0);
  if (totalValue === 0) return [];

  // Determine target number of rows based on aspect ratio
  const targetRows = Math.max(1, Math.round(Math.sqrt((sorted.length * totalH) / totalW)));
  const targetRowValue = totalValue / targetRows;

  const rows: TileData[][] = [];
  let currentRow: TileData[] = [];
  let currentRowValue = 0;

  for (const item of sorted) {
    if (
      currentRow.length > 0 &&
      currentRowValue + item.value / 2 > targetRowValue &&
      rows.length < targetRows - 1
    ) {
      rows.push(currentRow);
      currentRow = [item];
      currentRowValue = item.value;
    } else {
      currentRow.push(item);
      currentRowValue += item.value;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const result: LayoutTile[] = [];
  let y = 0;

  for (const row of rows) {
    const rowValue = row.reduce((s, i) => s + i.value, 0);
    const rowH = (rowValue / totalValue) * totalH;
    let x = 0;

    for (const item of row) {
      const itemW = (item.value / rowValue) * totalW;
      result.push({ ...item, x, y, w: itemW, h: rowH });
      x += itemW;
    }
    y += rowH;
  }
  return result;
}

// Map pnl_pct to color
function pnlColor(pct: number | null): string {
  if (pct === null) return "#6b7280"; // gray
  const clamped = Math.max(-15, Math.min(15, pct));
  if (clamped >= 0) {
    // 0 → #d1fae5, +15 → #15803d
    const t = clamped / 15;
    const r = Math.round(209 - t * (209 - 21));
    const g = Math.round(250 - t * (250 - 128));
    const b = Math.round(229 - t * (229 - 61));
    return `rgb(${r},${g},${b})`;
  } else {
    // 0 → #fee2e2, -15 → #991b1b
    const t = (-clamped) / 15;
    const r = Math.round(254 - t * (254 - 153));
    const g = Math.round(226 - t * (226 - 27));
    const b = Math.round(226 - t * (226 - 27));
    return `rgb(${r},${g},${b})`;
  }
}

function textColor(pct: number | null): string {
  if (pct === null) return "#f9fafb";
  return Math.abs(pct) > 5 ? "#ffffff" : "#111827";
}

interface Props {
  holdings: Holding[];
}

export default function PnlHeatmap({ holdings }: Props) {
  const [tooltip, setTooltip] = useState<{ tile: LayoutTile; mx: number; my: number } | null>(null);

  const W = 500;
  const H = 300;

  const tiles: TileData[] = holdings
    .filter((h) => h.value_twd != null && h.value_twd > 0)
    .map((h) => ({
      id: h.id,
      symbol: h.symbol,
      name: h.name,
      value: h.value_twd!,
      pnl_pct: h.pnl_pct,
    }));

  const layout = tileLayout(tiles, W, H);

  if (layout.length === 0) {
    return <div className="flex items-center justify-center h-40 text-gray-400 text-sm">尚無持倉資料</div>;
  }

  function fmt(n: number) {
    return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n);
  }

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl overflow-hidden"
        onMouseLeave={() => setTooltip(null)}
      >
        {layout.map((tile) => {
          const bg = pnlColor(tile.pnl_pct);
          const fg = textColor(tile.pnl_pct);
          const pad = 4;
          const showName = tile.w > 60 && tile.h > 36;
          const showPnl = tile.h > 22;

          return (
            <g
              key={tile.id}
              onMouseMove={(e) => {
                const svgEl = (e.target as SVGElement).closest("svg")!;
                const rect = svgEl.getBoundingClientRect();
                setTooltip({
                  tile,
                  mx: e.clientX - rect.left,
                  my: e.clientY - rect.top,
                });
              }}
              style={{ cursor: "default" }}
            >
              <rect
                x={tile.x + 1}
                y={tile.y + 1}
                width={tile.w - 2}
                height={tile.h - 2}
                fill={bg}
                rx={4}
              />
              {showName && (
                <text
                  x={tile.x + pad + 2}
                  y={tile.y + pad + 12}
                  fontSize={Math.min(12, tile.w / 5)}
                  fill={fg}
                  fontWeight="600"
                  dominantBaseline="auto"
                >
                  {tile.w > 80 ? tile.name : tile.symbol}
                </text>
              )}
              {showPnl && tile.pnl_pct !== null && (
                <text
                  x={tile.x + pad + 2}
                  y={tile.y + tile.h - pad - 4}
                  fontSize={Math.min(11, tile.w / 6)}
                  fill={fg}
                  opacity={0.9}
                >
                  {tile.pnl_pct >= 0 ? "+" : ""}{tile.pnl_pct.toFixed(2)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 pointer-events-none shadow-xl"
          style={{
            left: tooltip.mx + 12,
            top: tooltip.my - 8,
            transform: tooltip.mx > W * 0.6 ? "translateX(-110%)" : undefined,
          }}
        >
          <p className="font-semibold">{tooltip.tile.name}</p>
          <p className="text-gray-300">{tooltip.tile.symbol}</p>
          <p className="mt-1">市值：NT$ {fmt(tooltip.tile.value)}</p>
          <p>
            損益：
            <span className={tooltip.tile.pnl_pct != null && tooltip.tile.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}>
              {tooltip.tile.pnl_pct != null
                ? `${tooltip.tile.pnl_pct >= 0 ? "+" : ""}${tooltip.tile.pnl_pct.toFixed(2)}%`
                : "—"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
