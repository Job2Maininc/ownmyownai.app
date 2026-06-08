import type { QuantizationAdvice } from "../types";

interface QuantizationAdviceBannerProps {
  advice: QuantizationAdvice | null;
  loading?: boolean;
}

export default function QuantizationAdviceBanner({
  advice,
  loading,
}: QuantizationAdviceBannerProps) {
  if (loading) {
    return (
      <p className="quant-advice quant-advice--loading muted" role="status">
        Analyse RAM / disque…
      </p>
    );
  }

  if (!advice) return null;

  return (
    <div
      className={`quant-advice quant-advice--${advice.quantization}`}
      role="status"
      aria-live="polite"
    >
      <strong className="quant-advice__tag">{advice.ollamaTag}</strong>
      <span className="quant-advice__message">{advice.message}</span>
      <span className="quant-advice__reason muted">{advice.reason}</span>
    </div>
  );
}
