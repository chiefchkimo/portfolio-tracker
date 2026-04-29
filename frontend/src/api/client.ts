import axios from "axios";
import type {
  AllocationItem,
  HistoryPoint,
  Holding,
  HoldingCreate,
  HoldingUpdate,
  PortfolioNewsItem,
  RefreshResult,
  StockDetail,
  Summary,
} from "../types";

const api = axios.create({ baseURL: "/api" });

export const holdingsApi = {
  list: () => api.get<Holding[]>("/holdings").then((r) => r.data),
  create: (body: HoldingCreate) => api.post<Holding>("/holdings", body).then((r) => r.data),
  update: (id: number, body: HoldingUpdate) =>
    api.put<Holding>(`/holdings/${id}`, body).then((r) => r.data),
  delete: (id: number) => api.delete(`/holdings/${id}`),
  setNav: (id: number, price: number) =>
    api.post<Holding>(`/holdings/${id}/nav`, { price }).then((r) => r.data),
};

export const pricesApi = {
  refresh: () => api.post<RefreshResult>("/prices/refresh").then((r) => r.data),
  refreshNames: () => api.post("/prices/refresh-names").then((r) => r.data),
};

export interface StockAnalysisRecord {
  id: number;
  symbol: string;
  analysis: string;
  created_at: string;
}

export const stocksApi = {
  detail: (symbol: string, assetType: string, period = "1y") =>
    api
      .get<StockDetail>(`/stocks/${encodeURIComponent(symbol)}`, {
        params: { period, asset_type: assetType },
      })
      .then((r) => r.data),
  analyze: (symbol: string, assetType: string) =>
    api
      .post<StockAnalysisRecord>(`/stocks/${encodeURIComponent(symbol)}/analyze`, null, {
        params: { asset_type: assetType },
      })
      .then((r) => r.data),
  listAnalyses: (symbol: string) =>
    api.get<StockAnalysisRecord[]>(`/stocks/${encodeURIComponent(symbol)}/analyses`).then((r) => r.data),
};

export interface AnalysisRecord {
  id: number;
  analysis: string;
  created_at: string;
}

export const chatApi = {
  send: (messages: { role: string; content: string }[]) =>
    api.post<{ response: string }>("/chat", { messages }).then((r) => r.data.response),
  analyze: () =>
    api.post<AnalysisRecord>("/chat/analyze").then((r) => r.data),
  listAnalyses: () =>
    api.get<AnalysisRecord[]>("/chat/analyze").then((r) => r.data),
};

export const portfolioApi = {
  summary: () => api.get<Summary>("/portfolio/summary").then((r) => r.data),
  allocation: () => api.get<AllocationItem[]>("/portfolio/allocation").then((r) => r.data),
  history: (days: number) =>
    api.get<HistoryPoint[]>("/portfolio/history", { params: { days } }).then((r) => r.data),
  backfill: () => api.post("/portfolio/backfill").then((r) => r.data),
  snapshot: () => api.post("/portfolio/snapshot").then((r) => r.data),
  news: () => api.get<PortfolioNewsItem[]>("/portfolio/news").then((r) => r.data),
};
