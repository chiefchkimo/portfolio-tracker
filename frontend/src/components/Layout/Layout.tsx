import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import Ticker from "./Ticker";
import { useTheme } from "../../context/ThemeContext";

const nav = [
  { to: "/", label: "總覽", icon: "📊" },
  { to: "/holdings", label: "持股明細", icon: "📋" },
  { to: "/history", label: "歷史記錄", icon: "📈" },
  { to: "/chat", label: "AI 顧問", icon: "🤖" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { dark, toggle } = useTheme();

  return (
    <div className="min-h-screen flex flex-col">
      <Ticker />
      <div className="flex flex-1">
        <aside className="w-52 bg-gray-900 text-gray-100 flex flex-col py-6 shrink-0">
          <div className="px-5 mb-8">
            <h1 className="text-lg font-bold tracking-wide">💰 財務工具</h1>
            <p className="text-xs text-gray-400 mt-1">投資組合追蹤</p>
          </div>
          <nav className="flex flex-col gap-1 px-3 flex-1">
            {nav.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`
                }
              >
                <span>{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="px-5 pt-4 border-t border-gray-800">
            <button
              onClick={toggle}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              aria-label="切換深色模式"
            >
              <span className="text-base">{dark ? "☀️" : "🌙"}</span>
              <span>{dark ? "淺色模式" : "深色模式"}</span>
            </button>
          </div>
        </aside>
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">{children}</main>
      </div>
    </div>
  );
}
