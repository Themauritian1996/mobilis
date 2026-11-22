/** Erreurs applicatives typées : `code` stable (journalisation, i18n), `cause` d'origine conservée. */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
  }
}

/** Port non encore branché (adaptateur prévu dans une tranche de migration). */
export class NotImplementedError extends AppError {
  constructor(what: string) {
    super('not_implemented', `${what} : pas encore implémenté (voir docs/MIGRATION.md)`);
    this.name = 'NotImplementedError';
  }
}

/** Fonction désactivée par un drapeau de fonctionnalité. */
export class FeatureDisabledError extends AppError {
  constructor(flag: string) {
    super('feature_disabled', `Fonction désactivée : ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
