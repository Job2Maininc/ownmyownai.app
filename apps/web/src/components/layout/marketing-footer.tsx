import Link from "next/link";

const legalLinks = [
  { href: "/legal/terms", label: "CGU" },
  { href: "/legal/privacy", label: "Confidentialité" },
  { href: "/legal/cookies", label: "Cookies" },
] as const;

const navLinks = [
  { href: "/help", label: "Guide Host" },
  { href: "/cursor", label: "Cursor" },
  { href: "/pricing", label: "Tarifs" },
  { href: "/download", label: "Télécharger" },
  { href: "/login", label: "Connexion" },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <p className="font-semibold text-[var(--foreground)]">OwnMyOwnAI</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Votre IA reste chez vous — locale, privée, sous votre contrôle.
            </p>
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
              <span>Données locales</span>
              <span aria-hidden>·</span>
              <span>100 % gratuit (bêta)</span>
              <span aria-hidden>·</span>
              <span>Sans abonnement</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-10 text-sm">
            <div>
              <p className="mb-3 font-medium text-[var(--foreground)]">Produit</p>
              <ul className="space-y-2">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 font-medium text-[var(--foreground)]">Légal</p>
              <ul className="space-y-2">
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-10 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted)]">
          © {new Date().getFullYear()} OwnMyOwnAI. Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
