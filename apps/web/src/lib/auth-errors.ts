type AuthErrorLike = {
  message: string;
  code?: string;
  status?: number;
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  over_email_send_rate_limit:
    "Limite d'envoi d'emails atteinte. Attendez environ une heure avant de réessayer, ou consultez votre boîte mail si un lien a déjà été envoyé.",
  email_not_confirmed:
    "Adresse email non confirmée. Vérifiez votre boîte mail.",
  invalid_credentials: "Email ou mot de passe incorrect.",
  user_already_exists: "Un compte existe déjà avec cette adresse email.",
  signup_disabled: "Les inscriptions sont désactivées pour le moment.",
  otp_expired: "Le lien ou le code a expiré. Demandez-en un nouveau.",
  validation_failed: "Adresse email invalide.",
};

const MESSAGE_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /rate limit/i,
    message: AUTH_ERROR_MESSAGES.over_email_send_rate_limit,
  },
  {
    pattern: /invalid.*email|email.*invalid/i,
    message: "Adresse email invalide.",
  },
  {
    pattern: /expired|invalid.*token/i,
    message: AUTH_ERROR_MESSAGES.otp_expired,
  },
];

export function formatAuthError(error: AuthErrorLike): string {
  if (error.code && AUTH_ERROR_MESSAGES[error.code]) {
    return AUTH_ERROR_MESSAGES[error.code];
  }

  for (const { pattern, message } of MESSAGE_PATTERNS) {
    if (pattern.test(error.message)) {
      return message;
    }
  }

  return "Une erreur est survenue. Réessayez dans quelques instants.";
}
