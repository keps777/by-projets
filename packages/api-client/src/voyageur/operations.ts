import { z } from "zod";
import { voyageur as c } from "@afrimove/contrats";
import { definirCanal, definirOperation } from "../infra/operations";
import type { ValeurRequete } from "../infra/operations";

/**
 * Opérations et canaux de l'API voyageur (AM-013). Les schémas viennent de `@afrimove/contrats` ;
 * chaque opération se déclare une fois et sert à l'adaptateur mock comme à l'adaptateur HTTP.
 * Nom d'opération : `voyageur.<domaine>.<action>` (clé de cache et clé du mock).
 */

type Requete = Readonly<Record<string, ValeurRequete>>;

const liste = (valeurs: readonly string[] | undefined): string | undefined =>
  valeurs && valeurs.length > 0 ? valeurs.join(",") : undefined;

function requeteRecherche(p: c.RechercheDeparts): Requete {
  const f = p.filtres ?? {};
  return {
    depart: p.depart,
    arrivee: p.arrivee,
    jour: p.jour,
    classe: f.classe,
    compagnies: liste(f.compagnies),
    preferees: f.preferees,
    covoit: f.inclureCovoit,
    matin: f.matinSeulement,
    coteACote: f.placesCoteACote,
    prixMax: f.prixMax,
  };
}

/* ------------------------------------------------------------------ compte */

export const OP_DEMANDER_CODE = definirOperation<c.DemandeCode, c.ReponseDemandeCode>({
  nom: "voyageur.compte.demanderCode",
  methode: "POST",
  chemin: () => "/voyageur/connexion/code",
  corps: (p) => p,
  reponse: c.SchemaReponseDemandeCode,
});

export const OP_VERIFIER_CODE = definirOperation<c.VerificationCode, c.SessionVoyageur>({
  nom: "voyageur.compte.verifierCode",
  methode: "POST",
  chemin: () => "/voyageur/connexion/verification",
  corps: (p) => p,
  reponse: c.SchemaSessionVoyageur,
});

export const OP_PROFIL = definirOperation<void, c.Profil>({
  nom: "voyageur.compte.profil",
  methode: "GET",
  chemin: () => "/voyageur/moi",
  reponse: c.SchemaProfil,
});

export const OP_FIDELITE = definirOperation<void, c.Fidelite>({
  nom: "voyageur.compte.fidelite",
  methode: "GET",
  chemin: () => "/voyageur/moi/fidelite",
  reponse: c.SchemaFidelite,
});

export const OP_PARRAINAGE = definirOperation<void, c.Parrainage>({
  nom: "voyageur.compte.parrainage",
  methode: "GET",
  chemin: () => "/voyageur/moi/parrainage",
  reponse: c.SchemaParrainage,
});

export const OP_PROCHES = definirOperation<void, c.Proche[]>({
  nom: "voyageur.compte.proches",
  methode: "GET",
  chemin: () => "/voyageur/moi/proches",
  reponse: z.array(c.SchemaProche),
});

export const OP_AJOUTER_PROCHE = definirOperation<c.NouveauProche, c.Proche>({
  nom: "voyageur.compte.ajouterProche",
  methode: "POST",
  chemin: () => "/voyageur/moi/proches",
  corps: (p) => p,
  reponse: c.SchemaProche,
});

export const OP_HISTORIQUE = definirOperation<void, c.ElementHistorique[]>({
  nom: "voyageur.compte.historique",
  methode: "GET",
  chemin: () => "/voyageur/moi/historique",
  reponse: z.array(c.SchemaElementHistorique),
});

/* ------------------------------------------------------------------ départs */

export const OP_RECHERCHER_DEPARTS = definirOperation<
  c.RechercheDeparts,
  c.ResultatRechercheDeparts
>({
  nom: "voyageur.departs.rechercher",
  methode: "GET",
  chemin: () => "/voyageur/departs",
  requete: requeteRecherche,
  reponse: c.SchemaResultatRechercheDeparts,
});

export const OP_OPTIONS_FILTRES = definirOperation<
  { depart: string; arrivee: string; jour?: string },
  c.OptionsFiltres
>({
  nom: "voyageur.departs.optionsFiltres",
  methode: "GET",
  chemin: () => "/voyageur/departs/filtres",
  requete: (p) => ({ depart: p.depart, arrivee: p.arrivee, jour: p.jour }),
  reponse: c.SchemaOptionsFiltres,
});

export const OP_ENREGISTRER_FILTRES = definirOperation<
  c.EnregistrerFiltres,
  { enregistre: boolean }
>({
  nom: "voyageur.departs.enregistrerFiltres",
  methode: "PUT",
  chemin: () => "/voyageur/departs/filtres",
  corps: (p) => p,
  reponse: z.object({ enregistre: z.boolean() }),
  idempotente: true,
});

export const OP_DEFINIR_PREFEREE = definirOperation<c.DefinirPreferee, c.DefinirPreferee>({
  nom: "voyageur.departs.definirPreferee",
  methode: "PUT",
  chemin: (p) => `/voyageur/compagnies/${p.compagnieId}/preferee`,
  corps: (p) => ({ preferee: p.preferee }),
  reponse: z.object({ compagnieId: z.string(), preferee: z.boolean() }),
});

export const OP_RECHERCHER_VILLE = definirOperation<c.RechercheVille, c.ResultatRechercheVille>({
  nom: "voyageur.ville.rechercher",
  methode: "GET",
  chemin: () => "/voyageur/ville/offres",
  requete: (p) => ({
    ville: p.ville,
    depart: p.depart,
    arrivee: p.arrivee,
    quand: p.quand,
    types: liste(p.types),
  }),
  reponse: c.SchemaResultatRechercheVille,
});

export const OP_DETAIL_DEPART = definirOperation<{ departId: string }, c.DetailDepart>({
  nom: "voyageur.departs.detail",
  methode: "GET",
  chemin: (p) => `/voyageur/departs/${p.departId}`,
  reponse: c.SchemaDetailDepart,
});

export const OP_PLAN_SIEGES = definirOperation<{ departId: string }, c.PlanSiegesVue>({
  nom: "voyageur.departs.planSieges",
  methode: "GET",
  chemin: (p) => `/voyageur/departs/${p.departId}/sieges`,
  reponse: c.SchemaPlanSiegesVue,
});

export const OP_BLOQUER_SIEGE = definirOperation<c.BloquerSiege, c.BlocageSiege>({
  nom: "voyageur.departs.bloquerSiege",
  methode: "POST",
  chemin: (p) => `/voyageur/departs/${p.departId}/sieges/${p.siege}/blocage`,
  reponse: c.SchemaBlocageSiege,
});

export const CANAL_PLAN_SIEGES = definirCanal<{ departId: string }, c.MessagePlanSieges>({
  nom: "voyageur.departs.planSieges",
  chemin: (p) => `/voyageur/departs/${p.departId}/sieges/direct`,
  message: c.SchemaMessagePlanSieges,
});

/* ------------------------------------------------------------------ commande et paiement */

export const OP_MOYENS_PAIEMENT = definirOperation<void, c.MoyenPaiementVue[]>({
  nom: "voyageur.paiements.moyens",
  methode: "GET",
  chemin: () => "/voyageur/paiements/moyens",
  reponse: z.array(c.SchemaMoyenPaiementVue),
});

export const OP_DEVIS = definirOperation<c.DemandeDevis, c.Devis>({
  nom: "voyageur.commandes.devis",
  methode: "GET",
  chemin: () => "/voyageur/commandes/devis",
  requete: (p) => ({
    departId: p.departId,
    places: p.places,
    codePromo: p.codePromo,
    enLigne: p.enLigne,
  }),
  reponse: c.SchemaDevis,
});

export const OP_CREER_COMMANDE = definirOperation<c.CreerCommande, c.Commande>({
  nom: "voyageur.commandes.creer",
  methode: "POST",
  chemin: () => "/voyageur/commandes",
  corps: (p) => p,
  reponse: c.SchemaCommande,
});

export const OP_COMMANDE = definirOperation<{ commandeId: string }, c.Commande>({
  nom: "voyageur.commandes.obtenir",
  methode: "GET",
  chemin: (p) => `/voyageur/commandes/${p.commandeId}`,
  reponse: c.SchemaCommande,
});

export const OP_PAYER_COMMANDE = definirOperation<c.PayerCommande, c.Paiement>({
  nom: "voyageur.paiements.payer",
  methode: "POST",
  chemin: (p) => `/voyageur/commandes/${p.commandeId}/paiements`,
  corps: (p) => ({ moyen: p.moyen, telephone: p.telephone, jetonCarte: p.jetonCarte }),
  reponse: c.SchemaPaiement,
});

export const OP_STATUT_PAIEMENT = definirOperation<{ paiementId: string }, c.Paiement>({
  nom: "voyageur.paiements.statut",
  methode: "GET",
  chemin: (p) => `/voyageur/paiements/${p.paiementId}`,
  reponse: c.SchemaPaiement,
});

export const OP_LIEN_PROCHE = definirOperation<c.CreerLienProche, c.LienProche>({
  nom: "voyageur.paiements.lienProche",
  methode: "POST",
  chemin: (p) => `/voyageur/commandes/${p.commandeId}/lien-proche`,
  corps: (p) => ({ procheId: p.procheId, telephone: p.telephone }),
  reponse: c.SchemaLienProche,
});

export const CANAL_STATUT_PAIEMENT = definirCanal<{ paiementId: string }, c.MessageStatutPaiement>({
  nom: "voyageur.paiements.statut",
  chemin: (p) => `/voyageur/paiements/${p.paiementId}/direct`,
  message: c.SchemaMessageStatutPaiement,
});

/* ------------------------------------------------------------------ billet */

export const OP_BILLET = definirOperation<{ billetId: string }, c.BilletVoyageur>({
  nom: "voyageur.billets.obtenir",
  methode: "GET",
  chemin: (p) => `/voyageur/billets/${p.billetId}`,
  reponse: c.SchemaBilletVoyageur,
});

export const OP_APERCU_ANNULATION = definirOperation<{ billetId: string }, c.ApercuAnnulation>({
  nom: "voyageur.billets.apercuAnnulation",
  methode: "GET",
  chemin: (p) => `/voyageur/billets/${p.billetId}/annulation`,
  reponse: c.SchemaApercuAnnulation,
});

export const OP_ANNULER_BILLET = definirOperation<c.AnnulerBillet, c.ResultatAnnulation>({
  nom: "voyageur.billets.annuler",
  methode: "POST",
  chemin: (p) => `/voyageur/billets/${p.billetId}/annulation`,
  corps: (p) => ({ motif: p.motif }),
  reponse: c.SchemaResultatAnnulation,
});

export const OP_REPORTER_BILLET = definirOperation<c.ReporterBillet, c.ResultatReport>({
  nom: "voyageur.billets.reporter",
  methode: "POST",
  chemin: (p) => `/voyageur/billets/${p.billetId}/report`,
  corps: (p) => ({ departCibleId: p.departCibleId }),
  reponse: c.SchemaResultatReport,
});
