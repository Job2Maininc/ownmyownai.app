interface FaqItem {
  question: string;
  answer: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
  title?: string;
  subtitle?: string;
}

export function FaqAccordion({
  items,
  title = "Questions fréquentes",
  subtitle,
}: FaqAccordionProps) {
  return (
    <section className="px-6 py-16 md:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="section-header mb-8 text-center">
          <p className="section-eyebrow">FAQ</p>
          <h2 className="section-title">{title}</h2>
          {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
        </div>
        <div className="space-y-3">
          {items.map((item) => (
            <details
              key={item.question}
              className="faq-item group rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-shadow duration-fast open:shadow-xs"
            >
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-[var(--foreground)] marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  {item.question}
                  <span
                    className="shrink-0 text-[var(--muted)] transition-transform duration-fast group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="border-t border-[var(--border)] px-5 py-4 text-sm leading-relaxed text-[var(--muted)]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
