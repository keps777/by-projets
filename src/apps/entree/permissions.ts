// Autorisations du navigateur : état réel (Permissions API) et demande réelle (caméra, micro, position, notifications, contacts) quand c'est possible.
// Un navigateur ne laisse pas une page retirer une autorisation : « couper » ici veut dire que l'app cesse de s'en servir.
import type { ClePermission } from './etat.ts';

export type EtatSysteme = 'accorde' | 'refuse' | 'a_demander' | 'indisponible';
export interface FichePermission { cle: ClePermission; nom: string; pourquoi: string; sans: string; icone: string; nomApi?: string }
export const FICHES: FichePermission[] = [
  { cle: 'camera', nom: 'Caméra', pourquoi: 'Face ID pour payer et te connecter', sans: 'sans : code MoMo à taper', icone: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16', nomApi: 'camera' },
  { cle: 'position', nom: 'Position', pourquoi: 'Trouver la gare, suivre la moto, l’îlot en direct', sans: 'sans : choisis ta ville à la main', icone: 'M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z', nomApi: 'geolocation' },
  { cle: 'notifications', nom: 'Notifications', pourquoi: 'Bus au quai, retard, colis arrivé', sans: 'sans : SMS seulement', icone: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0', nomApi: 'notifications' },
  { cle: 'contacts', nom: 'Contacts', pourquoi: 'Payer pour un proche en 2 touches', sans: 'sans : tape le numéro', icone: 'M9 8a3.5 3.5 0 1 0 0 .1M2.5 20a6.5 6.5 0 0 1 13 0' },
  { cle: 'micro', nom: 'Micro', pourquoi: '« Dis où tu vas »', sans: 'sans : écris ta destination', icone: 'M9 3h6v8a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21', nomApi: 'microphone' }
];
const nav = () => (typeof navigator !== 'undefined' ? navigator : undefined);
function apiExiste(cle: ClePermission): boolean {
  const n = nav(); if (!n) return false;
  switch (cle) {
    case 'camera': case 'micro': return !!n.mediaDevices?.getUserMedia;
    case 'position': return !!n.geolocation;
    case 'notifications': return typeof Notification !== 'undefined';
    case 'contacts': return 'contacts' in n && typeof (n as unknown as { contacts?: { select?: unknown } }).contacts?.select === 'function';
  }
}
const depuisEtat = (s: string): EtatSysteme => (s === 'granted' ? 'accorde' : s === 'denied' ? 'refuse' : 'a_demander');
/** État actuel de l'autorisation dans le navigateur (sans rien demander). */
export async function lireEtat(cle: ClePermission): Promise<EtatSysteme> {
  if (!apiExiste(cle)) return 'indisponible';
  const fiche = FICHES.find((f) => f.cle === cle)!;
  try {
    if (fiche.nomApi && nav()?.permissions?.query) return depuisEtat((await nav()!.permissions.query({ name: fiche.nomApi as PermissionName })).state);
  } catch { /* nom d'autorisation non géré par ce navigateur */ }
  if (cle === 'notifications') return depuisEtat(Notification.permission === 'default' ? 'prompt' : Notification.permission);
  return 'a_demander';
}
export interface ReponseDemande { etat: EtatSysteme; detail?: string }
/** Fait la vraie demande au navigateur. Ne lève jamais : renvoie l'état résultant et, au besoin, une explication. */
export async function demander(cle: ClePermission): Promise<ReponseDemande> {
  if (!apiExiste(cle)) return { etat: 'indisponible', detail: 'Pas pris en charge sur cet appareil' };
  try {
    switch (cle) {
      case 'camera': case 'micro': {
        const flux = await nav()!.mediaDevices.getUserMedia(cle === 'camera' ? { video: true } : { audio: true });
        flux.getTracks().forEach((t) => t.stop()); return { etat: 'accorde' };
      }
      case 'position':
        return await new Promise<ReponseDemande>((res) => nav()!.geolocation.getCurrentPosition(() => res({ etat: 'accorde' }), (e) => res(e.code === 1 ? { etat: 'refuse' } : { etat: 'indisponible', detail: 'Position introuvable pour l’instant' }), { timeout: 8000, maximumAge: 600_000 }));
      case 'notifications': { const r = await Notification.requestPermission(); return { etat: depuisEtat(r === 'default' ? 'prompt' : r) }; }
      case 'contacts': { await (nav() as unknown as { contacts: { select(p: string[], o: { multiple: boolean }): Promise<unknown[]> } }).contacts.select(['name', 'tel'], { multiple: false }); return { etat: 'accorde' }; }
    }
  } catch (e) {
    const n = (e as { name?: string })?.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return { etat: 'refuse' };
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return { etat: 'indisponible', detail: cle === 'camera' ? 'Aucune caméra détectée' : 'Aucun micro détecté' };
    return { etat: 'indisponible', detail: 'Demande impossible pour l’instant' };
  }
}
/** Texte et ton affichés sous le nom d'une autorisation. */
export function etatAffiche(fiche: FichePermission, voulu: boolean, systeme: EtatSysteme, detail?: string): { texte: string; ton: 'okc' | 'wac' | 'erc' } {
  if (!voulu) return { texte: fiche.sans, ton: 'wac' };
  if (systeme === 'accorde') return { texte: 'autorisé · seulement quand l’app est ouverte', ton: 'okc' };
  if (systeme === 'refuse') return { texte: 'bloqué par le navigateur · ouvre les réglages du site pour autoriser', ton: 'erc' };
  if (systeme === 'indisponible') return { texte: detail ?? 'non disponible sur cet appareil', ton: 'wac' };
  return { texte: 'à autoriser · touche pour demander', ton: 'wac' };
}
