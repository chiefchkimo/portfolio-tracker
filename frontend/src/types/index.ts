export type AssetType = "tw_stock" | "us_stock" | "tw_etf" | "us_etf" | "tw_fund" | "crypto" | "commodity";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  tw_stock: "台灣股票",
  us_stock: "美國股票",
  tw_etf: "台灣ETF",
  us_etf: "美國ETF",
  tw_fund: "台灣共同基金",
  crypto: "加密貨幣",
  commodity: "大宗商品",
};

export const ASSET_TYPE_CURRENCY: Record<AssetType, "TWD" | "USD"> = {
  tw_stock: "TWD",
  us_stock: "USD",
  tw_etf: "TWD",
  us_etf: "USD",
  tw_fund: "TWD",
  crypto: "USD",
  commodity: "TWD",
};

export interface Holding {
  id: number;
  symbol: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  cost_per_unit: number;
  currency: "TWD" | "USD";
  notes: string | null;
  current_price: number | null;
  price_currency: string | null;
  value_twd: number | null;
  cost_twd: number | null;
  pnl_pct: number | null;
  fetched_at: string | null;
}

export interface HoldingCreate {
  symbol: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  cost_per_unit: number;
  currency: "TWD" | "USD";
  notes?: string;
}

export interface HoldingUpdate {
  name?: string;
  asset_type?: AssetType;
  quantity?: number;
  cost_per_unit?: number;
  currency?: "TWD" | "USD";
  notes?: string;
}

export interface RefreshResult {
  refreshed: string[];
  failed: string[];
  usd_twd_rate: number | null;
}

export interface Summary {
  total_value_twd: number;
  total_cost_twd: number;
  pnl_twd: number;
  pnl_pct: number;
  usd_twd_rate: number | null;
  by_type: { asset_type: AssetType; value_twd: number; weight_pct: number }[];
}

export interface AllocationItem {
  symbol: string;
  name: string;
  asset_type: AssetType;
  value_twd: number;
  weight_pct: number;
}

export interface HistoryPoint {
  date: string;
  total_value_twd: number;
  total_cost_twd: number;
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  published_at: string;
}

export interface PortfolioNewsItem extends NewsItem {
  symbol: string;
  name: string;
}

export interface StockPricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface StockDetail {
  symbol: string;
  name: string;
  currency: string;
  current_price: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  high_52w: number | null;
  low_52w: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
  beta: number | null;
  history: StockPricePoint[];
  news: NewsItem[];
}
