// Conversation WhatsApp simulée avec AfriMove (numéro 6 50 00 12 34) : « Douala demain », un code colis, « mon billet »,
// puis « 1 / 2 / 3 » pour réserver et payer par MoMo. Aucun message n'est réellement envoyé.
import { jourSemaineCourt, ajouterJours } from '../../core/dates.ts';
import { aujourdhui } from '../../data/horloge.ts';
import { LIBELLE } from '../../core/colis.ts';
import { fcfa } from '../../core/money.ts';
import { app } from '../../data/store.svelte.ts';
import { billetsDe, departParId, ligneDe } from '../../domain/actions.ts';
import { acheter, departsReservables, nomCourt, prixPropose } from './achat.ts';
import { codeLisible, titulaire } from './ussd.ts';

export const NUMERO_WHATSAPP = '6 50 00 12 34';
export interface Message { id: number; de: 'moi' | 'bot'; texte: string }
export interface Conversation { messages: Message[]; /** Départs proposés au dernier message : « 1, 2, 3 » choisit l'un d'eux. */ propositions: string[] }
export const nouvelleConversation = (): Conversation => ({ messages: [{ id: 1, de: 'bot', texte: 'Bonjour 👋 Je suis AfriMove. Écris une ville (« Douala demain ») ou un code colis (AM-C-9Q2).' }], propositions: [] });
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VILLES = ['Douala', 'Bafoussam', 'Bamenda', 'Kribi', 'Yaoundé'];
const f = (n: number) => `${fcfa(n)} F`;

/** Calcule la réponse du bot et met à jour les propositions. Les messages sont ajoutés par l'appelant (voir `envoyer`). */
export function repondre(conv: Conversation, texteBrut: string): string[] {
  const t = sansAccent(texteBrut).trim(), moi = titulaire();
  const choix = /^[1-3]$/.test(t) ? Number(t) : 0;
  if (choix) {
    const id = conv.propositions[choix - 1];
    if (!id) return ['Je n’ai pas de départ à te proposer. Écris d’abord une ville, par exemple « Douala demain ».'];
    conv.propositions = [];
    const r = acheter({ departId: id, acheteurId: moi.id, passager: { nom: `${moi.prenom} ${moi.nom}`.trim(), tel: moi.tel }, canal: 'whatsapp', payer: true });
    if (!r.ok) return [`${r.message} Écris une autre ville ou un autre horaire.`];
    const d = departParId(r.billet.departId)!, l = ligneDe(d);
    return [`Paiement MoMo de ${f(r.paiement.montant)} reçu ✅`, `Billet ${codeLisible(r.billet.code)}\n${l.de} → ${l.vers} · ${jourSemaineCourt(d.jour)} ${d.heure}\nPlace ${r.billet.siege} · ${nomCourt(d)}\nMontre le code au quai, même sans internet.`];
  }
  const colis = /am-?c-?([a-z0-9]{3})/.exec(t);
  if (colis) {
    const code = `AM-C-${colis[1].toUpperCase()}`, c = app.monde.colis.find((x) => x.code === code);
    if (!c) return [`Je ne trouve pas le colis ${code}. Vérifie le code sur ton reçu.`];
    const e = c.etapes[c.etapes.length - 1];
    return [`Colis ${c.code} · ${LIBELLE[c.statut]}`, `${c.depart} → ${c.arrivee}\nDernière étape : ${e?.lieu ?? '—'}\nCode de retrait : ${c.codeRetrait}`];
  }
  if (/billet|ticket/.test(t)) {
    const b = billetsDe(moi.id).find((x) => x.statut === 'valide' || x.statut === 'scanne');
    if (!b) return ['Tu n’as pas de billet en cours. Écris une ville pour réserver.'];
    const d = departParId(b.departId)!, l = ligneDe(d);
    return [`Ton billet ${codeLisible(b.code)}\n${l.de} → ${l.vers} · ${jourSemaineCourt(d.jour)} ${d.heure}\nPlace ${b.siege ?? 'libre'} · ${b.statut === 'scanne' ? 'déjà utilisé' : 'valide'}`];
  }
  const ville = VILLES.find((v) => t.includes(sansAccent(v)));
  if (ville) {
    const de = ville === 'Yaoundé' || ville === 'Kribi' ? 'Douala' : 'Yaoundé', jour = /aujourd/.test(t) ? aujourdhui() : /apres/.test(t) ? ajouterJours(aujourdhui(), 2) : ajouterJours(aujourdhui(), 1);
    const ds = departsReservables(de, ville, jour).slice(0, 3);
    if (!ds.length) { conv.propositions = []; return [`Pas de départ ${de} → ${ville} pour ${jourSemaineCourt(jour)} (complet ou terminé). Essaie un autre jour : « ${ville} après-demain ».`]; }
    conv.propositions = ds.map((d) => d.id);
    return [`${de} → ${ville} · ${jourSemaineCourt(jour)}\n${ds.map((d, i) => `${i + 1}. ${d.heure} ${nomCourt(d)} · ${f(prixPropose(d))}`).join('\n')}`, 'Réponds 1, 2 ou 3 pour réserver et payer par MoMo.'];
  }
  return ['Je peux t’aider à :\n• réserver : « Douala demain »\n• suivre un colis : AM-C-9Q2\n• voir ton billet : « mon billet »'];
}
