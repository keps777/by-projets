/**
 * Règle de sécurité du code de retrait.
 *
 * Le code de retrait (6 chiffres) n'apparaît que dans les réponses destinées à l'expéditeur et au
 * destinataire du colis (`SchemaColisProprietaire`, `SchemaLivraisonColis`, `SchemaColisCree`). Aucune
 * réponse destinée au guichet, au relais, au livreur ou à une compagnie partenaire ne le porte, ni
 * son haché, ni son sel : ces réponses sont déclarées en `strictObject`, donc un champ en trop fait
 * échouer la validation au lieu d'être supprimé en silence. Le partenaire, lui, envoie le code qu'il
 * a reçu du client dans une requête (`SchemaRemiseColisRelais`, `SchemaRemiseColisLivreur`) et le
 * serveur le compare au haché.
 */

/**
 * Noms de champs qui ne doivent jamais figurer dans une réponse partenaire. Le champ générique
 * `code` n'est refusé que s'il porte six chiffres (les lignes de devis ont un `code` « port »).
 */
export const CHAMPS_CODE_RETRAIT: ReadonlySet<string> = new Set([
  "codeRetrait",
  "codeRetraitHache",
  "codeRetraitSel",
  "hache",
  "sel",
]);

function ressembleAUnCode(valeur: unknown): boolean {
  return (
    (typeof valeur === "string" || typeof valeur === "number") &&
    /^\s*\d{3}\s?\d{3}\s*$/.test(String(valeur))
  );
}

/**
 * Cherche une fuite du code de retrait dans une valeur JSON : un champ interdit (voir
 * `CHAMPS_CODE_RETRAIT`) ou, si `codes` est donné, une chaîne dont les chiffres contiennent un de ces
 * codes (« 482913 », « 482 913 », « 48 29 13 »). Renvoie les chemins fautifs (vide = aucune fuite).
 */
export function fuitesCodeRetrait(valeur: unknown, codes: readonly string[] = []): string[] {
  const fuites: string[] = [];
  const parcourir = (v: unknown, chemin: string): void => {
    if (typeof v === "string") {
      const chiffres = v.replace(/\D/g, "");
      if (codes.some((c) => c.length > 0 && chiffres.includes(c))) fuites.push(chemin);
    } else if (typeof v === "number") {
      if (codes.some((c) => c.length > 0 && String(v).includes(c))) fuites.push(chemin);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => parcourir(x, `${chemin}[${i}]`));
    } else if (v !== null && typeof v === "object") {
      for (const [cle, x] of Object.entries(v)) {
        const sous = chemin === "" ? cle : `${chemin}.${cle}`;
        if (CHAMPS_CODE_RETRAIT.has(cle) || (cle === "code" && ressembleAUnCode(x))) {
          fuites.push(sous);
        }
        parcourir(x, sous);
      }
    }
  };
  parcourir(valeur, "");
  return fuites;
}
