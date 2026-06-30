import { DASHBOARD_NAV, type DashboardTab } from "./dashboard-nav";

interface HostSidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

export default function HostSidebar({ activeTab, onTabChange }: HostSidebarProps) {
  return (
    <aside className="host-sidebar" aria-label="Navigation Host">
      <nav className="host-sidebar__nav">
        <ul className="host-sidebar__list">
          {DASHBOARD_NAV.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`host-sidebar__link ${
                  activeTab === item.id ? "host-sidebar__link--active" : ""
                }`}
                aria-current={activeTab === item.id ? "page" : undefined}
                onClick={() => onTabChange(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
