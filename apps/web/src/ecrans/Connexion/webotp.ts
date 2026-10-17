import { useEffect, useRef } from "react";

/**
 * Remplissage automatique du code reçu par SMS, sans dépendance.
 *
 * - Chrome Android : WebOTP (`navigator.credentials.get({ otp })`). Le navigateur lit le SMS dont la dernière ligne est
 *   « @<domaine> #<code> » et rend le code ; l'écran le met dans les cases sans que la personne ne tape rien.
 * - Safari iOS (et le clavier Android) : l'attribut `autocomplete="one-time-code"` du champ du code propose le code du
 *   SMS au-dessus du clavier. Il est posé sur le vrai champ de l'écran (EcranConnexion).
 * - Ailleurs : rien ne se passe, la personne tape les 4 chiffres.
 */

interface OtpCredential extends Credential {
  code?: string;
}

type OptionsOtp = CredentialRequestOptions & { otp?: { transport: string[] } };

/** Le navigateur sait-il lire le code du SMS (WebOTP) ? */
export function webOtpDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    "OTPCredential" in window &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.get === "function"
  );
}

/** Les `longueur` chiffres d'un code lu dans un texte (le premier groupe de chiffres de la bonne taille). */
export function extraireCode(texte: string | undefined, longueur: number): string | null {
  if (!texte) return null;
  const trouve = new RegExp(`(?<!\\d)\\d{${longueur}}(?!\\d)`).exec(texte);
  return trouve ? trouve[0] : null;
}

/**
 * Attend le SMS tant que `actif` est vrai ; `cle` change à chaque nouvelle demande de code (une demande = une attente).
 * L'attente est annulée quand l'écran est quitté ou qu'une nouvelle demande la remplace.
 */
export function useWebOtp(
  actif: boolean,
  cle: unknown,
  longueur: number,
  surCode: (code: string) => void,
): void {
  const rappel = useRef(surCode);
  rappel.current = surCode;

  useEffect(() => {
    if (!actif || !webOtpDisponible()) return;
    const arret = new AbortController();
    const options: OptionsOtp = { otp: { transport: ["sms"] }, signal: arret.signal };
    navigator.credentials
      .get(options)
      .then((credential) => {
        const code = extraireCode((credential as OtpCredential | null)?.code, longueur);
        if (code && !arret.signal.aborted) rappel.current(code);
      })
      .catch(() => {
        // Refusé, annulé ou expiré : la personne tape le code, rien d'autre à faire.
      });
    return () => arret.abort();
  }, [actif, cle, longueur]);
}
