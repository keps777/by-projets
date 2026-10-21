import {
  GARDE_COLIS_JOURS,
  ajouterMinutes,
  appliquerColis,
  enMs,
  peutAppliquer,
  MACHINE_COLIS,
  remettreColis,
  CodeRetraitInvalide,
  repartitionRelais,
  verifierCodeRetrait,
  versIsoDouala,
} from "@afrimove/domain";
import type { Colis } from "@afrimove/domain";
import type { colis as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/erreurs";
import { simulerFlux } from "../../infra/scenarios";
import {
  CANAL_MISSIONS_LIVREUR,
  OP_ACCEPTER_MISSION,
  OP_COLIS_RELAIS,
  OP_DISPONIBILITE_LIVREUR,
  OP_ESPACE_LIVREUR,
  OP_ESPACE_RELAIS,
  OP_INVITER_LIVREUR,
  OP_PASSER_MISSION,
  OP_RECEVOIR_COLIS_RELAIS,
  OP_REMETTRE_COLIS_LIVREUR,
  OP_REMETTRE_COLIS_RELAIS,
  OP_RETIRER_GAINS_LIVREUR,
  OP_SIGNALER_ABSENCE_LIVREUR,
} from "../operations";
import {
  colisDeLaPlanche,
  decimal,
  entierDe,
  heureDans,
  installer,
  installerPartenaire,
  isoDu,
  jourDe,
  lire,
  masquerTelephone,
  sansPuce,
  slug,
  versColisPartenaire,
} from "./outils";
import type { DonneesScenario, ScenarioEnConstruction } from "./outils";

/** Trois essais de code de retrait, puis le colis est bloqué (le serveur limite les essais). */
export const ESSAIS_CODE_MAX = 3;

/** Compte les essais de code par colis et refuse au-delà de `ESSAIS_CODE_MAX`. */
class EssaisCode {
  private readonly essais = new Map<string, number>();

  verifierNonBloque(cle: string): void {
    if ((this.essais.get(cle) ?? 0) >= ESSAIS_CODE_MAX) {
      throw new ErreurHttp(423, "Trop d'essais : le colis est bloqué", "code_bloque");
    }
  }

  /** Enregistre un essai faux et lève l'erreur adaptée. Le code saisi n'est jamais répété. */
  echec(cle: string): never {
    const n = (this.essais.get(cle) ?? 0) + 1;
    this.essais.set(cle, n);
    if (n >= ESSAIS_CODE_MAX) {
      throw new ErreurHttp(423, "Trop d'essais : le colis est bloqué", "code_bloque");
    }
    throw new ErreurHttp(422, "Code incorrect", "code_invalide", {
      essaisRestants: ESSAIS_CODE_MAX - n,
    });
  }
}

/* ------------------------------------------------------------------ RelaisApp (38) */

interface DonneesRelaisApp {
  boutique: { _personneId: string; nom: string; detail: string; note: string };
  resume: { libelle: string; valeur: number; sur?: number; detail?: string }[];
  remise: { _colisId: string; verification: string };
  enGarde: {
    liste: { _colisId: string; detail: string; rappel?: string }[];
  };
  action: string;
}

export function installerRelaisApp(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesRelaisApp>(d);
  const jour = jourDe(d.horloge);
  const colis = new Map<string, Colis>((d.entites.colis ?? []).map((x) => [x.id, x]));
  const essais = new EssaisCode();
  const gainParRemise = repartitionRelais().relais;

  const [garde, arrivent, semaine] = e.resume;
  let enGarde = garde?.valeur ?? 0;
  let remisSemaine = Number(/(\d+) remis/.exec(semaine?.detail ?? "")?.[1] ?? 0);
  let gainSemaine = semaine?.valeur ?? 0;
  const [jourVersement = "lundi", moyen = "MoMo"] = sansPuce(
    (semaine?.detail ?? "").split("·").pop() ?? "",
  ).split(" ");
  let remiseEnCours: string | null = e.remise._colisId;
  const aRetirer = new Set<string>();
  const dansLaListe = new Map(e.enGarde.liste.map((l) => [l._colisId, l]));

  const trouver = (cle: string): Colis => {
    const trouve = colis.get(cle) ?? [...colis.values()].find((x) => x.numero === cle);
    if (!trouve) throw new ErreurHttp(404, "Colis introuvable", "colis_introuvable");
    return trouve;
  };

  installerPartenaire(sc, OP_ESPACE_RELAIS, () => {
    const ouvert = /ouvert/.test(e.boutique.detail);
    const courant = remiseEnCours ? colis.get(remiseEnCours) : undefined;
    const liste: c.EspaceRelais["enGarde"] = [];
    for (const [id, ligne] of dansLaListe) {
      const x = colis.get(id);
      if (!x || aRetirer.has(id) || x.etat !== "en_relais") continue;
      const jours = Number(
        /depuis (\d+) j/.exec(`${ligne.detail} ${ligne.rappel ?? ""}`)?.[1] ?? 0,
      );
      liste.push({
        colis: versColisPartenaire(x),
        depuisJours: jours,
        joursRestants: Math.max(0, GARDE_COLIS_JOURS - jours),
        rappelEnvoye: /rappel envoyé/.test(ligne.rappel ?? ""),
      });
    }
    return {
      boutique: {
        id: `relais-${slug(e.boutique.nom)}`,
        nom: e.boutique.nom,
        detail: e.boutique.detail,
        ouvert,
        note: decimal(e.boutique.note.replace("★", "")),
      },
      resume: {
        enGarde,
        capacite: garde?.sur ?? 0,
        arrivent: {
          nombre: arrivent?.valeur ?? 0,
          vers: heureDans(arrivent?.detail ?? "")
            ? isoDu(jour, heureDans(arrivent?.detail ?? "")!)
            : null,
        },
        semaine: {
          gain: gainSemaine,
          remis: remisSemaine,
          versement: { jour: jourVersement, moyen },
        },
      },
      gainParRemise,
      remiseEnCours: courant
        ? {
            colis: versColisPartenaire(courant),
            consigne: e.remise.verification.split(". ").slice(1).join(". "),
          }
        : null,
      enGarde: liste,
      gardeJours: GARDE_COLIS_JOURS,
    };
  });

  installerPartenaire(sc, OP_COLIS_RELAIS, ({ colisId }) => versColisPartenaire(trouver(colisId)));

  installerPartenaire(sc, OP_RECEVOIR_COLIS_RELAIS, ({ numeroColis }, ctx) => {
    const x = trouver(numeroColis);
    const recuLe = ctx.horloge.iso();
    if (x.etat === "en_relais") return { colis: versColisPartenaire(x), recuLe };
    if (!peutAppliquer(MACHINE_COLIS, x.etat, "envoyer_en_relais")) {
      throw new ErreurHttp(409, "Ce colis ne peut pas être reçu maintenant", "etat_incompatible");
    }
    const recu = appliquerColis(x, "envoyer_en_relais", { at: recuLe });
    colis.set(recu.id, recu);
    enGarde += 1;
    return { colis: versColisPartenaire(recu), recuLe };
  });

  installerPartenaire(sc, OP_REMETTRE_COLIS_RELAIS, async (p, ctx) => {
    const x = trouver(p.colisId);
    if (x.etat !== "en_relais") {
      throw new ErreurHttp(409, "Ce colis n'est pas en garde chez vous", "etat_incompatible");
    }
    essais.verifierNonBloque(x.id);
    const remisLe = ctx.horloge.iso();
    let remis: Colis;
    try {
      remis = await remettreColis(x, p.code, { at: remisLe });
    } catch (err) {
      if (err instanceof CodeRetraitInvalide) essais.echec(x.id);
      throw err;
    }
    colis.set(remis.id, remis);
    aRetirer.add(remis.id);
    if (remiseEnCours === remis.id) remiseEnCours = null;
    enGarde = Math.max(0, enGarde - 1);
    remisSemaine += 1;
    gainSemaine += gainParRemise;
    return { colis: versColisPartenaire(remis), remisLe, gain: gainParRemise };
  });
}

/* ------------------------------------------------------------------ Livreur (39) */

interface DonneesLivreur {
  livreur: {
    _personneId: string;
    initiales: string;
    nom: string;
    detail: string;
    inviter: string;
  };
  mission: {
    _colisId: string;
    decompte: string;
    trajet: string;
    detail: string;
    gain: { montant: number };
  };
  regles: { titre: string; texte: string };
  bilan: { libelle: string; valeur: number | string; detail: string }[];
  pieces: { etat: string; liste: { libelle: string; valeur: string }[] };
  retrait: { libelle: string };
}

type EtatMission = "proposee" | "acceptee" | "passee" | "expiree" | "livree";

/** Relais de repli du livreur quand le destinataire est absent : celui de la planche « Livraison ». */
const RELAIS_DE_REPLI = { id: "relais-boutique-mama-fotso", nom: "Boutique Mama Fotso" };

export function installerLivreur(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesLivreur>(d);
  const colisPlanche = colisDeLaPlanche(d, e.mission._colisId);
  let colis: Colis = colisPlanche;
  const essais = new EssaisCode();

  const [, ville = "", noteTexte = "0"] = e.livreur.detail.split("·").map((s) => s.trim());
  const numero = Number(/n° (\d+)/.exec(e.livreur.detail)?.[1] ?? 0);
  const seuil = entierDe(/dès ([\d ]+) F/.exec(e.retrait.libelle)?.[1] ?? "0");
  const [aujourdhui, gagne, semaine] = e.bilan;
  const secondes = (() => {
    const m = /(\d+):(\d{2})/.exec(e.mission.decompte);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 30;
  })();
  const [depart = "", fin = ""] = e.mission.trajet.split("→").map((s) => s.trim());
  const [arrivee = "", chez = ""] = fin.split(",").map((s) => s.trim());
  const destinataire = chez.replace(/^chez\s+/, "") || colis.destinataire.nom;
  const distanceM = Math.round(decimal(/([\d,]+)\s*km/.exec(e.mission.detail)?.[1] ?? "0") * 1000);
  const dureeMinutes = Number(/(\d+)\s*min/.exec(e.mission.detail)?.[1] ?? 1);
  const missionId = `mission-${colisPlanche.numero.toLowerCase()}`;
  const expireA = versIsoDouala(enMs(d.maintenant) + secondes * 1000);

  let disponible = (d.visuel["disponible"] as boolean | undefined) ?? true;
  let etat: EtatMission = "proposee";
  let ouvertA: number | null = null;
  let livraisonsJour = entierDe(aujourdhui?.valeur ?? 0);
  let gainJour = entierDe(gagne?.valeur ?? 0);
  let livraisonsSemaine = Number(/(\d+) livraisons/.exec(semaine?.detail ?? "")?.[1] ?? 0);
  let gainSemaine = entierDe(semaine?.valeur ?? 0);
  let solde = gainJour;

  const missionVue = (): c.MissionLivraison => ({
    id: missionId,
    colis: versColisPartenaire(colis),
    trajet: { depart, arrivee, destinataire },
    distanceM,
    dureeMinutes,
    gain: e.mission.gain.montant,
    delaiAcceptationSecondes: 30,
    expireA,
    remiseContreCode: true,
  });

  /** Une proposition non acceptée dans le délai passe au livreur suivant. */
  const verifierDelai = (ctx: { horloge: { maintenant(): number } }): void => {
    ouvertA ??= ctx.horloge.maintenant();
    if (etat === "proposee" && ctx.horloge.maintenant() - ouvertA >= secondes * 1000) {
      etat = "expiree";
    }
  };

  const verifierMission = (id: string): void => {
    if (id !== missionId) throw new ErreurHttp(404, "Mission introuvable", "mission_introuvable");
  };

  installerPartenaire(sc, OP_ESPACE_LIVREUR, (_p, ctx) => {
    verifierDelai(ctx);
    return {
      livreur: {
        id: e.livreur._personneId,
        initiales: e.livreur.initiales,
        nom: e.livreur.nom,
        numero,
        ville,
        note: decimal(noteTexte.replace("★", "")),
        disponible,
      },
      mission: etat === "proposee" && disponible ? missionVue() : null,
      regles: e.regles,
      bilan: {
        aujourdhui: { livraisons: livraisonsJour, gain: gainJour },
        versement: gagne?.detail ?? "",
        semaine: { livraisons: livraisonsSemaine, gain: gainSemaine },
      },
      pieces: {
        aJour: /à jour/.test(e.pieces.etat),
        liste: e.pieces.liste.map((p) => ({
          type: p.libelle
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
          libelle: p.libelle,
          valeur: p.valeur,
        })),
      },
      retrait: { solde, seuil },
    };
  });

  installerPartenaire(sc, OP_DISPONIBILITE_LIVREUR, (p) => {
    disponible = p.disponible;
    return { disponible };
  });

  installerPartenaire(sc, OP_ACCEPTER_MISSION, (p, ctx) => {
    verifierMission(p.missionId);
    verifierDelai(ctx);
    if (etat === "expiree") {
      throw new ErreurHttp(410, "La mission est passée au livreur suivant", "mission_expiree");
    }
    if (etat !== "proposee") {
      throw new ErreurHttp(409, "Mission déjà traitée", "mission_deja_traitee");
    }
    const accepteeLe = ctx.horloge.iso();
    colis = appliquerColis(colis, "mettre_en_livraison", {
      at: accepteeLe,
      par: e.livreur._personneId,
    });
    etat = "acceptee";
    return { missionId, acceptee: true as const, accepteeLe, colis: versColisPartenaire(colis) };
  });

  installerPartenaire(sc, OP_PASSER_MISSION, (p) => {
    verifierMission(p.missionId);
    if (etat !== "proposee" && etat !== "expiree") {
      throw new ErreurHttp(409, "Mission déjà traitée", "mission_deja_traitee");
    }
    etat = "passee";
    return { missionId, passee: true as const };
  });

  installerPartenaire(sc, OP_REMETTRE_COLIS_LIVREUR, async (p, ctx) => {
    verifierMission(p.missionId);
    if (etat !== "acceptee") {
      throw new ErreurHttp(409, "Acceptez la mission avant la remise", "mission_non_acceptee");
    }
    essais.verifierNonBloque(colis.id);
    const ok = await verifierCodeRetrait(p.code, colis.codeRetraitHache, colis.codeRetraitSel);
    if (!ok) essais.echec(colis.id);
    const livreLe = ctx.horloge.iso();
    colis = appliquerColis(colis, "livrer", { at: livreLe, par: e.livreur._personneId });
    etat = "livree";
    const gain = e.mission.gain.montant;
    livraisonsJour += 1;
    livraisonsSemaine += 1;
    gainJour += gain;
    gainSemaine += gain;
    solde += gain;
    return {
      missionId,
      colis: versColisPartenaire(colis),
      livreLe,
      gain,
      photoTransmise: true,
    };
  });

  installerPartenaire(sc, OP_SIGNALER_ABSENCE_LIVREUR, (p, ctx) => {
    verifierMission(p.missionId);
    if (etat !== "acceptee") {
      throw new ErreurHttp(409, "Aucune livraison en cours", "mission_non_acceptee");
    }
    const attenteMinutes = Number(/(\d+) min/.exec(e.regles.texte)?.[1] ?? 10);
    return {
      missionId,
      attenteMinutes,
      attenteJusqua: ajouterMinutes(ctx.horloge.iso(), attenteMinutes),
      relaisDeRepli: RELAIS_DE_REPLI,
    };
  });

  installerPartenaire(sc, OP_RETIRER_GAINS_LIVREUR, (p, ctx) => {
    const montant = p.montant ?? solde;
    if (solde < seuil) {
      throw new ErreurHttp(422, `Retrait possible dès ${seuil} F`, "seuil_non_atteint");
    }
    if (montant <= 0 || montant > solde) {
      throw new ErreurHttp(422, "Montant de retrait invalide", "montant_invalide");
    }
    solde -= montant;
    return { montant, moyen: "MoMo", demandeLe: ctx.horloge.iso() };
  });

  installer(sc, OP_INVITER_LIVREUR, (p, ctx) => ({
    envoyeA: masquerTelephone(p.telephone),
    envoyeLe: ctx.horloge.iso(),
  }));

  sc.flux.push(
    simulerFlux(CANAL_MISSIONS_LIVREUR, (_p, ctx) => {
      ouvertA ??= ctx.horloge.maintenant();
      if (etat !== "proposee" || !disponible) return;
      ctx.emettre({ type: "proposee", mission: missionVue() });
      ctx.planifier(secondes * 1000, () => {
        if (etat === "proposee") {
          etat = "expiree";
          ctx.emettre({ type: "expiree", missionId });
        }
      });
    }),
  );
}
