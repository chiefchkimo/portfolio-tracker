import { Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import Layout from "./components/Layout/Layout";
import DashboardPage from "./pages/DashboardPage";
import HoldingsPage from "./pages/HoldingsPage";
import HistoryPage from "./pages/HistoryPage";
import ChatPage from "./pages/ChatPage";
import StockDetailPage from "./pages/StockDetailPage";

export default function App() {
  return (
    <ThemeProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/holdings" element={<HoldingsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/stock/:symbol" element={<StockDetailPage />} />
        </Routes>
      </Layout>
    </ThemeProvider>
  );
}
