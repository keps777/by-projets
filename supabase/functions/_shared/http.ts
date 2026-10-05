// Outils HTTP communs aux fonctions serveur, sans API Deno (testables avec vitest).
// Les fonctions sont appelées par pg_cron (planification) avec l'en-tête x-cron-secret.

export const EN_TETE_SECRET = 'x-cron-secret';

/** Comparaison à durée constante : ne révèle pas, par le temps de réponse, combien de caractères sont justes. */
export function egaliteConstante(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Vrai si la requête porte le secret partagé. Un secret absent ou trop court côté serveur refuse tout. */
export function secretValide(req: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const recu = req.headers.get(EN_TETE_SECRET) ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  return egaliteConstante(recu, secret);
}

export function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/** Corps JSON facultatif : objet vide s'il est absent ou illisible. */
export async function lireCorps<T extends object>(req: Request): Promise<Partial<T>> {
  try {
    const t = await req.text();
    const v = t ? JSON.parse(t) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export type SourceSecret = string | undefined | (() => Promise<string | undefined>);

/** Enveloppe d'une fonction serveur : POST seulement, secret vérifié, réponse JSON, erreurs sans contenu personnel. */
export function servir(secret: SourceSecret, traiter: (req: Request) => Promise<unknown>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== 'POST') return json({ erreur: 'Méthode non permise.' }, 405);
    let attendu: string | undefined;
    try { attendu = typeof secret === 'function' ? await secret() : secret; } catch { attendu = undefined; }
    if (!secretValide(req, attendu)) return json({ erreur: 'Accès refusé.' }, 401);
    try {
      return json({ ok: true, ...((await traiter(req)) as object) });
    } catch (e) {
      console.error('Échec de la fonction :', e instanceof Error ? e.message : String(e));
      return json({ ok: false, erreur: 'Erreur interne.' }, 500);
    }
  };
}
