import { getNavLabel, type DashboardTab } from "./dashboard-nav";

interface HostBreadcrumbsProps {
  tab: DashboardTab;
}

export default function HostBreadcrumbs({ tab }: HostBreadcrumbsProps) {
  const section = getNavLabel(tab);

  return (
    <nav className="host-breadcrumbs" aria-label="Fil d'Ariane">
      <ol className="host-breadcrumbs__list">
        <li className="host-breadcrumbs__item">
          <span className="host-breadcrumbs__root">Host</span>
        </li>
        <li className="host-breadcrumbs__sep" aria-hidden>
          /
        </li>
        <li className="host-breadcrumbs__item">
          <span className="host-breadcrumbs__current" aria-current="page">
            {section}
          </span>
        </li>
      </ol>
    </nav>
  );
}
