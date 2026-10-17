import { PREFIXES_URL, estEspace, type Espace } from "./roles";

/**
 * Table « planche -> route » de docs/tickets.md (section 5), pour les 75 planches qui ont une route.
 * `route` est le chemin du fichier sous `src/routes/` (sans `.tsx`) : `(groupe)` = espace, absent de l'URL
 * (sauf `PREFIXES_URL`), `[param]` = segment dynamique. Parcours (spécification des tests de parcours) et
 * Systeme (référence du design system) n'ont pas de route.
 */
export const PLANCHES = {
  Splash: { route: "/bienvenue", tickets: "AM-020" },
  Connexion: { route: "/connexion", tickets: "AM-021" },
  Tuto: { route: "/tutoriel", tickets: "AM-022" },
  Main: { route: "/(voyageur)/voyager", tickets: "AM-030, AM-183" },
  SiegePay: { route: "/(voyageur)/depart/[departId]", tickets: "AM-033" },
  Pass: { route: "/(voyageur)/billet/[billetId]", tickets: "AM-035" },
  Direct: { route: "/(voyageur)/billet/[billetId]/direct", tickets: "AM-040, AM-183" },
  Reseau: { route: "/(voyageur)/reseau", tickets: "AM-036" },
  Covoit: { route: "/(voyageur)/covoit", tickets: "AM-050" },
  Paiement: { route: "/(voyageur)/paiement/[commandeId]", tickets: "AM-034" },
  Course: { route: "/(voyageur)/course", tickets: "AM-042" },
  MainVille: { route: "/(voyageur)/voyager/ville", tickets: "AM-032" },
  CovoitVille: { route: "/(voyageur)/covoit/ville", tickets: "AM-051" },
  CovoitConducteur: { route: "/(voyageur)/covoit/conducteur", tickets: "AM-183, AM-052" },
  MainFiltres: { route: "/(voyageur)/voyager/filtres", tickets: "AM-031" },
  Arret: { route: "/(voyageur)/monter-en-route", tickets: "AM-041" },
  Groupe: { route: "/(voyageur)/groupe", tickets: "AM-183, AM-043" },
  USSD: { route: "/(voyageur)/sans-internet", tickets: "AM-045" },
  Moi: { route: "/(voyageur)/moi", tickets: "AM-183, AM-046" },
  ColisEnvoi: { route: "/(voyageur)/colis", tickets: "AM-060" },
  ColisCode: { route: "/(voyageur)/colis/[colisId]", tickets: "AM-061, AM-183" },
  Relais: { route: "/(voyageur)/colis/[colisId]/relais", tickets: "AM-062" },
  Livraison: { route: "/(voyageur)/colis/[colisId]/livraison", tickets: "AM-183, AM-063" },
  Proche: { route: "/(voyageur)/proche", tickets: "AM-044" },
  Guichet: { route: "/(guichet)/accueil", tickets: "AM-070" },
  Vente: { route: "/(guichet)/vendre", tickets: "AM-071, AM-183" },
  Cadence: { route: "/(guichet)/cadence", tickets: "AM-072, AM-183" },
  CadenceBillet: { route: "/(guichet)/cadence/vendu", tickets: "AM-072" },
  CadenceQuai: { route: "/(quai)/completer", tickets: "AM-081" },
  GuichetColis: { route: "/(guichet)/colis", tickets: "AM-073" },
  Depot: { route: "/(guichet)/depot", tickets: "AM-074" },
  Quai: { route: "/(quai)/embarquement", tickets: "AM-080" },
  Convoyeur: { route: "/(bus)/convoyeur", tickets: "AM-082, AM-183" },
  Chauffeur: { route: "/(bus)/chauffeur", tickets: "AM-083, AM-183" },
  Controleur: { route: "/(controle)/inopine", tickets: "AM-084" },
  Caisse: { route: "/(guichet)/caisse", tickets: "AM-076" },
  Superviseur: { route: "/(superviseur)/gare", tickets: "AM-090" },
  SuperviseurValider: { route: "/(superviseur)/cloture/[sessionId]", tickets: "AM-091" },
  SuperviseurVoir: { route: "/(superviseur)/annulation/[demandeId]", tickets: "AM-092" },
  SuperviseurEquipe: { route: "/(superviseur)/equipe", tickets: "AM-093, AM-183" },
  SuperviseurDebloquer: { route: "/(superviseur)/debloquer/[appareilId]", tickets: "AM-094" },
  RapportSoir: { route: "/(patron)/rapport", tickets: "AM-095" },
  Patron: { route: "/(patron)/aujourdhui", tickets: "AM-100" },
  Assistant: { route: "/(patron)/assistant", tickets: "AM-104" },
  Analyses: { route: "/(patron)/analyses", tickets: "AM-106" },
  Comptable: { route: "/(patron)/comptable", tickets: "AM-110" },
  Config: { route: "/(patron)/reglages", tickets: "AM-120" },
  Modules: { route: "/(patron)/reglages/modules", tickets: "AM-125" },
  Financement: { route: "/(patron)/financement", tickets: "AM-130" },
  InterAgences: { route: "/(patron)/inter-agences", tickets: "AM-132" },
  RelaisApp: { route: "/(relais)/accueil", tickets: "AM-140" },
  Livreur: { route: "/(livreur)/accueil", tickets: "AM-183, AM-144" },
  Conducteur: { route: "/(voyageur)/covoit/proposer", tickets: "AM-053" },
  Vendeur: { route: "/(vendeur)/accueil", tickets: "AM-147" },
  Controle: { route: "/controle", tickets: "AM-150" },
  AssistantReponse: { route: "/(patron)/assistant/reponse", tickets: "AM-105" },
  AnalysesLigne: { route: "/(patron)/analyses/ligne/[ligneId]", tickets: "AM-107" },
  AnalysesBus: { route: "/(patron)/analyses/bus/[busId]", tickets: "AM-108" },
  ConfigLigne: { route: "/(patron)/reglages/ligne/[ligneId]", tickets: "AM-121" },
  ComptableRapprochement: { route: "/(patron)/comptable/rapprochement", tickets: "AM-111" },
  ComptableApercu: { route: "/(patron)/comptable/apercu/[exportId]", tickets: "AM-112" },
  ComptableCloture: { route: "/(patron)/comptable/cloture", tickets: "AM-113" },
  FinancementDemande: { route: "/(patron)/financement/demande/[dossierId]", tickets: "AM-131" },
  InterAgencesConvention: {
    route: "/(patron)/inter-agences/convention/[conventionId]",
    tickets: "AM-133",
  },
  PatronEquipe: { route: "/(patron)/gares", tickets: "AM-101" },
  PatronGare: { route: "/(patron)/gares/[gareId]", tickets: "AM-102" },
  PatronPersonne: { route: "/(patron)/personnes/[personneId]", tickets: "AM-103" },
  ConfigEquipeListe: { route: "/(patron)/reglages/equipe", tickets: "AM-122" },
  ConfigPersonne: { route: "/(patron)/reglages/personne/[personneId]", tickets: "AM-123" },
  ConfigRegles: { route: "/(patron)/reglages/regles", tickets: "AM-124" },
  RelaisDevenir: { route: "/(voyageur)/moi/devenir-relais", tickets: "AM-141" },
  RelaisInscription: { route: "/(voyageur)/moi/devenir-relais/fiche", tickets: "AM-142" },
  RelaisVerification: { route: "/(voyageur)/moi/devenir-relais/suivi", tickets: "AM-143" },
  LivreurDevenir: { route: "/(voyageur)/moi/devenir-livreur", tickets: "AM-145" },
  LivreurVerification: { route: "/(voyageur)/moi/devenir-livreur/suivi", tickets: "AM-146" },
} as const satisfies Record<string, { route: string; tickets: string }>;

export type Planche = keyof typeof PLANCHES;

export interface RouteAnalysee {
  /** Espace (groupe de routes) de la route, `null` pour les routes sans groupe (/bienvenue, /controle...). */
  espace: Espace | null;
  /** Motif d'URL de React Router : `/guichet/accueil`, `/depart/:departId`. */
  url: string;
  /** Noms des paramètres, dans l'ordre. */
  params: string[];
}

/** `/(voyageur)/depart/[departId]` -> `{ espace: "voyageur", url: "/depart/:departId", params: ["departId"] }`. */
export function analyserRoute(route: string): RouteAnalysee {
  let segments = route.split("/").filter(Boolean);
  let espace: Espace | null = null;
  const premier = segments[0]?.match(/^\((.+)\)$/)?.[1];
  if (premier !== undefined) {
    if (!estEspace(premier)) throw new Error(`Groupe de routes inconnu : (${premier})`);
    espace = premier;
    segments = segments.slice(1);
  }
  const params: string[] = [];
  const url = segments.map((segment) => {
    const param = segment.match(/^\[(.+)\]$/)?.[1];
    if (param === undefined) return segment;
    params.push(param);
    return `:${param}`;
  });
  const prefixe = espace ? (PREFIXES_URL[espace] ?? "") : "";
  return { espace, url: `${prefixe}/${url.join("/")}`, params };
}

/** URL réelle d'une planche : `urlPlanche("SiegePay", { departId: "dep-0800" })` -> `/depart/dep-0800`. */
export function urlPlanche(planche: Planche, params: Record<string, string> = {}): string {
  const { url } = analyserRoute(PLANCHES[planche].route);
  return url.replace(/:(\w+)/g, (_, nom: string) => {
    const valeur = params[nom];
    if (valeur === undefined) throw new Error(`Paramètre « ${nom} » manquant pour ${planche}`);
    return encodeURIComponent(valeur);
  });
}

/**
 * Valeurs d'exemple des segments dynamiques, pour tools/fidelite/ecrans.json et la route de démonstration. Ce
 * sont des valeurs de remplissage : AM-011 les remplacera par les identifiants des données de démonstration.
 */
export const EXEMPLES_PARAMS: Record<string, string> = {
  departId: "dep-0800",
  billetId: "BEX-DLA-270105-0142",
  commandeId: "cmd-0001",
  colisId: "colis-c-dla-270105-0017",
  sessionId: "session-k-dla-270105-2-1",
  demandeId: "dem-annulation-billet-alp-dla-270105-0171",
  appareilId: "appareil-gu3-dla",
  exportId: "journal_ventes",
  ligneId: "ligne-alp-dlabaf",
  busId: "bus-lt207ab",
  dossierId: "AV-2027-0041",
  conventionId: "conv-oc-0001",
  gareId: "gare-alp-dla",
  personneId: "pers-joseph",
};

/** URL d'une planche avec les valeurs d'exemple (utilisée pour `ecrans.json`). */
export function urlExemple(planche: Planche): string {
  return urlPlanche(planche, EXEMPLES_PARAMS);
}
