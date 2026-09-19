import {
  ArrowLeftRight,
  FolderClosed,
  HardDrive,
  Moon,
  Sun,
} from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router"
import { useTheme } from "@/components/theme-provider"
export function AppLayout() {
  const { setTheme } = useTheme()
  const location = useLocation()
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/files">
          <span className="brand-icon">
            <HardDrive size={21} />
          </span>
          LocalShare<span className="brand-dot">.</span>
        </a>
        <div className="nav-caption">工作空间</div>
        <nav>
          <NavLink to="/files">
            <FolderClosed size={19} />
            文件
          </NavLink>
          <NavLink to="/transfer">
            <ArrowLeftRight size={19} />
            互传
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          局域网共享<span>文件留在你的电脑上</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>{location.pathname === "/transfer" ? "互传" : "文件"}</span>
          <div className="topbar-actions">
            <span className="local-label">
              <HardDrive size={15} /> 本地工作空间
            </span>
            <button
              className="icon-button"
              title="切换浅色 / 深色主题"
              aria-label="切换浅色 / 深色主题"
              onClick={() =>
                setTheme(
                  document.documentElement.classList.contains("dark")
                    ? "light"
                    : "dark"
                )
              }
            >
              <Sun className="dark:hidden" size={19} />
              <Moon className="hidden dark:block" size={19} />
            </button>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
