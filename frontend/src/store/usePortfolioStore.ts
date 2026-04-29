import { create } from "zustand";
import { holdingsApi, portfolioApi, pricesApi } from "../api/client";
import type { AllocationItem, HistoryPoint, Holding, Summary } from "../types";

interface PortfolioStore {
  holdings: Holding[];
  summary: Summary | null;
  allocation: AllocationItem[];
  history: HistoryPoint[];
  historyDays: number;
  loading: boolean;
  refreshing: boolean;
  lastRefreshed: Date | null;
  error: string | null;

  fetchHoldings: () => Promise<void>;
  fetchSummary: () => Promise<void>;
  fetchAllocation: () => Promise<void>;
  fetchHistory: (days?: number) => Promise<void>;
  setHistoryDays: (days: number) => void;
  refreshPrices: () => Promise<void>;
  backfill: () => Promise<void>;
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  holdings: [],
  summary: null,
  allocation: [],
  history: [],
  historyDays: 365,
  loading: false,
  refreshing: false,
  lastRefreshed: null,
  error: null,

  fetchHoldings: async () => {
    set({ loading: true, error: null });
    try {
      const holdings = await holdingsApi.list();
      set({ holdings });
    } catch {
      set({ error: "無法載入持股資料" });
    } finally {
      set({ loading: false });
    }
  },

  fetchSummary: async () => {
    try {
      const summary = await portfolioApi.summary();
      set({ summary });
    } catch {
      set({ error: "無法載入總覽資料" });
    }
  },

  fetchAllocation: async () => {
    try {
      const allocation = await portfolioApi.allocation();
      set({ allocation });
    } catch {
      set({ error: "無法載入配置資料" });
    }
  },

  fetchHistory: async (days?: number) => {
    const d = days ?? get().historyDays;
    try {
      const history = await portfolioApi.history(d);
      set({ history });
    } catch {
      set({ error: "無法載入歷史資料" });
    }
  },

  setHistoryDays: (days: number) => {
    set({ historyDays: days });
    get().fetchHistory(days);
  },

  refreshPrices: async () => {
    set({ refreshing: true, error: null });
    try {
      await pricesApi.refresh();
      set({ lastRefreshed: new Date() });
      await Promise.all([get().fetchHoldings(), get().fetchSummary(), get().fetchAllocation()]);
    } catch {
      set({ error: "價格更新失敗" });
    } finally {
      set({ refreshing: false });
    }
  },

  backfill: async () => {
    set({ loading: true });
    try {
      await portfolioApi.backfill();
      await get().fetchHistory();
    } catch {
      set({ error: "歷史回填失敗" });
    } finally {
      set({ loading: false });
    }
  },
}));
