import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge } from "../socle/horloge";
import { ChargeurMois, ChoixDuMois, PREMIER_MOIS, exigerCompagnie } from "./donnees.service";
import {
  OngletInconnu,
  construireApercu,
  decompresserTableau,
  genererFichier,
  type ApercuConstruit,
} from "./fichiers";
import type { FichierGenere, IdExport } from "./modele";
import { Clotures, EnvoisCabinet, FichiersApercus, VentesComptables } from "./ports";
import { construireTableau } from "./tableaux";
import { enMs, libelleCourtMois, moisDe, moisPrecedent } from "./temps";
import { erreurApi } from "./validation";
import {
  exportsOuverts,
  figerLignes,
  resumeRapprochement,
  vueClotureFermee,
  vueClotureOuverte,
  vueRapprochement,
  vueSynthese,
  type ClotureVue,
  type RapprochementVue,
  type SyntheseVue,
} from "./vues";

/** Un aperçu mémorisé reste « le fichier de l'aperçu » pendant ce temps : le téléchargement qui suit le rend tel quel. */
export const VALIDITE_APERCU_MS = 10 * 60_000;

/** Combien de mois le sélecteur propose au plus. */
const MOIS_PROPOSES = 12;

/**
 * Lectures du comptable : synthèse, rapprochement, clôture, aperçu et fichier d'un export. Un mois clôturé se
 * lit toujours dans la clôture (figée) : rien n'est recalculé, rien ne peut changer.
 */
@Injectable()
export class ComptableService {
  private readonly cle: Buffer;

  constructor(
    private readonly chargeur: ChargeurMois,
    private readonly choix: ChoixDuMois,
    private readonly clotures: Clotures,
    private readonly envois: EnvoisCabinet,
    private readonly apercus: FichiersApercus,
    private readonly ventes: VentesComptables,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
    @Inject(CONFIG) config: AppConfig,
  ) {
    this.cle = config.cleAudit;
  }

  private async cibler(
    utilisateur: Utilisateur,
    demande: string | undefined,
  ): Promise<{ compagnieId: string; mois: string }> {
    const compagnieId = exigerCompagnie(utilisateur);
    return { compagnieId, mois: await this.choix.resoudre(compagnieId, demande) };
  }

  /* ------------------------------------------------------------------ synthèse */

  async synthese(utilisateur: Utilisateur, demande?: string): Promise<SyntheseVue> {
    const { compagnieId, mois } = await this.cibler(utilisateur, demande);
    const cloture = await this.clotures.trouver(compagnieId, mois);
    const parametres = await this.chargeur.parametresDe(compagnieId);
    const derniers = await this.envois.derniers(compagnieId, 3);
    const commun = {
      mois,
      jourDeCloture: parametres.jourDeCloture,
      moisDisponibles: await this.moisDisponibles(compagnieId, mois),
      emailCabinet: parametres.emailCabinet,
      automatique: parametres.envoiAutomatique,
      jourDEnvoi: parametres.jourDEnvoi,
      derniersEnvoisRecus: derniers.filter((e) => e.recuA !== null).length,
    };
    if (cloture) {
      return vueSynthese({
        ...commun,
        statut: "cloture",
        resume: cloture.rapprochement,
        exports: cloture.exports,
      });
    }
    const d = await this.chargeur.charger(compagnieId, mois);
    return vueSynthese({
      ...commun,
      statut: "ouvert",
      resume: resumeRapprochement(d.rapprochement),
      exports: exportsOuverts(d),
    });
  }

  private async moisDisponibles(
    compagnieId: string,
    choisi: string,
  ): Promise<{ mois: string; libelle: string }[]> {
    const courant = moisDe(this.horloge.maintenant());
    const annee = Number(courant.slice(0, 4));
    const tous = new Set<string>([courant, moisPrecedent(courant)]);
    for (const m of await this.ventes.moisAvecActivite(compagnieId)) tous.add(m);
    for (const c of await this.clotures.lister(compagnieId)) tous.add(c.mois);
    const liste = [...tous]
      .filter((m) => m >= PREMIER_MOIS && m <= courant)
      .sort()
      .reverse();
    const propose = liste.slice(0, MOIS_PROPOSES);
    if (!propose.includes(choisi)) propose.push(choisi);
    return propose.map((mois) => ({ mois, libelle: libelleCourtMois(mois, annee) }));
  }

  /* ------------------------------------------------------------------ rapprochement et clôture */

  async rapprochement(utilisateur: Utilisateur, demande?: string): Promise<RapprochementVue> {
    const { compagnieId, mois } = await this.cibler(utilisateur, demande);
    const cloture = await this.clotures.trouver(compagnieId, mois);
    if (cloture) return vueRapprochement(mois, cloture.rapprochement, cloture.lignes);
    const d = await this.chargeur.charger(compagnieId, mois);
    return vueRapprochement(
      mois,
      resumeRapprochement(d.rapprochement),
      figerLignes(d.rapprochement.sansCorrespondance, d.decisions),
    );
  }

  async cloture(utilisateur: Utilisateur, demande?: string): Promise<ClotureVue> {
    const { compagnieId, mois } = await this.cibler(utilisateur, demande);
    const cloture = await this.clotures.trouver(compagnieId, mois);
    if (cloture) return vueClotureFermee(cloture);
    const d = await this.chargeur.charger(compagnieId, mois);
    return vueClotureOuverte(d, figerLignes(d.rapprochement.sansCorrespondance, d.decisions));
  }

  /* ------------------------------------------------------------------ exports */

  async apercu(
    utilisateur: Utilisateur,
    exportId: IdExport,
    demande?: string,
    onglet?: string,
  ): Promise<ApercuConstruit> {
    const { compagnieId, mois } = await this.cibler(utilisateur, demande);
    try {
      const cloture = await this.clotures.trouver(compagnieId, mois);
      if (cloture) {
        const fichier = cloture.fichiers.find((f) => f.id === exportId);
        if (!fichier) throw erreurApi(404, "EXPORT_INCONNU", "Export inconnu");
        return construireApercu(decompresserTableau(fichier.tableauGz), fichier, onglet);
      }
      const d = await this.chargeur.charger(compagnieId, mois);
      const tableau = construireTableau(exportId, d);
      const fichier = genererFichier({
        tableau,
        compagnieId,
        mois,
        genereA: d.maintenant,
        cle: this.cle,
      });
      await this.apercus.memoriser(compagnieId, mois, fichier);
      return construireApercu(tableau, fichier, onglet);
    } catch (e) {
      if (e instanceof OngletInconnu) {
        throw erreurApi(404, "ONGLET_INCONNU", `Onglet inconnu : ${e.onglet}`);
      }
      throw e;
    }
  }

  /**
   * Le fichier de l'export. Mois clôturé : le fichier figé à la clôture, toujours le même. Mois ouvert : le
   * fichier de l'aperçu s'il date de moins de 10 minutes (« exactement celui prévisualisé »), sinon un
   * fichier neuf, que l'aperçu suivant retrouvera.
   */
  async fichier(
    utilisateur: Utilisateur,
    exportId: IdExport,
    demande?: string,
  ): Promise<FichierGenere> {
    const { compagnieId, mois } = await this.cibler(utilisateur, demande);
    const cloture = await this.clotures.trouver(compagnieId, mois);
    let fichier: FichierGenere | undefined = cloture?.fichiers.find((f) => f.id === exportId);
    if (!fichier) {
      const memo = await this.apercus.dernier(compagnieId, mois, exportId);
      const maintenant = this.horloge.maintenant();
      if (memo && enMs(maintenant) - enMs(memo.genereA) <= VALIDITE_APERCU_MS) {
        fichier = memo;
      } else {
        const d = await this.chargeur.charger(compagnieId, mois);
        fichier = genererFichier({
          tableau: construireTableau(exportId, d),
          compagnieId,
          mois,
          genereA: d.maintenant,
          cle: this.cle,
        });
        await this.apercus.memoriser(compagnieId, mois, fichier);
      }
    }
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId },
      action: "comptable.export.telecharger",
      resultat: "succes",
      cible: { type: "export", id: `${mois}:${exportId}` },
      details: {
        mois,
        export: exportId,
        format: fichier.format,
        octets: fichier.contenu.length,
        empreinte: fichier.empreinte,
        definitif: cloture !== null,
      },
    });
    return fichier;
  }
}
