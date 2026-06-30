import type { ReactNode } from "react";

interface HelpDocumentProps {
  title: string;
  updatedAt: string;
  children: ReactNode;
}

export function HelpDocument({ title, updatedAt, children }: HelpDocumentProps) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      <header className="mb-10 animate-fade-up">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[var(--link)]">
          Aide
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">Dernière mise à jour : {updatedAt}</p>
      </header>
      <div className="legal-prose animate-fade-up" style={{ animationDelay: "80ms" }}>
        {children}
      </div>
    </article>
  );
}
