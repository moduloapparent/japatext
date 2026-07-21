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
        <nav>
          <NavLink to="/chats" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <span className="nav-icon">💬</span> チャット
          </NavLink>
          <NavLink to="/mail" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <span className="nav-icon">✉️</span> メール
          </NavLink>
          <NavLink to="/notes" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <span className="nav-icon">📝</span> Notes
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <span className="nav-icon">⚙️</span> Settings
          </NavLink>
        </nav>
        {!apiKeyConfigured && (
          <div className="nav-warning">
            APIキー未設定です。<code>server/.env</code> に <code>OPENAI_API_KEY</code> を設定してください。
          </div>
        )}
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
