import { voyageur as c } from "@afrimove/contrats";
import { definirCanal, definirOperation } from "../infra/operations";

/**
 * Opérations et canaux des services voyageur : bus en direct, réseau, monter en route, course,
 * groupe et cagnotte, covoiturage, sans internet.
 */

/* ------------------------------------------------------------------ mon bus en direct */

export const OP_SUIVI_BUS = definirOperation<{ billetId: string }, c.SuiviBus>({
  nom: "voyageur.suivi.bus",
  methode: "GET",
  chemin: (p) => `/voyageur/billets/${p.billetId}/direct`,
  reponse: c.SchemaSuiviBus,
});

export const CANAL_POSITION_BUS = definirCanal<{ billetId: string }, c.MessagePositionBus>({
  nom: "voyageur.suivi.position",
  chemin: (p) => `/voyageur/billets/${p.billetId}/direct/position`,
  message: c.SchemaMessagePositionBus,
});

export const OP_PREVENIR_PROCHE = definirOperation<
  c.ActiverPrevenirProche,
  c.ResultatPrevenirProche
>({
  nom: "voyageur.suivi.prevenirProche",
  methode: "PUT",
  chemin: (p) => `/voyageur/billets/${p.billetId}/prevenir`,
  corps: (p) => ({ procheId: p.procheId, minutesAvantArrivee: p.minutesAvantArrivee }),
  reponse: c.SchemaResultatPrevenirProche,
});

/* ------------------------------------------------------------------ réseau en direct */

export const OP_RESEAU = definirOperation<c.DemandeReseau, c.ApercuReseau>({
  nom: "voyageur.reseau.apercu",
  methode: "GET",
  chemin: () => "/voyageur/reseau",
  requete: (p) => ({ filtre: p.filtre }),
  reponse: c.SchemaApercuReseau,
});

/* ------------------------------------------------------------------ monter en route */

export const OP_OFFRES_MONTEE = definirOperation<c.DemandeMonteeEnRoute, c.OffresMonteeEnRoute>({
  nom: "voyageur.route.offres",
  methode: "GET",
  chemin: () => "/voyageur/monter-en-route",
  requete: (p) => ({ arretId: p.arretId, lat: p.latitude, lng: p.longitude }),
  reponse: c.SchemaOffresMonteeEnRoute,
});

export const OP_RESERVER_MONTEE = definirOperation<c.ReserverMontee, c.Commande>({
  nom: "voyageur.route.reserver",
  methode: "POST",
  chemin: () => "/voyageur/monter-en-route/commandes",
  corps: (p) => p,
  reponse: c.SchemaCommande,
});

/* ------------------------------------------------------------------ course vers la gare */

export const OP_PROPOSITION_COURSE = definirOperation<{ billetId: string }, c.PropositionCourse>({
  nom: "voyageur.course.proposition",
  methode: "GET",
  chemin: (p) => `/voyageur/billets/${p.billetId}/course`,
  reponse: c.SchemaPropositionCourse,
});

export const OP_RESERVER_COURSE = definirOperation<c.ReserverCourse, c.Course>({
  nom: "voyageur.course.reserver",
  methode: "POST",
  chemin: (p) => `/voyageur/billets/${p.billetId}/course`,
  corps: (p) => ({ mode: p.mode, partirA: p.partirA }),
  reponse: c.SchemaCourse,
});

/* ------------------------------------------------------------------ groupe et cagnotte */

export const OP_GROUPE = definirOperation<c.DemandeGroupe, c.Groupe>({
  nom: "voyageur.groupes.obtenir",
  methode: "GET",
  chemin: (p) => `/voyageur/groupes/${p.groupeId}`,
  reponse: c.SchemaGroupe,
});

export const OP_CREER_GROUPE = definirOperation<c.CreerGroupe, c.Groupe>({
  nom: "voyageur.groupes.creer",
  methode: "POST",
  chemin: () => "/voyageur/groupes",
  corps: (p) => p,
  reponse: c.SchemaGroupe,
});

export const OP_INVITER_GROUPE = definirOperation<c.InviterGroupe, c.ResultatInvitation>({
  nom: "voyageur.groupes.inviter",
  methode: "POST",
  chemin: (p) => `/voyageur/groupes/${p.groupeId}/invitations`,
  corps: (p) => ({ telephones: p.telephones }),
  reponse: c.SchemaResultatInvitation,
});

export const OP_DEVIS_BUS = definirOperation<c.DemandeDevisBus, c.DevisBus>({
  nom: "voyageur.groupes.devisBus",
  methode: "POST",
  chemin: () => "/voyageur/groupes/devis-bus",
  corps: (p) => p,
  reponse: c.SchemaDevisBus,
});

/* ------------------------------------------------------------------ covoiturage */

export const OP_RECHERCHER_COVOIT = definirOperation<c.RechercheCovoit, c.ResultatRechercheCovoit>({
  nom: "voyageur.covoit.rechercher",
  methode: "GET",
  chemin: () => "/voyageur/covoit",
  requete: (p) => ({
    depart: p.depart,
    arrivee: p.arrivee,
    apartirDe: p.apartirDe,
    filtres: p.filtres && p.filtres.length > 0 ? p.filtres.join(",") : undefined,
    prixMax: p.prixMax,
  }),
  reponse: c.SchemaResultatRechercheCovoit,
});

export const OP_RESERVER_COVOIT = definirOperation<c.ReserverCovoit, c.Commande>({
  nom: "voyageur.covoit.reserver",
  methode: "POST",
  chemin: (p) => `/voyageur/covoit/${p.offreId}/reservations`,
  corps: (p) => ({ places: p.places }),
  reponse: c.SchemaCommande,
});

export const OP_FORMULAIRE_PUBLICATION = definirOperation<void, c.FormulairePublication>({
  nom: "voyageur.covoit.formulaire",
  methode: "GET",
  chemin: () => "/voyageur/covoit/conducteur/formulaire",
  reponse: c.SchemaFormulairePublication,
});

export const OP_PUBLIER_TRAJET = definirOperation<c.PublierTrajet, c.TrajetPublie>({
  nom: "voyageur.covoit.publier",
  methode: "POST",
  chemin: () => "/voyageur/covoit/conducteur/trajets",
  corps: (p) => p,
  reponse: c.SchemaTrajetPublie,
});

export const OP_MES_TRAJETS_COVOIT = definirOperation<void, c.MesTrajetsCovoit>({
  nom: "voyageur.covoit.mesTrajets",
  methode: "GET",
  chemin: () => "/voyageur/covoit/conducteur",
  reponse: c.SchemaMesTrajetsCovoit,
});

export const OP_PROPOSER_A_DEMANDE = definirOperation<c.ProposerADemande, c.ResultatProposition>({
  nom: "voyageur.covoit.proposerADemande",
  methode: "POST",
  chemin: (p) => `/voyageur/covoit/conducteur/demandes/${p.demandeId}/propositions`,
  corps: (p) => ({ trajetId: p.trajetId }),
  reponse: c.SchemaResultatProposition,
});

export const OP_TRAJET_REGULIER = definirOperation<void, c.TrajetRegulier>({
  nom: "voyageur.covoit.trajetRegulier",
  methode: "GET",
  chemin: () => "/voyageur/covoit/ville/trajet-regulier",
  reponse: c.SchemaTrajetRegulier,
});

export const OP_DEFINIR_TRAJET_REGULIER = definirOperation<
  c.DefinirTrajetRegulier,
  c.TrajetRegulier
>({
  nom: "voyageur.covoit.definirTrajetRegulier",
  methode: "PUT",
  chemin: () => "/voyageur/covoit/ville/trajet-regulier",
  corps: (p) => p,
  reponse: c.SchemaTrajetRegulier,
});

/* ------------------------------------------------------------------ sans internet */

export const OP_SANS_INTERNET = definirOperation<void, c.ApercuSansInternet>({
  nom: "voyageur.sansInternet.apercu",
  methode: "GET",
  chemin: () => "/voyageur/sans-internet",
  reponse: c.SchemaApercuSansInternet,
});
