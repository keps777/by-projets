import { patron as c } from "@afrimove/contrats";
import {
  minuitSuivantDoualaMs,
  versIsoDouala,
  ajouterHeures,
  ajouterMinutes,
} from "@afrimove/domain";
import {
  ALPHA_AKWA,
  ALPHA_BAFOUSSAM,
  ALPHA_DLA_BAF,
  ALPHA_MVAN,
  LIGNES,
  heure,
  jourDecale,
} from "@afrimove/fixtures";
import { implementer } from "../../infra/scenarios";
import {
  OP_CHANGER_COMPTE_MOMO,
  OP_CONFIRMER_COMPTE_MOMO,
  OP_CREER_LIGNE,
  OP_CREER_PERSONNE,
  OP_DESACTIVER_PERSONNE,
  OP_ENREGISTRER_REGLES,
  OP_LANCER_PAIE,
  OP_LIGNE_EDITABLE,
  OP_MODIFIER_LIGNE,
  OP_MODIFIER_PERSONNE,
  OP_PERSONNE_EDITABLE,
  OP_PIN_PROVISOIRE,
  OP_REGLAGES,
  OP_REGLES,
} from "../operations";
import { conflit, creerJournal, introuvable, lireCommande } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { dateFrancaise, entier, nombreAvant, segments } from "./lecture";
import { etatDepuis, roleDepuis } from "./equipe";
import { ErreurHttp } from "../../infra/erreurs";

/** Réglages du patron : lignes, départs, tarifs, arrêts, plan de sièges, personnes, règles, comptes MoMo. */

/* ----------------------------------------------------------------------- règles */

const GRATUITE: ReadonlyArray<readonly [RegExp, c.ReglesAgence["annulation"]["gratuiteJusqua"]]> = [
  [/^1 h/, "1h_avant"],
  [/^2 h/, "2h_avant"],
  [/veille/, "veille_20h"],
  [/jamais/, "jamais"],
];
const RETENUE: ReadonlyArray<readonly [RegExp, c.ReglesAgence["annulation"]["retenue"]]> = [
  [/selon la classe/, "selon_classe"],
  [/^10 %/, "dix_pct"],
  [/^50 %/, "cinquante_pct"],
  [/pas de remboursement/, "aucun_remboursement"],
];
const AU_DELA: ReadonlyArray<readonly [RegExp, c.ReglesAgence["caisse"]["auDela"]]> = [
  [/patron prévenu/, "pin_superviseur_et_patron"],
  [/PIN superviseur/, "pin_superviseur"],
  [/bloque/, "bloque_guichet"],
];

function choisir<T>(table: ReadonlyArray<readonly [RegExp, T]>, texte: string): T {
  const trouve = table.find(([re]) => re.test(texte));
  if (!trouve) throw new Error(`Valeur de règle inconnue dans la fixture : ${texte}`);
  return trouve[1];
}

function reglesInitiales(src: SourceFixtures): c.ReglesAgence {
  const d = src.ecran("ConfigRegles").donnees;
  const config = src.ecran("Config");
  const interrupteurs = config.visuel["interrupteurs"] as {
    cadenceNumeroObligatoire: boolean;
    fraisServiceAgence: boolean;
  };
  return {
    annulation: {
      gratuiteJusqua: choisir(GRATUITE, d.annulation.gratuite.valeur),
      retenue: choisir(RETENUE, d.annulation.retenue.valeur),
      retenueParClassePct: {
        classique: Number(/classique (\d+) %/.exec(d.annulation.retenue.valeur)?.[1] ?? 10),
        vip: Number(/VIP (\d+) %/.exec(d.annulation.retenue.valeur)?.[1] ?? 20),
      },
    },
    caisse: {
      toleranceEcart: entier(d.caisse.tolerance.valeur),
      auDela: choisir(AU_DELA, d.caisse.audela.valeur),
    },
    cadence: { numeroObligatoire: interrupteurs.cadenceNumeroObligatoire },
    fraisService: {
      montant: Number(/\((\d+) F\)/.exec(config.donnees.regles.fraisService)?.[1] ?? 250),
      priseEnChargeParAgence: interrupteurs.fraisServiceAgence,
    },
    comptesMomo: {
      mtn: { numeroMasque: d.momo.mtn.valeur },
      orange: { numeroMasque: d.momo.orange.valeur },
    },
  };
}

/* ----------------------------------------------------------------------- lignes */

function ligneEditableInitiale(src: SourceFixtures): c.LigneEditable {
  const e = src.ecran("ConfigLigne");
  const d = e.donnees;
  const departs: c.DepartEditable[] = d.departs.liste.map((x) => ({
    id: "_departId" in x ? (x._departId as string) : null,
    heure: x.heure,
    heureInitiale: /était (\d{2}:\d{2})/.exec(x.detail)?.[1] ?? null,
    classe: /vip/i.test(x.detail) ? "vip" : "classique",
    prix: x.prix,
    actif: x.actif,
    note:
      segments(x.detail).find(
        (s) =>
          !/^(classique|nouveau)$/i.test(s) &&
          !/^LT \d+ AB$/.test(s) &&
          !/\bpl\.$/.test(s) &&
          !/^était/.test(s) &&
          !/seulement/.test(s),
      ) ?? null,
    jours: /mardi seulement/.test(x.detail) ? ["mar"] : [],
    nouveau: /^nouveau/.test(x.detail),
  }));
  const options = d.interrupteurs;
  return {
    id: ALPHA_DLA_BAF.id,
    nom: d.titre,
    departs,
    tarifs: {
      classique: entier(d.tarifs.classique.valeur),
      vip: entier(d.tarifs.vip.valeur),
      bagage: entier(d.tarifs.bagage.valeur),
    },
    arrets: d.arrets.liste.map((a) => ({
      nom: a.nom,
      prorata: entier(/prorata\s*([\d  ]+)/.exec(a.detail)![1]!),
      montee: /montée OK/.test(a.detail),
    })),
    plan: {
      capacite: nombreAvant(d.plan.resume, "places") ?? 0,
      disposition: /(\d(?:\+\d)+)/.exec(d.plan.detail)![1]!,
      rangees: nombreAvant(d.plan.detail, "rangées") ?? 0,
    },
    options: {
      venteEnLigne: options.find((o) => /Vente en ligne/.test(o.libelle))?.actif ?? false,
      fusionAuto: options.find((o) => /Fusion automatique/.test(o.libelle))?.actif ?? false,
    },
    brouillon: {
      modifications: nombreAvant(d.actions.publier.detail, "changements") ?? 0,
      publicationA: heure("00:00", jourDecale(6)),
    },
  };
}

/* ----------------------------------------------------------------------- personnes */

function personneInitiale(src: SourceFixtures): c.PersonneEditable {
  const d = src.ecran("ConfigPersonne").donnees;
  const ch = d.champs;
  const [, , depuis = ""] = segments(d.detail);
  const gare = [ALPHA_AKWA, ALPHA_MVAN, ALPHA_BAFOUSSAM].find((g) =>
    ch.gare.valeur.toLowerCase().includes(g.nom.toLowerCase().split(" ").pop()!),
  );
  const droits = d.droits.liste;
  return {
    id: ch._personneId,
    nom: ch.nom.valeur,
    telephone: `+237${ch.telephone.valeur.replace(/\D/g, "")}`,
    operateur: ch.operateur.valeur === "Orange" ? "Orange" : "MTN",
    role: roleDepuis(ch.role.valeur),
    gareId: gare?.id ?? null,
    guichet:
      /(\d)/.exec(ch.guichet.valeur)?.[1] ?? (/nuit/i.test(ch.guichet.valeur) ? "nuit" : null),
    salaire: entier(ch.salaire.valeur),
    depuis: dateFrancaise(depuis).jour,
    actif: true,
    droits: {
      vendreBilletsEtColis: droits[0]!.actif,
      annulerSansPinSuperviseur: droits[1]!.actif,
      modeCadence: droits[2]!.actif,
      voirCaissesDesAutres: droits[3]!.actif,
    },
  };
}

const masquer = (numero: string): string => {
  const chiffres = numero.replace(/\D/g, "").slice(-9);
  return `${chiffres[0]} ${chiffres.slice(1, 3)} •• •• ${chiffres.slice(-2)}`;
};

/* ----------------------------------------------------------------------- mock */

export function mockReglages(src: SourceFixtures): ContributionMock {
  const journal = creerJournal();
  const config = src.ecran("Config").donnees;
  let regles = reglesInitiales(src);
  const lignes = new Map<string, c.LigneEditable>([[ALPHA_DLA_BAF.id, ligneEditableInitiale(src)]]);
  const personnes = new Map<string, c.PersonneEditable>();
  const initiale = personneInitiale(src);
  personnes.set(initiale.id, initiale);
  const confirmations = new Map<c.OperateurMomo, string>();
  let prochaine = 1;

  const personne = (id: string): c.PersonneEditable => {
    const p = personnes.get(id);
    if (!p) throw introuvable("Personne", "PERSONNE_INCONNUE", id);
    return p;
  };

  const accueil = (): c.Reglages => {
    const guichetiers = config.equipe.guichetiers.map(
      (g): c.PersonneResume => ({
        id: g._personneId,
        nom: g.nom,
        initiales: g.initiales,
        role: "guichetier",
        lieu: g.lieu,
        indicateur: g.detail,
        etat: etatDepuis(g.detail),
      }),
    );
    return {
      lignes: config.lignes.liste.map((l) => {
        const ligne = LIGNES.find((x) => x.id === l._ligneId)!;
        const modifiee = lignes.get(l._ligneId);
        return {
          id: l._ligneId,
          nom: l.nom,
          nbDeparts: modifiee
            ? modifiee.departs.filter((d) => d.actif).length
            : (nombreAvant(l.detail, "départs") ?? 0),
          tarifs: modifiee?.tarifs ?? ligne.tarifs,
          arrets: modifiee?.arrets.map((a) => a.nom) ?? ligne.arrets.slice(1, -1).map((a) => a.nom),
          propositionAssistant: /^(.*) proposé$/.exec(l.action)?.[1] ?? null,
        };
      }),
      equipe: {
        total: nombreAvant(config.equipe.titre, "personnes") ?? 0,
        effectifs: config.equipe.effectifs.map((x) => ({
          role: roleDepuis(x.role),
          nombre: x.nombre,
        })),
        apercu: guichetiers.slice(0, 3),
      },
      regles,
    };
  };

  return {
    operations: [
      implementer(OP_REGLAGES, () => accueil()),
      implementer(OP_REGLES, () => regles),
      implementer(OP_ENREGISTRER_REGLES, (params): c.ReglesEnregistrees => {
        const cmd = lireCommande(c.EnregistrerReglesSchema, params);
        regles = { ...cmd.regles, comptesMomo: regles.comptesMomo };
        return { ...journal(cmd.signature.signeA), regles };
      }),

      implementer(OP_LIGNE_EDITABLE, ({ ligneId }) => {
        const ligne = lignes.get(ligneId);
        if (!ligne) throw introuvable("Ligne", "LIGNE_INCONNUE", ligneId);
        return ligne;
      }),
      implementer(OP_MODIFIER_LIGNE, (params): c.LignePubliee => {
        const cmd = lireCommande(c.ModifierLigneSchema, params);
        const ligne = lignes.get(cmd.ligneId);
        if (!ligne) throw introuvable("Ligne", "LIGNE_INCONNUE", cmd.ligneId);
        const publiee: c.LigneEditable = {
          ...ligne,
          departs: cmd.departs ?? ligne.departs,
          tarifs: cmd.tarifs ?? ligne.tarifs,
          arrets:
            cmd.arrets?.map((a) => ({
              ...a,
              prorata: ligne.arrets.find((x) => x.nom === a.nom)?.prorata ?? 0,
            })) ?? ligne.arrets,
          plan: cmd.plan ?? ligne.plan,
          options: cmd.options ?? ligne.options,
          brouillon: { modifications: 0, publicationA: null },
        };
        lignes.set(cmd.ligneId, publiee);
        return { ...journal(cmd.signature.signeA), ligne: publiee };
      }),
      implementer(OP_CREER_LIGNE, (params): c.LignePubliee => {
        const cmd = lireCommande(c.CreerLigneSchema, params);
        const id = `ligne-alp-nouvelle-${prochaine++}`;
        const ligne: c.LigneEditable = {
          id,
          nom: `Nouvelle ligne ${cmd.origineGareId} → ${cmd.destinationGareId}`,
          departs: [],
          tarifs: cmd.tarifs,
          arrets: cmd.arrets.map((nom) => ({ nom, prorata: 0, montee: true })),
          plan: {
            capacite: cmd.capacite,
            disposition: "2+2",
            rangees: Math.ceil(cmd.capacite / 4),
          },
          options: { venteEnLigne: true, fusionAuto: false },
          brouillon: { modifications: 0, publicationA: null },
        };
        lignes.set(id, ligne);
        return { ...journal(cmd.signature.signeA), ligne };
      }),

      implementer(OP_PERSONNE_EDITABLE, ({ personneId }) => personne(personneId)),
      implementer(OP_MODIFIER_PERSONNE, (params): c.PersonneEnregistree => {
        const cmd = lireCommande(c.ModifierPersonneSchema, params);
        const modifiee = { ...personne(cmd.personneId), ...cmd.champs };
        personnes.set(cmd.personneId, modifiee);
        return { ...journal(cmd.signature.signeA), personne: modifiee, pinProvisoireEnvoye: false };
      }),
      implementer(OP_CREER_PERSONNE, (params, ctx): c.PersonneEnregistree => {
        const cmd = lireCommande(c.CreerPersonneSchema, params);
        const nouvelle: c.PersonneEditable = {
          id: `pers-nouvelle-${prochaine++}`,
          ...cmd.champs,
          depuis: ctx.horloge.iso().slice(0, 10),
          actif: true,
        };
        personnes.set(nouvelle.id, nouvelle);
        return { ...journal(cmd.signature.signeA), personne: nouvelle, pinProvisoireEnvoye: true };
      }),
      implementer(OP_DESACTIVER_PERSONNE, (params, ctx): c.PersonneDesactivee => {
        const cmd = lireCommande(c.DesactiverPersonneSchema, params);
        personnes.set(cmd.personneId, { ...personne(cmd.personneId), actif: false });
        return {
          ...journal(cmd.signature.signeA),
          personneId: cmd.personneId,
          desactiveeA: ctx.horloge.iso(),
        };
      }),
      implementer(OP_PIN_PROVISOIRE, (params, ctx): c.PinProvisoireEnvoye => {
        const cmd = lireCommande(c.NouveauPinProvisoireSchema, params);
        personne(cmd.personneId);
        return {
          ...journal(cmd.signature.signeA),
          personneId: cmd.personneId,
          valableJusqua: ajouterHeures(ctx.horloge.iso(), 1),
        };
      }),

      implementer(OP_CONFIRMER_COMPTE_MOMO, (params, ctx): c.ConfirmationCompteMomoEnvoyee => {
        const cmd = lireCommande(c.DemanderConfirmationCompteMomoSchema, params);
        confirmations.set(cmd.operateur, cmd.nouveauNumero);
        return {
          envoyeA: regles.comptesMomo[cmd.operateur].numeroMasque,
          expireA: ajouterMinutes(ctx.horloge.iso(), 10),
        };
      }),
      implementer(OP_CHANGER_COMPTE_MOMO, (params, ctx): c.CompteMomoChange => {
        const cmd = lireCommande(c.ChangerCompteMomoSchema, params);
        if (confirmations.get(cmd.operateur) !== cmd.nouveauNumero) {
          throw conflit(
            "Demandez d'abord le SMS de confirmation à l'ancien numéro",
            "CONFIRMATION_REQUISE",
          );
        }
        if (cmd.codeSms === "000000") {
          throw new ErreurHttp(403, "Code SMS incorrect", "CODE_SMS_INCORRECT");
        }
        confirmations.delete(cmd.operateur);
        const numeroMasque = masquer(cmd.nouveauNumero);
        regles = {
          ...regles,
          comptesMomo: { ...regles.comptesMomo, [cmd.operateur]: { numeroMasque } },
        };
        return {
          ...journal(cmd.signature.signeA),
          operateur: cmd.operateur,
          numeroMasque,
          // Les ventes en cours restent sur l'ancien compte jusqu'à minuit.
          effetA: versIsoDouala(minuitSuivantDoualaMs(ctx.horloge.iso())),
        };
      }),

      implementer(OP_LANCER_PAIE, (params): c.PaieLancee => {
        const cmd = lireCommande(c.LancerPaieSchema, params);
        const [annee, mois] = cmd.mois.split("-").map(Number) as [number, number];
        const joursDuMois = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
        return {
          ...journal(cmd.signature.signeA),
          mois: cmd.mois,
          nbSalaires: nombreAvant(config.equipe.titre, "personnes") ?? 0,
          // Le total dépend des primes et des trajets : le mock ne l'invente pas.
          total: null,
          versementA: heure(
            "08:00",
            `${cmd.mois}-${String(Math.min(30, joursDuMois)).padStart(2, "0")}`,
          ),
        };
      }),
    ],
    flux: [],
  };
}
