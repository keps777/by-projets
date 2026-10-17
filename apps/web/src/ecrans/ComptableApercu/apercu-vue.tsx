import type { patron as contrats } from "@afrimove/contrats";
import { patron } from "@afrimove/api-client";
import {
  Bouton,
  FeuilleModale,
  IconeRetour,
  TableauColonnesFixes,
  type ColonneTableau,
} from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import styles from "./apercu.module.css";
import {
  ageFichier,
  colonneNumerique,
  milliers,
  nomDuMois,
  nomsDesOnglets,
  tailleFichier,
  texteCellule,
  tonDuMode,
  type Cellule,
} from "./formats";
import { IconeTelecharger } from "./icones";

export type EtatApercu = "chargement" | "erreur" | "vide" | "introuvable" | "pret";

export interface PropsApercuVue {
  etat: EtatApercu;
  /** L'aperçu de l'export, présent quand `etat` vaut `pret` ou `vide`. */
  apercu?: contrats.ApercuExport | undefined;
  onReessayer?: () => void;
  /** Ferme le pop-up (le « × », le voile, Échap) : retour au Comptable. */
  onFermer: () => void;
  /** « Télécharger » : va chercher le vrai fichier et le remet à l'appareil. */
  onTelecharger: () => void;
  /** L'onglet montré (un `id` de `apercu.onglets`) ; le premier tant qu'on n'en a pas choisi. */
  ongletActif?: string | undefined;
  /** Toucher un onglet : lit son tableau. Sans lui, les onglets ne sont qu'un rappel. */
  onChoisirOnglet?: ((id: string) => void) | undefined;
  /** Le fichier arrive : « Télécharger » attend. */
  enTelechargement?: boolean | undefined;
  /** Le fichier n'est pas arrivé : on le dit, « Télécharger » peut être retouché. */
  erreurTelechargement?: boolean | undefined;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/* ---------------------------------------------------------------- l'écran Comptable derrière le voile */

/**
 * L'écran Comptable tel qu'il reste visible derrière le pop-up : l'en-tête et les deux cartes, estompés. Purement
 * décoratif (caché aux lecteurs d'écran, sans focus) ; la période et le mois viennent de la synthèse du comptable.
 */
function FondComptable() {
  const { t } = useTranslation("ComptableApercu");
  const synthese = patron.useSyntheseComptable().data;
  return (
    <div className={styles.fond} aria-hidden="true" inert>
      <div className={styles.fondEntete}>
        <span className={styles.fondRetour}>
          <IconeRetour taille={20} />
        </span>
        <div className={styles.fondTextes}>
          <span className={styles.fondTitre}>{t("fond.titre")}</span>
          {synthese ? (
            <span className={styles.fondSousTitre}>
              {t("fond.periode", { periode: synthese.libelle, jour: synthese.jourDeCloture })}
            </span>
          ) : (
            <Squelette className={styles.squeletteFondSousTitre} />
          )}
        </div>
      </div>
      <div className={styles.fondCorps}>
        <div className={styles.fondCarte}>
          {synthese ? (
            <span className={styles.etiquette}>
              {t("fond.rapprochement", { mois: nomDuMois(synthese.libelle) })}
            </span>
          ) : (
            <Squelette className={styles.squeletteFondEtiquette} />
          )}
        </div>
        <div className={styles.fondExports}>
          <div className={styles.fondExportsTete}>{t("fond.exports")}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- contenu du pop-up */

function Onglets({
  onglets,
  actif,
  onChoisir,
}: {
  onglets: contrats.ApercuExport["onglets"];
  actif: string | undefined;
  onChoisir: ((id: string) => void) | undefined;
}) {
  const { t } = useTranslation("ComptableApercu");
  return (
    <ul className={styles.onglets} aria-label={t("export.onglets")}>
      {onglets.map((onglet, i) => {
        const courant = actif === undefined ? i === 0 : onglet.id === actif;
        return (
          <li
            key={onglet.id}
            className={styles.onglet}
            data-actif={courant ? "oui" : undefined}
            aria-current={courant ? "true" : undefined}
          >
            {onChoisir ? (
              <button
                type="button"
                className={styles.ongletBouton}
                onClick={() => onChoisir(onglet.id)}
              >
                {onglet.libelle}
              </button>
            ) : (
              onglet.libelle
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Le tableau des premières lignes : colonnes du fichier dans l'ordre, la première collée à gauche au défilement. */
function Tableau({ apercu }: { apercu: contrats.ApercuExport }) {
  const { t } = useTranslation("ComptableApercu");
  const { colonnes, lignes, premiere, derniere, total, totalMontant } = apercu.tableau;

  const definition: ColonneTableau<Cellule[]>[] = colonnes.map((titre, index) => ({
    cle: `${index}-${titre}`,
    titre,
    ...(index === 0 ? { fixe: true } : {}),
    ...(colonneNumerique(lignes, index) ? { align: "droite" as const } : {}),
    rendu: (ligne) => texteCellule(ligne[index] ?? null),
    ...(titre === "mode"
      ? {
          etat: (ligne: Cellule[]) => {
            const mode = ligne[index];
            return typeof mode === "string" ? tonDuMode(mode) : undefined;
          },
        }
      : {}),
  }));

  const bornes = { premiere, derniere, total: milliers(total) };
  return (
    <TableauColonnesFixes
      ariaLabel={t("tableau.aria", { nom: apercu.export.nom, premiere, derniere })}
      colonnes={definition}
      lignes={lignes}
      cleLigne={(_, index) => String(index)}
      pied={
        <>
          <span>{t(total > derniere ? "tableau.pied" : "tableau.piedComplet", bornes)}</span>
          <span className={styles.total}>
            {t("tableau.total", { montant: milliers(totalMontant) })}
          </span>
        </>
      }
    />
  );
}

function TableauSquelette() {
  return (
    <div className={styles.tableauSquelette} aria-hidden="true">
      <span className={styles.tableauSqueletteTete} />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <span key={i} className={styles.tableauSqueletteLigne}>
          <Squelette className={styles.squeletteCellule} />
        </span>
      ))}
    </div>
  );
}

/** Les trois rappels sous le tableau : colonnes fixes, un onglet par vue, empreinte signée. */
function Garanties({ apercu }: { apercu: contrats.ApercuExport }) {
  const { t } = useTranslation("ComptableApercu");
  return (
    <div className={styles.garanties}>
      <span className={styles.garantie}>
        <span className={styles.garantieTitre}>{t("garanties.colonnes.titre")}</span>
        <span className={styles.garantieDetail}>{t("garanties.colonnes.detail")}</span>
      </span>
      <span className={styles.garantie}>
        <span className={styles.garantieTitre}>{t("garanties.onglets.titre")}</span>
        <span className={styles.garantieDetail}>{nomsDesOnglets(apercu.onglets)}</span>
      </span>
      {apercu.signe && (
        <span className={styles.garantie}>
          <span className={styles.garantieTitre}>{t("garanties.signe.titre")}</span>
          <span className={styles.garantieDetail}>{t("garanties.signe.detail")}</span>
        </span>
      )}
    </div>
  );
}

function GarantiesSquelette() {
  return (
    <div className={styles.garanties} aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <Squelette key={i} className={styles.squeletteGarantie} />
      ))}
    </div>
  );
}

/** Le message des états vide, introuvable et erreur, dans le style nuit des autres écrans. */
function Etat({
  etat,
  onReessayer,
}: {
  etat: "vide" | "introuvable" | "erreur";
  onReessayer: (() => void) | undefined;
}) {
  const { t } = useTranslation("ComptableApercu");
  return (
    <div className={styles.etat}>
      <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
        <span className={styles.point} />
        <p>{t(`etats.${etat}`)}</p>
      </div>
      {etat === "erreur" && onReessayer && (
        <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
      )}
    </div>
  );
}

/**
 * Aperçu d'un export en pop-up par-dessus l'écran Comptable : nom, nombre de lignes et de colonnes, taille ; les
 * onglets du fichier ; les premières lignes du tableau, glissables, avec le total ; les rappels ; « Fermer »,
 * « Télécharger » et « Envoyer au cabinet ».
 *
 * Aucune écriture ici : « Envoyer au cabinet » mène à la clôture, qui envoie le mois entier après confirmation.
 */
export function ApercuVue({
  etat,
  apercu,
  onReessayer,
  onFermer,
  onTelecharger,
  ongletActif,
  onChoisirOnglet,
  enTelechargement,
  erreurTelechargement,
}: PropsApercuVue) {
  const { t } = useTranslation("ComptableApercu");
  const maintenant = useMaintenant();
  const donnees = etat === "pret" || etat === "vide" ? apercu : undefined;
  const chargement = etat === "chargement";

  let sousTitre: string | undefined;
  if (donnees) {
    const e = donnees.export;
    const age = ageFichier(e.genereA, maintenant);
    const genere =
      age.genre === "instant"
        ? t("export.genere.instant")
        : age.genre === "minutes"
          ? t("export.genere.minutes", { minutes: age.minutes })
          : age.genre === "heures"
            ? t("export.genere.heures", { heures: age.heures })
            : t("export.genere.le", { date: age.date });
    sousTitre = t("export.detail", {
      lignes: t("export.lignes", { count: e.lignes, nombre: milliers(e.lignes) }),
      colonnes: t("export.colonnes", { count: e.colonnes, nombre: milliers(e.colonnes) }),
      taille: tailleFichier(e.tailleOctets),
      genere,
    });
  }

  let corps: ReactNode;
  if (chargement) {
    corps = (
      <div className={styles.contenu} aria-busy="true">
        <span className={styles.annonce} role="status">
          {t("etats.chargement")}
        </span>
        <div className={styles.haut}>
          <div className={styles.onglets} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <Squelette key={i} className={styles.squeletteOnglet} />
            ))}
          </div>
          <TableauSquelette />
        </div>
        <GarantiesSquelette />
      </div>
    );
  } else if (donnees && etat === "pret") {
    corps = (
      <div className={styles.contenu} data-etat="pret">
        <div className={styles.haut}>
          <Onglets onglets={donnees.onglets} actif={ongletActif} onChoisir={onChoisirOnglet} />
          <Tableau apercu={donnees} />
        </div>
        <Garanties apercu={donnees} />
      </div>
    );
  } else if (donnees) {
    corps = (
      <div className={styles.contenu} data-etat="vide">
        <Onglets onglets={donnees.onglets} actif={ongletActif} onChoisir={onChoisirOnglet} />
        <Etat etat="vide" onReessayer={undefined} />
        <Garanties apercu={donnees} />
      </div>
    );
  } else {
    corps = (
      <div className={styles.contenu} data-etat={etat}>
        <Etat etat={etat === "erreur" ? "erreur" : "introuvable"} onReessayer={onReessayer} />
      </div>
    );
  }

  const telechargeable = etat === "pret";
  return (
    <div className={styles.ecran} data-planche="ComptableApercu" data-etat={etat}>
      <h1 className={styles.titreEcran}>
        {t("ecrans.ComptableApercu.titre", { ns: "translation" })}
      </h1>
      <FondComptable />
      <FeuilleModale
        ouverte
        ancrage="parent"
        onFermer={onFermer}
        badge={donnees?.export.format}
        titre={donnees?.export.nom ?? t("etats.titre")}
        {...(sousTitre ? { sousTitre } : {})}
        libelleFermer={t("export.fermer")}
        actions={
          <>
            {erreurTelechargement && (
              <p role="alert" className={styles.erreurTelechargement}>
                {t("etats.telechargement")}
              </p>
            )}
            <div className={styles.actions} data-colonnes={telechargeable || chargement ? 3 : 2}>
              <a className={`${styles.bouton} ${styles.fermer}`} href={urlPlanche("Comptable")}>
                {t("boutons.fermer")}
              </a>
              {telechargeable ? (
                <button
                  type="button"
                  className={`${styles.bouton} ${styles.telecharger}`}
                  disabled={enTelechargement === true}
                  aria-busy={enTelechargement === true ? "true" : undefined}
                  onClick={onTelecharger}
                >
                  <IconeTelecharger />
                  {t("boutons.telecharger")}
                </button>
              ) : chargement ? (
                <Squelette className={styles.squeletteBouton} />
              ) : null}
              <a
                className={`${styles.bouton} ${styles.envoyer}`}
                href={urlPlanche("ComptableCloture")}
              >
                {t("boutons.envoyer")}
              </a>
            </div>
          </>
        }
      >
        {corps}
      </FeuilleModale>
    </div>
  );
}
