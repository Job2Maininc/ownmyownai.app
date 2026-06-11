export interface UserError {
  message: string;
  actionLabel?: string;
  actionHref?: string;
}

type ErrorLike = {
  message?: string;
  code?: string;
};

const API_ERROR_MESSAGES: Record<string, UserError> = {
  unauthorized: {
    message: "Vous devez être connecté pour continuer.",
    actionLabel: "Se connecter",
    actionHref: "/login",
  },
  not_authenticated: {
    message: "Votre session a expiré. Reconnectez-vous pour continuer.",
    actionLabel: "Se connecter",
    actionHref: "/login",
  },
  pairing_rate_limited: {
    message: "Trop de codes générés récemment. Attendez une minute avant de réessayer.",
  },
  host_not_found: {
    message: "Ce PC n'est plus disponible. Vérifiez qu'il est bien lié depuis le dashboard.",
    actionLabel: "Voir mes PCs",
    actionHref: "/dashboard",
  },
};

const MESSAGE_PATTERNS: { pattern: RegExp; error: UserError }[] = [
  {
    pattern: /unauthorized|not authenticated|jwt/i,
    error: API_ERROR_MESSAGES.unauthorized,
  },
  {
    pattern: /network|fetch failed|failed to fetch/i,
    error: {
      message: "Connexion impossible. Vérifiez votre réseau et réessayez.",
    },
  },
  {
    pattern: /rate limit/i,
    error: API_ERROR_MESSAGES.pairing_rate_limited,
  },
  {
    pattern: /request failed/i,
    error: {
      message: "Le service est temporairement indisponible. Réessayez dans quelques instants.",
    },
  },
];

export function formatApiError(error: unknown): UserError {
  if (typeof error === "object" && error !== null) {
    const err = error as ErrorLike;
    if (err.code && API_ERROR_MESSAGES[err.code]) {
      return API_ERROR_MESSAGES[err.code];
    }
    const message = err.message ?? "";
    for (const { pattern, error: mapped } of MESSAGE_PATTERNS) {
      if (pattern.test(message)) return mapped;
    }
    if (message && !looksTechnical(message)) {
      return { message };
    }
  }

  if (error instanceof Error && error.message && !looksTechnical(error.message)) {
    return { message: error.message };
  }

  return {
    message: "Une erreur est survenue. Réessayez dans quelques instants.",
  };
}

export function formatDownloadError(code?: string | null): UserError {
  switch (code) {
    case "zip_unavailable":
    case "installer_unavailable":
      return {
        message:
          "Le téléchargement n'est pas encore disponible. Réessayez dans quelques minutes ou contactez le support.",
        actionLabel: "Réessayer",
        actionHref: "/download",
      };
    case "network":
      return {
        message: "Connexion interrompue pendant le téléchargement. Vérifiez votre réseau et réessayez.",
        actionLabel: "Réessayer",
        actionHref: "/download",
      };
    default:
      if (code) {
        return {
          message:
            "Le fichier n'a pas pu être téléchargé. Réessayez ou utilisez l'autre format (installateur / ZIP).",
          actionLabel: "Réessayer",
          actionHref: "/download",
        };
      }
      return {
        message:
          "Le téléchargement a échoué. Réessayez dans quelques instants ou utilisez l'autre format proposé.",
        actionLabel: "Réessayer",
        actionHref: "/download",
      };
  }
}

export function formatRelayError(message: string): UserError {
  if (message.includes("déjà utilisé") || message.includes("autre session de chat")) {
    return {
      message:
        "Une autre fenêtre de chat utilise déjà ce PC. Fermez l'autre session ou rafraîchissez la page.",
      actionLabel: "Rafraîchir",
    };
  }

  if (/obsolète|outdated|v0\.2/i.test(message)) {
    return {
      message:
        "Votre Host doit être mis à jour. Ouvrez l'onglet Mises à jour dans l'app ou retéléchargez la dernière version.",
      actionLabel: "Télécharger",
      actionHref: "/download",
    };
  }

  if (/relay|connexion|connect/i.test(message)) {
    return {
      message:
        "Impossible de joindre votre PC. Vérifiez que l'app Host est ouverte et que votre PC est en ligne.",
      actionLabel: "Voir mes PCs",
      actionHref: "/dashboard",
    };
  }

  if (!looksTechnical(message)) {
    return { message };
  }

  return {
    message:
      "La communication avec votre PC a échoué. Vérifiez que l'app Host est ouverte, puis réessayez.",
    actionLabel: "Voir mes PCs",
    actionHref: "/dashboard",
  };
}

function looksTechnical(message: string): boolean {
  return /^(Error:|HTTP \d|ECONN|ETIMED|fetch|JSON|TypeError|undefined|null)/i.test(
    message.trim(),
  );
}
