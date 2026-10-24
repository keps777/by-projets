// Passkey (WebAuthn) : on tente réellement l'authentification quand `navigator.credentials` existe. Sans serveur, la réponse n'est pas vérifiée :
// la démonstration accepte toute assertion produite par l'appareil. Si l'appareil ne sait pas faire (ou refuse), l'appelant bascule sur la simulation.
export type ResultatPasskey = 'ok' | 'indisponible' | 'refuse' | 'delai';
interface Conteneur { get(o: unknown): Promise<unknown>; create(o: unknown): Promise<unknown> }
export const passkeyPossible = (c: unknown = typeof navigator !== 'undefined' ? navigator.credentials : undefined): boolean =>
  !!c && typeof (c as Conteneur).get === 'function' && (typeof PublicKeyCredential !== 'undefined' || c !== (typeof navigator !== 'undefined' ? navigator.credentials : undefined));
const defi = () => { const b = new Uint8Array(32); (globalThis.crypto ?? ({ getRandomValues: (x: Uint8Array) => x } as Crypto)).getRandomValues(b); return b; };
function classer(e: unknown): ResultatPasskey { const n = (e as { name?: string })?.name; return n === 'NotAllowedError' || n === 'AbortError' ? 'refuse' : 'indisponible'; }
async function avecDelai<T>(p: Promise<T>, ms: number): Promise<T | 'delai'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([p, new Promise<'delai'>((r) => { timer = setTimeout(() => r('delai'), ms); })]); } finally { clearTimeout(timer); }
}
/** Authentification par passkey. `credentials` est injectable pour les tests. */
export async function tenterPasskey(o: { credentials?: unknown; delaiMs?: number } = {}): Promise<ResultatPasskey> {
  const c = (o.credentials ?? (typeof navigator !== 'undefined' ? navigator.credentials : undefined)) as Conteneur | undefined;
  if (!passkeyPossible(c)) return 'indisponible';
  try {
    const r = await avecDelai(c!.get({ publicKey: { challenge: defi(), timeout: o.delaiMs ?? 8000, userVerification: 'preferred', rpId: typeof location !== 'undefined' ? location.hostname : undefined } }), (o.delaiMs ?? 8000) + 500);
    if (r === 'delai') return 'delai';
    return r ? 'ok' : 'refuse';
  } catch (e) { return classer(e); }
}
/** Enregistre une passkey sur l'appareil (Réglages). Même principe : l'attestation n'est pas envoyée. */
export async function creerPasskey(o: { credentials?: unknown; nom: string; id: string; delaiMs?: number }): Promise<ResultatPasskey> {
  const c = (o.credentials ?? (typeof navigator !== 'undefined' ? navigator.credentials : undefined)) as Conteneur | undefined;
  if (!passkeyPossible(c)) return 'indisponible';
  try {
    const r = await avecDelai(c!.create({ publicKey: { challenge: defi(), rp: { name: 'AfriMove' }, user: { id: new TextEncoder().encode(o.id), name: o.nom, displayName: o.nom }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: o.delaiMs ?? 8000, authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' } } }), (o.delaiMs ?? 8000) + 500);
    if (r === 'delai') return 'delai';
    return r ? 'ok' : 'refuse';
  } catch (e) { return classer(e); }
}
