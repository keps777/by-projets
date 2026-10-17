import type { patron as c } from "@afrimove/contrats";
import { ALPHA_AKWA, ALPHA_BAFOUSSAM, ALPHA_MVAN, GARES, heure } from "@afrimove/fixtures";
import { implementer } from "../../infra/scenarios";
import { OP_EQUIPE, OP_FICHE_PERSONNE, OP_GARE, OP_GARES } from "../operations";
import { introuvable } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";
import {
  dateFrancaise,
  entier,
  instantFrancais,
  minutes,
  montant,
  nombreAvant,
  pourcent,
  segments,
} from "./lecture";

/** Gares, équipe et fiche personne vues par le patron (planches PatronEquipe/Gare/Personne, ConfigEquipeListe). */

export function roleDepuis(texte: string): c.RoleEquipe {
  const t = texte.toLowerCase();
  if (t.startsWith("guichet")) return "guichetier";
  if (t.startsWith("superv")) return "superviseur";
  if (t.startsWith("convoy")) return "convoyeur";
  if (t.startsWith("chauff")) return "chauffeur";
  if (t.startsWith("agent relais") || t.startsWith("relais")) return "relais";
  if (t.startsWith("comptable")) return "comptable";
  throw new Error(`Rôle inconnu dans la fixture : ${texte}`);
}

export function etatDepuis(texte: string): c.EtatPersonne {
  const t = texte.toLowerCase();
  if (t.includes("bloqu")) return "bloquee";
  if (t.includes("à bord")) return "a_bord";
  if (t.includes("en route")) return "en_route";
  if (t.includes("repos")) return "repos";
  if (t.includes("indisponible")) return "indisponible";
  return "en_service";
}

const GARES_ALPHA = [ALPHA_AKWA, ALPHA_MVAN, ALPHA_BAFOUSSAM] as const;
function gareDepuis(nom: string) {
  const g = GARES_ALPHA.find((x) => x.nom.toLowerCase().includes(nom.toLowerCase()));
  if (!g) throw new Error(`Gare inconnue dans la fixture : ${nom}`);
  return g;
}

const VILLES = new Map(GARES.map((g) => [g.id, g.ville]));

/* ----------------------------------------------------------------------- mes gares, mes gens */

function vueGares(src: SourceFixtures): c.VueGares {
  const e = src.ecran("PatronEquipe");
  const d = e.donnees;
  const reperes = d.repere.map((r) => ({
    code:
      r.libelle === "Le plus régulier"
        ? ("plus_regulier" as const)
        : r.libelle.startsWith("À voir")
          ? ("a_voir" as const)
          : ("paie_du_mois" as const),
    libelle: r.libelle,
    valeur: r.valeur,
  }));
  const paie = d.repere.find((r) => r.libelle === "Paie du mois")!.valeur;
  return {
    instant: e.maintenant,
    nbPersonnes: nombreAvant(d.detail, "personnes") ?? 0,
    nbBus: nombreAvant(d.detail, "bus") ?? 0,
    enService: entier(d.badge),
    gares: d.gares.liste.map((g) => {
      const [nom = "", ...reste] = segments(g.nom);
      const gare = gareDepuis(nom);
      const horsLigne = /hors ligne\s+(\d+)\s*min/.exec(g.etat);
      const sync = /(\d+)\s*\/\s*(\d+)\s*sync/.exec(g.etat);
      const nbGuichets = nombreAvant(g.detail, "guichet") ?? 0;
      const ecart = /écart\s*([−-]?\s*[\d  ]+)/.exec(g.etat);
      return {
        id: gare.id,
        nom,
        ville: VILLES.get(gare.id) ?? gare.ville,
        responsable: reste[reste.length - 1] ?? "",
        nbGuichets,
        nbQuais: nombreAvant(g.detail, "quai") ?? 0,
        caisse: g.caisse,
        synchro: sync
          ? { guichetsSynchronises: Number(sync[1]), guichets: Number(sync[2]) }
          : { guichetsSynchronises: 0, guichets: nbGuichets },
        ecartTotal: horsLigne || !ecart ? null : entier(ecart[1]!),
        horsLigneDepuisMinutes: horsLigne ? Number(horsLigne[1]) : null,
      };
    }),
    effectifs: d.effectifs.map((x) => ({
      role: roleDepuis(x.libelle),
      nombre: x.nombre,
      enService: entier(x.detail),
    })),
    personnes: d.gens.personnes.map((p) => {
      const [role = "", lieu = ""] = segments(p.role);
      return {
        id: p._personneId,
        nom: p.nom,
        initiales: p.initiales,
        role: roleDepuis(role),
        lieu,
        indicateur: p.detail,
        etat: etatDepuis(p.etat),
      };
    }),
    reperes,
    paie: {
      nbSalaires: entier(paie),
      jourDuMois: Number(/le (\d+)/.exec(paie)?.[1] ?? 30),
      mode: "momo",
    },
  };
}

/* ----------------------------------------------------------------------- une gare */

function detailAkwa(src: SourceFixtures): c.DetailGare {
  const e = src.ecran("PatronGare");
  const d = e.donnees;
  const [supervision = "", ...reste] = segments(d.detail);
  const chiffre = (libelle: string) => d.chiffres.find((x) => x.libelle === libelle)!;
  const sync = /(\d+)\s*\/\s*(\d+)/.exec(d.synchro)!;
  const guichets: c.DetailGare["guichets"] = d.guichets.liste.map((g) => {
    const [titre = "", nom = ""] = segments(g.nom);
    const bloque = /bloquée depuis (\d{2}:\d{2})/.exec(g.detail);
    const sync14 = /sync (\d{2}:\d{2})/.exec(g.etat);
    const ecart = /écart\s*([−-]\s*[\d  ]+)/.exec(g.detail);
    return {
      rang: entier(titre),
      personne: { id: g._personneId, nom, initiales: g.initiales },
      sessionId: "_sessionId" in g ? (g._sessionId as string) : null,
      billets: nombreAvant(g.detail, "billets") ?? 0,
      colis: nombreAvant(g.detail, "colis") ?? 0,
      caisse: g.caisse,
      ecart: ecart ? entier(ecart[1]!) : 0,
      etat: bloque ? "bloque" : "synchronise",
      derniereSyncA: sync14 ? heure(sync14[1]!) : null,
      bloqueDepuis: bloque ? heure(bloque[1]!) : null,
      clotureAttendPin: /attend PIN/.test(g.detail),
    };
  });
  const quais: c.DetailGare["quais"] = d.quais.liste.map((q) => {
    const [h = "00:00", trajet = "", ...autres] = segments(q.depart);
    const [origine = "", destination = ""] = trajet.split("→").map((s) => s.trim());
    const bus = autres.find((s) => /^LT \d+ AB$/.test(s)) ?? "";
    const infos = segments(q.detail);
    const plein = infos.find((s) => /^\d+\s*\/\s*\d+$/.test(s))!;
    const [remplis, capacite] = plein.split("/").map((n) => Number(n.trim())) as [number, number];
    const embarquement = infos.map((s) => /^embarquement (\d{2}:\d{2})$/.exec(s)).find(Boolean);
    const personnes = infos.filter((s) => s !== plein && !/^embarquement/.test(s));
    const noms = personnes.filter((s) => !/\d/.test(s));
    return {
      departId: q._departId,
      heureDepart: heure(h),
      origine,
      destination,
      bus,
      chauffeur: noms[0] ?? "",
      convoyeur: noms[1] ?? null,
      remplis,
      capacite,
      embarquementA: embarquement ? heure(embarquement[1]!) : null,
      note: personnes.find((s) => /\d/.test(s)) ?? null,
    };
  });
  return {
    gare: { id: ALPHA_AKWA.id, nom: "Akwa", ville: ALPHA_AKWA.ville },
    superviseur: supervision.replace(/^Superviseure?\s+/, ""),
    nbGuichets: nombreAvant(reste.join(" · "), "guichets") ?? guichets.length,
    nbQuais: nombreAvant(reste.join(" · "), "quais") ?? quais.length,
    instant: e.maintenant,
    synchro: { guichetsSynchronises: Number(sync[1]), guichets: Number(sync[2]) },
    chiffres: {
      caisse: guichets.reduce((somme, g) => somme + g.caisse, 0),
      caisseDepuis: heure(/(\d{2}:\d{2})/.exec(chiffre("Caisse").detail)![1]!),
      billets: entier(chiffre("Billets").valeur),
      remplissagePct: pourcent(chiffre("Billets").detail),
      colis: entier(chiffre("Colis").valeur),
      colisAuRelais: entier(chiffre("Colis").detail),
      ecart: entier(chiffre("Écart").valeur),
      ecartGuichet: Number(/guichet (\d+)/.exec(chiffre("Écart").detail)?.[1] ?? "") || null,
    },
    guichets,
    quais,
    journal: d.journal.evenements.map((ev) => ({
      at: heure(ev.heure),
      texte: ev.texte.replace(/^·\s*/, ""),
      etat: ev.etat === "tracé" ? "trace" : ev.etat === "attend PIN" ? "attend_pin" : "ouvert",
      cibleId:
        "_billetId" in ev
          ? (ev._billetId as string)
          : "_sessionId" in ev
            ? (ev._sessionId as string)
            : null,
    })),
  };
}

/** Pour les gares sans planche de détail (Mvan, Bafoussam) : ce que la liste en sait, rien de plus. */
function detailMinimal(src: SourceFixtures, resume: c.GareResume): c.DetailGare {
  return {
    gare: { id: resume.id, nom: resume.nom, ville: resume.ville },
    superviseur: resume.responsable,
    nbGuichets: resume.nbGuichets,
    nbQuais: resume.nbQuais,
    instant: src.ecran("PatronEquipe").maintenant,
    synchro: resume.synchro,
    chiffres: {
      caisse: resume.caisse,
      caisseDepuis: heure("05:30"),
      billets: 0,
      remplissagePct: 0,
      colis: 0,
      colisAuRelais: 0,
      ecart: resume.ecartTotal ?? 0,
      ecartGuichet: null,
    },
    guichets: [],
    quais: [],
    journal: [],
  };
}

/* ----------------------------------------------------------------------- une personne */

function fichePersonne(src: SourceFixtures): c.FichePersonne {
  const e = src.ecran("PatronPersonne");
  const d = e.donnees;
  const [roleTexte = "", lieu = "", depuis = ""] = segments(d.detail);
  const [masque = "", operateur = "MTN"] = segments(d.fiche.telephone);
  const chiffre = (libelle: string) => d.chiffres.find((x) => x.libelle === libelle)!;
  const journal = d.journal.lignes.map((l) => ({
    quand: instantFrancais(l.quand),
    cashCompte: entier(/compté\s*(\d[\d  ]*)/.exec(l.detail)![1]!),
    cashAttendu: entier(/attendu\s*(\d[\d  ]*)/.exec(l.detail)![1]!),
    ecart: l.ecart,
    validePar: d.journal.aide.replace(/^validés\s+/, ""),
  }));
  const parJour = new Map(journal.map((j) => [Number(j.quand.slice(8, 10)), j.ecart]));
  const ecarts = chiffre("Écarts");
  return {
    personne: {
      id: d.fiche._personneId,
      nom: d.titre,
      initiales: d.fiche.initiales,
      role: roleDepuis(roleTexte),
      lieu,
      depuis: dateFrancaise(depuis).jour,
      telephoneMasque: masque,
      operateur: operateur === "Orange" ? "Orange" : "MTN",
      salaire: entier(d.fiche.salaire),
      jourDePaie: Number(/le (\d+)/.exec(d.fiche.salaire)?.[1] ?? 30),
      superviseur: d.fiche.superviseur.replace(/^Superviseure?\s*:\s*/, ""),
      etat: etatDepuis(d.fiche.etat),
      enServiceDepuis: heure(/(\d{2}:\d{2})/.exec(d.fiche.depuis)![1]!),
    },
    chiffres: {
      periodeJours: entier(chiffre("Billets").detail),
      billets: entier(chiffre("Billets").valeur),
      colis: entier(chiffre("Colis").valeur),
      litiges: entier(chiffre("Colis").detail),
      annulations: entier(chiffre("Annul.").valeur),
      tauxAnnulationPct: pourcent(chiffre("Annul.").detail),
      ecarts: {
        nombre: entier(ecarts.valeur),
        total: montant(segments(ecarts.detail)[1]!),
        sur: entier(ecarts.detail),
      },
    },
    ecarts: {
      tolerance: entier(/(\d+)/.exec(d.ecarts.tolerance)![1]!),
      jours: d.ecarts.jours.map((jour) => ({
        jour: `2026-12-${String(jour).padStart(2, "0")}`,
        ecart: parJour.get(jour) ?? 0,
      })),
      lecture: d.ecarts.lecture,
    },
    journal,
  };
}

/* ----------------------------------------------------------------------- l'équipe */

/** Les personnes connues des planches (liste filtrable des réglages + « mes gens » du patron). */
function effectif(src: SourceFixtures): c.PersonneResume[] {
  const liste = src.ecran("ConfigEquipeListe").donnees.popup.personnes.map(
    (p): c.PersonneResume => ({
      id: p._personneId,
      nom: p.nom,
      initiales: p.initiales,
      role: "guichetier",
      lieu: p.lieu,
      indicateur: p.detail,
      etat: etatDepuis(p.detail),
    }),
  );
  const vus = new Set(liste.map((p) => p.id));
  for (const p of vueGares(src).personnes) if (!vus.has(p.id)) liste.push(p);
  return liste;
}

function listeEquipe(src: SourceFixtures, filtre: c.FiltreEquipe): c.ListeEquipe {
  const popup = src.ecran("ConfigEquipeListe").donnees.popup;
  const recherche = filtre.recherche?.trim().toLowerCase();
  const personnes = effectif(src).filter(
    (p) =>
      (!filtre.role || p.role === filtre.role) &&
      (!recherche || `${p.nom} ${p.lieu}`.toLowerCase().includes(recherche)),
  );
  const roles = popup.roles.map((r) => ({ role: roleDepuis(r.role), nombre: r.nombre }));
  const total = entier(/(\d+)\s*personnes/.exec(popup.titre)?.[1] ?? "0");
  return {
    total,
    roles,
    personnes,
    resume: {
      role: filtre.role ?? null,
      total: filtre.role ? (roles.find((r) => r.role === filtre.role)?.nombre ?? 0) : total,
      enService: personnes.filter((p) => ["en_service", "a_bord", "en_route"].includes(p.etat))
        .length,
      bloquees: personnes.filter((p) => p.etat === "bloquee").length,
    },
  };
}

export function mockEquipe(src: SourceFixtures): ContributionMock {
  return {
    operations: [
      implementer(OP_GARES, () => vueGares(src)),
      implementer(OP_GARE, ({ gareId }) => {
        if (gareId === ALPHA_AKWA.id) return detailAkwa(src);
        const resume = vueGares(src).gares.find((g) => g.id === gareId);
        if (!resume) throw introuvable("Gare", "GARE_INCONNUE", gareId);
        return detailMinimal(src, resume);
      }),
      implementer(OP_EQUIPE, (filtre) => listeEquipe(src, filtre)),
      implementer(OP_FICHE_PERSONNE, ({ personneId }) => {
        const fiche = fichePersonne(src);
        if (fiche.personne.id !== personneId) {
          throw introuvable("Personne", "PERSONNE_INCONNUE", personneId);
        }
        return fiche;
      }),
    ],
    flux: [],
  };
}
