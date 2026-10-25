// Partage d'un billet à un proche : liens WhatsApp et SMS, texte du message. Pur.
import { normaliserTel } from './reglement.ts';

export const INDICATIF_CM = '237';
/** Lien WhatsApp (wa.me) vers un numéro camerounais, message prérempli. */
export const lienWhatsApp = (tel: string, texte: string) => `https://wa.me/${INDICATIF_CM}${normaliserTel(tel)}?text=${encodeURIComponent(texte)}`;
/** Lien SMS vers un numéro camerounais, message prérempli. */
export const lienSms = (tel: string, texte: string) => `sms:+${INDICATIF_CM}${normaliserTel(tel)}?body=${encodeURIComponent(texte)}`;
export interface InfosPartage { de: string; /** Passager du billet. */ passager: string; pourMoi: boolean; trajet: string; quand: string; place: string; code: string; destinataire: string }
/** Message envoyé au proche : le code suffit au quai ; le billet reste au nom de son passager. */
export function messagePartage(i: InfosPartage): string {
  const objet = i.pourMoi ? 'son billet' : `le billet de ${i.passager}`;
  return `AfriMove : ${i.de} te partage ${objet} ${i.trajet}, ${i.quand}, ${i.place}. Code ${i.code}. Montre ce message au quai. Bon voyage ${i.destinataire} !`;
}
