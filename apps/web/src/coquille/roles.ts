/**
 * Espaces (groupes de routes) et rôles de l'application.
 *
 * Un groupe de routes est un dossier `routes/(nom)/` : il porte le layout, la barre d'onglets et la garde de
 * rôle de l'espace. Le nom du groupe est absent de l'URL, sauf pour les espaces de `PREFIXES_URL` (voir plus bas).
 */
export const ESPACES = [
  "voyageur",
  "guichet",
  "quai",
  "bus",
  "controle",
  "superviseur",
  "patron",
  "relais",
  "livreur",
  "vendeur",
] as const;

export type Espace = (typeof ESPACES)[number];

/** Un rôle = l'espace dont il est le titulaire (un compte voyageur, un compte guichet, etc.). */
export type Role = Espace;

export function estEspace(valeur: unknown): valeur is Espace {
  return typeof valeur === "string" && (ESPACES as readonly string[]).includes(valeur);
}

/** Libellés du sélecteur de rôle (mode démo) : textes de service, pas de l'interface voyageur. */
export const LIBELLES_ROLES: Record<Role, string> = {
  voyageur: "Voyageur",
  guichet: "Guichet",
  quai: "Quai",
  bus: "Convoyeur et chauffeur",
  controle: "Contrôleur inopiné",
  superviseur: "Superviseur de gare",
  patron: "Patron",
  relais: "Point relais",
  livreur: "Livreur moto",
  vendeur: "Vendeur ambulant",
};

/**
 * Les groupes de routes sont absents de l'URL (`/(voyageur)/voyager` -> `/voyager`), mais deux URL de la table
 * « planche -> route » seraient alors ambiguës (`/accueil` pour guichet, relais, livreur et vendeur ;
 * `/colis` pour voyageur et guichet). Ces quatre espaces gardent donc leur nom en préfixe : `/guichet/accueil`,
 * `/relais/accueil`, `/livreur/accueil`, `/vendeur/accueil`. Tous les autres restent sans préfixe.
 */
export const PREFIXES_URL: Partial<Record<Espace, string>> = {
  guichet: "/guichet",
  relais: "/relais",
  livreur: "/livreur",
  vendeur: "/vendeur",
};

/** Page d'accueil de chaque espace : où l'on envoie un compte qui sort de son espace. */
export const ACCUEIL_ESPACE: Record<Espace, string> = {
  voyageur: "/voyager",
  guichet: "/guichet/accueil",
  quai: "/embarquement",
  bus: "/chauffeur",
  controle: "/inopine",
  superviseur: "/gare",
  patron: "/aujourdhui",
  relais: "/relais/accueil",
  livreur: "/livreur/accueil",
  vendeur: "/vendeur/accueil",
};

/**
 * Espaces qu'un rôle peut ouvrir. Un compte agent ne voit que son espace, avec trois exceptions voulues par les
 * maquettes : les onglets du guichet mènent au quai, ceux du superviseur à la caisse, au quai et à l'accueil du
 * patron (Guichet.dc.html et Superviseur.dc.html).
 */
export const ESPACES_AUTORISES: Record<Role, readonly Espace[]> = {
  voyageur: ["voyageur"],
  guichet: ["guichet", "quai"],
  quai: ["quai"],
  bus: ["bus"],
  controle: ["controle"],
  superviseur: ["superviseur", "guichet", "quai", "patron"],
  patron: ["patron"],
  relais: ["relais"],
  livreur: ["livreur"],
  vendeur: ["vendeur"],
};

export function peutOuvrir(role: Role, espace: Espace): boolean {
  return ESPACES_AUTORISES[role].includes(espace);
}

/** Rôles qui ouvrent la salle de contrôle (/controle) : la connexion est celle du patron (mock avant AM-017). */
export const ROLES_SALLE_DE_CONTROLE: readonly Role[] = ["patron"];
