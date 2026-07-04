/**
 * Tiny typed HTTP errors so the DAL can throw and Route Handlers can map to a
 * status without stringly-typed guesswork. Server Actions catch these and turn
 * them into form results instead.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (m = "Non authentifié") => new HttpError(401, m);
export const forbidden = (m = "Accès refusé") => new HttpError(403, m);
export const notFound = (m = "Introuvable") => new HttpError(404, m);
export const badRequest = (m = "Requête invalide") => new HttpError(400, m);
export const tooLarge = (m = "Quota de stockage dépassé") => new HttpError(413, m);

export function statusOf(err: unknown): number {
  return err instanceof HttpError ? err.status : 500;
}
