import { useEffect, useState } from "react";

/**
 * Vrai si le navigateur propose une vérification d'utilisateur intégrée à l'appareil
 * (empreinte, visage, verrou d'écran) via WebAuthn. Sinon, le clavier PIN reste seul.
 */
export async function empreinteDisponible(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    const Identifiant = window.PublicKeyCredential;
    if (
      !Identifiant ||
      typeof Identifiant.isUserVerifyingPlatformAuthenticatorAvailable !== "function"
    ) {
      return false;
    }
    return await Identifiant.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Détecte la disponibilité de l'empreinte après le premier rendu (faux d'abord). */
export function useEmpreinteDisponible(): boolean {
  const [disponible, setDisponible] = useState(false);
  useEffect(() => {
    let actif = true;
    void empreinteDisponible().then((oui) => {
      if (actif) setDisponible(oui);
    });
    return () => {
      actif = false;
    };
  }, []);
  return disponible;
}

/**
 * Demande la vérification biométrique avec les options fournies par le serveur
 * (le défi `challenge` vient toujours du serveur). Renvoie l'assertion à lui renvoyer,
 * ou `null` si l'utilisateur refuse, annule ou si WebAuthn n'est pas disponible.
 */
export async function verifierEmpreinte(
  options: PublicKeyCredentialRequestOptions,
): Promise<Credential | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.credentials) return null;
    return await navigator.credentials.get({ publicKey: options });
  } catch {
    return null;
  }
}
