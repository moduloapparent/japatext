import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export function NavShell({ children, apiKeyConfigured }: { children: ReactNode; apiKeyConfigured: boolean }) {
  return (
    <div className="shell">
      <aside className="shell-nav">
        <div className="brand">
          <span className="brand-mark">言</span>
          <span className="brand-name">Japatext</span>
        </div>
        <nav aria-label="メインメニュー">
          <NavLink to="/chats" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <span className="nav-icon" aria-hidden>
              💬
            </span>
            チャット
          </NavLink>
          <NavLink to="/mail" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <span className="nav-icon" aria-hidden>
              ✉️
            </span>
            メール
          </NavLink>
          <NavLink to="/notes" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <span className="nav-icon" aria-hidden>
              📝
            </span>
            ノート
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <span className="nav-icon" aria-hidden>
              ⚙️
            </span>
            設定
          </NavLink>
        </nav>
        {!apiKeyConfigured && (
          <div className="nav-warning">
            返信の準備ができていません。設定を確認してください。
          </div>
        )}
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
