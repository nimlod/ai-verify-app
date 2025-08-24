import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";

export default function App() {
  const loc = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-bold">
            AI Verify
          </Link>
          <nav className="flex gap-3 text-sm">
            <Link
              to="/dashboard"
              className={loc.pathname.startsWith("/dashboard") ? "font-semibold" : ""}
            >
              Dashboard
            </Link>
            <Link
              to="/public"
              className={loc.pathname.startsWith("/public") ? "font-semibold" : ""}
            >
              Public Check
            </Link>
            <Link
              to="/signup"
              className={loc.pathname.startsWith("/signup") ? "font-semibold" : ""}
            >
              Sign Up
            </Link>
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="text-gray-500"
            >
              Supabase
            </a>
          </nav>
        </div>
      </header>

      {/* 子ルートをここに描画 */}
      <main className="flex-1 max-w-6xl mx-auto p-4">
        <Outlet />
      </main>

      <footer className="text-center text-xs text-gray-500 py-6">
        © AI Verify Demo
      </footer>
    </div>
  );
}
