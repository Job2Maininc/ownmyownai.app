import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { QuantizationAdvice } from "../types";

export function useQuantizationAdvice(modelId: string | null): {
  advice: QuantizationAdvice | null;
  loading: boolean;
} {
  const [advice, setAdvice] = useState<QuantizationAdvice | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = modelId?.trim() ?? "";
    if (!trimmed) {
      setAdvice(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(() => {
      void invoke<QuantizationAdvice>("get_quantization_advice", { model: trimmed })
        .then((result) => {
          if (!cancelled) setAdvice(result);
        })
        .catch(() => {
          if (!cancelled) setAdvice(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [modelId]);

  return { advice, loading };
}
