// État qui ne doit JAMAIS être persisté : codes en clair le temps d'un écran à l'autre, drapeaux de parcours.
export const temp = $state({
  /** Premier code saisi à la création, comparé à la confirmation. */
  premierCode: '',
  /** Le code du compte a été saisi correctement sur un appareil inconnu : le parcours « nouvel appareil » peut continuer. */
  codeVerifie: false,
  /** Un SMS (OTP) vient d'être vérifié pour ce parcours (code oublié, nouvel appareil). */
  smsVerifie: false
});

/** Bandeau « SMS reçu » de la démonstration : aucun SMS réel n'est envoyé. */
export const sms = $state({ visible: false, texte: '', recuLe: 0 });
export function afficherSms(code: string) {
  sms.texte = `AssureMe : votre code est ${code}. Valable 5 minutes. Ne le partagez jamais.`;
  sms.recuLe = Date.now();
  sms.visible = true;
}
export const masquerSms = () => { sms.visible = false; };
