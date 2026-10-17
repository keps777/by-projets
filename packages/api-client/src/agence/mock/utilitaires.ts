import { MONDE, heure } from "@afrimove/fixtures";
import { numeroDepart, versIsoDouala } from "@afrimove/domain";
import type { Billet, Depart } from "@afrimove/domain";
import { agence as c } from "@afrimove/contrats";
import { ErreurHttp, implementer, simulerFlux } from "../../infra/index";
import type {
  Canal,
  ContexteFlux,
  ContexteMock,
  ImplementationMock,
  FluxMock,
} from "../../infra/index";
import type { EcritureAgence, DefinitionEvenementQuelconque } from "../operations";
import type { Operation } from "../../infra/index";

/**
 * Outils des implémentations mock de l'agence : lecture des textes des planches (les fixtures
 * écrivent ce que la maquette affiche : « 612 k », « 6 77 30 11 45 », « 08:30 Yaoundé · 31/40 »)
 * et conversion en valeurs du contrat (FCFA entiers, heures ISO, téléphones internationaux).
 */

/* ------------------------------------------------------------------ lecture des textes */

export class FixtureIllisible extends Error {
  constructor(quoi: string, texte: string) {
    super(`Fixture agence : « ${texte} » n'a pas la forme attendue pour ${quoi}`);
    this.name = "FixtureIllisible";
  }
}

/** Applique une expression régulière à un texte de planche ou échoue en disant lequel. */
export function capturer(re: RegExp, texte: string, quoi: string): RegExpExecArray {
  const m = re.exec(texte);
  if (!m) throw new FixtureIllisible(quoi, texte);
  return m;
}

/** Un groupe de capture qui doit exister. */
export function groupe(m: RegExpExecArray, i: number): string {
  const g = m[i];
  if (g === undefined) throw new FixtureIllisible(`le groupe ${i}`, m[0]);
  return g;
}

/** Un élément de tableau qui doit exister. */
export function lire<T>(valeur: T | null | undefined, quoi: string): T {
  if (valeur === undefined || valeur === null) throw new FixtureIllisible(quoi, "(absent)");
  return valeur;
}

/**
 * « 4 000 » → 4000, « − 1 000 » → −1000, « 612 k » → 612000. Les maquettes abrègent les gros
 * montants avec « k » : le contrat, lui, ne porte que des FCFA entiers.
 */
export function montant(texte: string | number): number {
  if (typeof texte === "number") return texte;
  const m = capturer(/^([−-])?\s*(\d[\d\s ]*)(?:\s*(k))?$/, texte.trim(), "un montant");
  const chiffres = Number(groupe(m, 2).replace(/[\s ]/g, ""));
  const valeur = m[3] === "k" ? chiffres * 1000 : chiffres;
  return m[1] ? -valeur : valeur;
}

/** « 6 77 30 11 45 » → « +237677301145 » ; null si le numéro est partiel (« 6 55 … »). */
export function telephone(affiche: string): string | null {
  const chiffres = affiche.replace(/[\s.-]/g, "");
  if (/^\+\d{8,15}$/.test(chiffres)) return chiffres;
  if (/^\d{9}$/.test(chiffres)) return `+237${chiffres}`;
  return null;
}

/** « 08:30 » → ISO Douala le jour des maquettes. */
export const iso = heure;

/** Retire `secondes` à une heure ISO. */
export function ilYA(isoDouala: string, secondes: number): string {
  return versIsoDouala(Date.parse(isoDouala) - secondes * 1000);
}

/* ------------------------------------------------------------------ personnes et entités */

/** Résout « Joseph M. » en la personne du monde commun (« Joseph Mbappé »), sinon un identifiant dérivé. */
export function personne(libelle: string): c.PersonneRef {
  const [prenom = "", suite = ""] = libelle.replace(/\./g, "").split(/\s+/);
  const exacte = MONDE.personnes.find((p) => p.nom === libelle);
  const proche = MONDE.personnes.find((p) => {
    const [pp = "", ps = ""] = p.nom.split(/\s+/);
    return pp === prenom && (suite === "" || ps.startsWith(suite.slice(0, 1)));
  });
  const trouvee = exacte ?? proche;
  return {
    id: trouvee?.id ?? `pers-${libelle.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    nom: libelle,
  };
}

const LIGNES_PAR_DESTINATION: Readonly<Record<string, string>> = {
  Yaoundé: "DLAYDE",
  Bafoussam: "DLABAF",
};

/** Identifiant d'un départ d'Alpha Voyages au départ de Douala, tel que le calcule le monde commun. */
export function idDepartAlpha(hhmm: string, destination: string): string {
  const ligne = LIGNES_PAR_DESTINATION[destination];
  if (!ligne) throw new FixtureIllisible("une destination connue", destination);
  return `dep-${numeroDepart({ agence: "ALP", ligne, at: heure(hhmm) }).toLowerCase()}`;
}

export function guichetAlpha(rang: number): { id: string; rang: number } {
  const g = MONDE.guichets.find((x) => x.gareId === "gare-alp-dla" && x.rang === rang);
  return { id: g?.id ?? `guichet-alp-dla-${rang}`, rang };
}

export function immatriculation(bus: string): string {
  return bus.trim();
}

/** Le billet imprimable d'un billet du domaine. */
export function billetImprimable(
  billet: Billet,
  depart: Depart | undefined,
  extra: { compagnie?: string; trajet?: { origine: string; destination: string } } = {},
): c.BilletImprimable {
  const classe = billet.classe;
  return {
    billetId: billet.id,
    numero: billet.numero,
    sequence: billet.sequence,
    compagnie: extra.compagnie ?? "Alpha Voyages",
    trajet: extra.trajet ?? { origine: "DLA", destination: "YDE" },
    heureDepart: depart?.heureDepart ?? billet.creeA,
    siege: billet.siege,
    classe,
    passager: {
      nom: billet.passager.nom ?? null,
      pieceQuatreDerniers: billet.passager.pieceQuatreDerniers ?? null,
    },
    codeBillet: billet.codeBillet,
    qr: `AM1:${billet.numero}:${billet.codeBillet}`,
    prix: billet.prix,
    aCompleterAuQuai: !billet.passager.nom,
  };
}

/* ------------------------------------------------------------------ pose dans le scénario */

/**
 * Ce que l'installateur d'une planche reçoit pour déclarer ses réponses. Il masque la tuyauterie
 * (remplacement d'une opération déjà déclarée, accusés, idempotence).
 */
export interface Poseur {
  /** Réponse à une lecture. La valeur est clonée à chaque appel : un écran ne peut pas la modifier. */
  lecture<P, R>(operation: Operation<P, R>, repondre: (params: P, ctx: ContexteMock) => R): void;
  /**
   * Réponse à une écriture. `traiter` reçoit l'événement (déjà validé par son schéma complet) et
   * renvoie le résultat sans l'accusé, que le poseur ajoute. Un événement rejoué (même UUID)
   * renvoie le résultat de la première fois avec `statut: "deja_recu"`, sans retraiter.
   */
  ecriture<E extends DefinitionEvenementQuelconque, R extends { accuse: c.Accuse }>(
    ecriture: EcritureAgence<E, R>,
    traiter: (evenement: c.EvenementDe<E>, ctx: ContexteMock) => Omit<R, "accuse">,
  ): void;
  flux<P, M>(
    canal: Canal<P, M>,
    demarrer: (params: P, ctx: ContexteFlux) => void | (() => void),
  ): void;
}

export function creerPoseur(operations: ImplementationMock[], flux: FluxMock[]): Poseur {
  const dejaVus = new Map<string, unknown>();

  const remplacer = <T extends { operation?: { nom: string }; canal?: { nom: string } }>(
    liste: T[],
    nom: string,
    nouveau: T,
  ): void => {
    const i = liste.findIndex((x) => (x.operation?.nom ?? x.canal?.nom) === nom);
    if (i >= 0) liste.splice(i, 1, nouveau);
    else liste.push(nouveau);
  };

  return {
    lecture(operation, repondre) {
      remplacer(
        operations,
        operation.nom,
        implementer(operation, (params, ctx) => structuredClone(repondre(params, ctx))),
      );
    },

    ecriture(ecriture, traiter) {
      const operation = ecriture.operation;
      remplacer(
        operations,
        operation.nom,
        implementer(operation, (evenement, ctx) => {
          const lu = ecriture.evenement.schema.safeParse(evenement);
          if (!lu.success) {
            throw new ErreurHttp(
              422,
              `Événement ${ecriture.evenement.type} invalide`,
              "EVENEMENT_INVALIDE",
              lu.error.issues,
            );
          }
          const cle = lu.data.id;
          const accuse = (statut: c.Accuse["statut"]): c.Accuse => ({
            evenementId: cle,
            statut,
            recuA: ctx.horloge.iso(),
          });
          if (dejaVus.has(cle)) {
            const premier = dejaVus.get(cle) as { accuse: c.Accuse };
            return structuredClone({ ...premier, accuse: accuse("deja_recu") }) as never;
          }
          const resultat = { ...traiter(evenement, ctx), accuse: accuse("accepte") };
          dejaVus.set(cle, resultat);
          return structuredClone(resultat) as never;
        }),
      );
    },

    flux(canal, demarrer) {
      remplacer(flux, canal.nom, simulerFlux(canal, demarrer));
    },
  };
}

/* ------------------------------------------------------------------ supervision */

/** Identifiant de la demande d'annulation d'un billet (créée par le guichetier). */
export function idDemandeAnnulation(billetId: string): string {
  return `dem-annulation-${billetId}`;
}

/** Identifiant de la demande de validation de la clôture d'une session. */
export function idDemandeCloture(sessionId: string): string {
  return `dem-cloture-${sessionId}`;
}

/**
 * Le serveur vérifie que la preuve vient bien d'un superviseur connu. Le PIN lui-même n'est jamais
 * vu ici : seule la signature de l'appareil du superviseur voyage (voir `ValidationSuperviseur`).
 */
export function verifierSuperviseur(preuve: c.ValidationSuperviseur): void {
  const personne = MONDE.personnes.find((p) => p.id === preuve.superviseurId);
  if (!personne?.roles.includes("superviseur")) {
    throw new ErreurHttp(
      403,
      "Seul un superviseur peut valider avec son PIN",
      "SUPERVISEUR_REQUIS",
    );
  }
}
