import type { ColisStocke } from "./modele";
import type { MessageSuivi } from "./ports";
import {
  DELAI_REPONSE_RECLAMATION_JOURS_OUVRES,
  MULTIPLE_PORT_SI_PERTE,
  TARIFS,
  formaterFcfa,
  repartitionRelais,
  type ActionColis,
  type EtatColis,
} from "./regles";

/**
 * Les vues d'un colis : une fonction par contrat de `@afrimove/contrats` (`colis`, `agence`).
 * Les tests de bout en bout valident chaque réponse avec les schémas zod de ces contrats.
 *
 * Règle de sécurité : seule `vueProprietaire` porte le code de retrait, et seulement parce que son
 * appelant le lui passe. Les autres vues ne reçoivent jamais le colis avec son code : elles ne lisent
 * que des champs choisis un par un (pas de `...colis`).
 */

export type Jalon = "depose" | "charge" | "en_route" | "disponible" | "remis";
export const JALONS: readonly Jalon[] = ["depose", "charge", "en_route", "disponible", "remis"];

const LIBELLES_JALON: Record<Jalon, string> = {
  depose: "Déposé",
  charge: "Chargé",
  en_route: "En route",
  disponible: "Disponible",
  remis: "Remis",
};

/** « +237699401822 » → « ···· 18 22 » (le format des étiquettes et des écrans partenaires). */
export function masquerTelephone(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, "");
  return `···· ${chiffres.slice(-4, -2)} ${chiffres.slice(-2)}`;
}

function dateDe(colis: ColisStocke, ...actions: ActionColis[]): string | null {
  const entrees = colis.historique.filter((h) => actions.includes(h.action));
  return entrees.length === 0 ? null : entrees[entrees.length - 1]!.at;
}

/** Les cinq étapes du suivi, vues par l'expéditeur et le destinataire. */
export function etapesSuivi(colis: ColisStocke) {
  const deposeA = colis.depose?.a ?? (colis.etat === "enregistre" ? null : colis.creeA);
  const chargeA = dateDe(colis, "charger");
  const enRouteA = dateDe(colis, "expedier");
  const remisA = dateDe(colis, "remettre", "livrer");
  const disponible = colis.disponibleDepuis !== null;
  const enAttente = !disponible && colis.arriveePrevue !== null && enRouteA !== null;
  return [
    {
      jalon: "depose" as const,
      libelle: LIBELLES_JALON.depose,
      detail:
        deposeA === null
          ? "à déposer au guichet"
          : `gare ${colis.gareOrigine.nom} · étiquette imprimée`,
      a: deposeA,
      estimee: false,
      fait: deposeA !== null,
    },
    {
      jalon: "charge" as const,
      libelle: LIBELLES_JALON.charge,
      detail: chargeA === null ? null : "scanné au chargement",
      a: chargeA,
      estimee: false,
      fait: chargeA !== null,
    },
    {
      jalon: "en_route" as const,
      libelle: LIBELLES_JALON.en_route,
      detail: enRouteA === null ? null : `vers ${colis.gareDestination.ville}`,
      a: enRouteA,
      estimee: false,
      fait: enRouteA !== null,
    },
    {
      jalon: "disponible" as const,
      libelle: LIBELLES_JALON.disponible,
      detail: `à ${colis.gareDestination.ville} · SMS au destinataire avec le lieu`,
      a: disponible ? colis.disponibleDepuis : enAttente ? colis.arriveePrevue : null,
      estimee: enAttente,
      fait: disponible,
    },
    {
      jalon: "remis" as const,
      libelle: LIBELLES_JALON.remis,
      detail: "photo de la remise envoyée aux deux",
      a: remisA,
      estimee: false,
      fait: remisA !== null,
    },
  ];
}

/** Le dernier jalon atteint (celui du message temps réel). */
export function jalonCourant(colis: ColisStocke): Jalon {
  const faits = etapesSuivi(colis).filter((e) => e.fait);
  return faits.length === 0 ? "depose" : faits[faits.length - 1]!.jalon;
}

export function messageSuivi(colis: ColisStocke, a: string): MessageSuivi {
  return { colisId: colis.id, etat: colis.etat, jalon: jalonCourant(colis), a };
}

/** Le mode de retrait peut encore changer tant que le colis n'est pas arrivé à son terme. */
const ETATS_MODE_MODIFIABLE: readonly EtatColis[] = [
  "enregistre",
  "charge",
  "en_route",
  "decharge",
  "disponible",
];

export const modeModifiable = (colis: ColisStocke): boolean =>
  ETATS_MODE_MODIFIABLE.includes(colis.etat);

export function optionsDeRetrait(colis: ColisStocke) {
  if (!modeModifiable(colis)) return [];
  const options: {
    mode: "relais" | "moto";
    titre: string;
    detail: string;
    prix: number;
  }[] = [];
  if (colis.mode !== "moto") {
    options.push({
      mode: "moto",
      titre: "Faire livrer à domicile",
      detail: `moto · ${formaterFcfa(TARIFS.livraison.minimum)} · dès l'arrivée`,
      prix: TARIFS.livraison.minimum,
    });
  }
  if (colis.mode !== "relais") {
    const prix = repartitionRelais().voyageur;
    options.push({
      mode: "relais",
      titre: "Déposer en relais",
      detail: `près du destinataire · ${formaterFcfa(prix)}`,
      prix,
    });
  }
  return options;
}

/** Colis tel que le voit son expéditeur ou son destinataire : la seule vue qui porte le code. */
export function vueProprietaire(
  colis: ColisStocke,
  role: "expediteur" | "destinataire",
  code: string,
) {
  const expediteur = role === "expediteur";
  return {
    id: colis.id,
    numero: colis.numero,
    role,
    etat: colis.etat,
    mode: colis.mode,
    contenu: colis.contenu,
    poidsKg: colis.poidsKg,
    assure: colis.assure,
    valeurAssuree: colis.assure ? colis.valeurAssuree : 0,
    prixTotal: colis.prixTotal,
    creeA: colis.creeA,
    expediteur: { nom: colis.expediteur.nom, telephone: colis.expediteur.telephone },
    destinataire: {
      nom: colis.destinataire.nom,
      surnom: colis.destinataire.surnom,
      telephone: colis.destinataire.telephone,
    },
    retrait: {
      code,
      libelle: expediteur
        ? `Code de retrait · à donner à ${colis.destinataire.nom} seulement`
        : "Votre code de retrait",
      consigne: "Remis contre ce code + sa pièce. Jamais sur l'étiquette, jamais au téléphone.",
      photoDepot: colis.depose ? { libelle: "photo au dépôt", a: colis.depose.a } : null,
    },
    suivi: etapesSuivi(colis),
    arriveePrevue: colis.disponibleDepuis === null ? colis.arriveePrevue : null,
    options: expediteur ? optionsDeRetrait(colis) : [],
    reclamation: {
      delaiReponseJoursOuvres: DELAI_REPONSE_RECLAMATION_JOURS_OUVRES,
      multiplePortSiPerte: MULTIPLE_PORT_SI_PERTE,
      texte:
        "Un problème ? Réclamation en 1 touche, réponse sous 2 jours ouvrés. " +
        "Perte prouvée par le suivi : 10 × le port, ou la valeur assurée.",
    },
  };
}

/** `SchemaColisEnregistre` : la réponse d'un enregistrement ou d'un dépôt au guichet. */
export function vueColisEnregistre(colis: ColisStocke) {
  return {
    colisId: colis.id,
    numero: colis.numero,
    sequence: colis.sequence,
    etat: colis.etat,
    prixTotal: colis.prixTotal,
    smsDestinataire: colis.code.smsDestinataire,
  };
}

/** `SchemaColisPartenaire` : ce que voit le guichet, un relais ou un livreur. Aucun champ du code. */
export function vuePartenaire(colis: ColisStocke, limiteRetrait: string | null) {
  return {
    id: colis.id,
    numero: colis.numero,
    etat: colis.etat,
    mode: colis.mode,
    poidsKg: colis.poidsKg,
    assure: colis.assure,
    valeurAssuree: colis.assure ? colis.valeurAssuree : 0,
    expediteur: { nom: colis.expediteur.nom },
    destinataire: {
      nom: colis.destinataire.nom,
      telephoneMasque: masquerTelephone(colis.destinataire.telephone),
    },
    codeRequis: true as const,
    disponibleDepuis: colis.disponibleDepuis,
    limiteRetrait,
  };
}
