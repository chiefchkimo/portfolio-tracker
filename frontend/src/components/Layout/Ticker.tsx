import { useEffect, useRef } from "react";
import { usePortfolioStore } from "../../store/usePortfolioStore";

function TickerItem({ symbol, name, price, currency, pnl }: {
  symbol: string;
  name: string;
  price: number | null;
  currency: string | null;
  pnl: number | null;
}) {
  const up = pnl !== null && pnl >= 0;
  const down = pnl !== null && pnl < 0;

  return (
    <span className="inline-flex items-center gap-1.5 px-5 border-r border-white/10 whitespace-nowrap">
      <span className="font-semibold text-white text-xs tracking-wide">
        {name || symbol}
      </span>
      <span className="text-gray-500 text-xs font-mono">
        {symbol}
      </span>
      {price !== null && (
        <span className="text-gray-300 text-xs">
          {currency === "USD" ? "$" : "NT$"}
          {price >= 1000
            ? price.toLocaleString("en-US", { maximumFractionDigits: 0 })
            : price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </span>
      )}
      {pnl !== null && (
        <span
          className="text-xs font-bold"
          style={{ color: up ? "#4ade80" : down ? "#f87171" : "#9ca3af" }}
        >
          {up ? "▲" : "▼"} {Math.abs(pnl).toFixed(2)}%
        </span>
      )}
    </span>
  );
}

export default function Ticker() {
  const { holdings, fetchHoldings } = usePortfolioStore();
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!holdings.length) fetchHoldings();
  }, []);

  if (!holdings.length) return null;

  // Duplicate items for seamless loop
  const items = [...holdings, ...holdings];

  return (
    <div className="bg-gray-950 border-b border-white/10 overflow-hidden relative h-8 flex items-center">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to right, #030712, transparent)" }} />
      <div className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to left, #030712, transparent)" }} />

      <div
        ref={trackRef}
        className="flex items-center animate-ticker"
        style={{ animationDuration: `${Math.max(20, holdings.length * 5)}s` }}
      >
        {items.map((h, i) => (
          <TickerItem
            key={`${h.id}-${i}`}
            symbol={h.symbol}
            name={h.name}
            price={h.current_price}
            currency={h.price_currency}
            pnl={h.pnl_pct}
          />
        ))}
      </div>

      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
