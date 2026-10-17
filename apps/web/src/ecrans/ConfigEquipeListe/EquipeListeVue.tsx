import { Bouton, EcranCorps, Entete, FeuilleModale } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { couleurInitiales, tonIndicateur } from "@/ecrans/Config/formats";
import { filtrerPersonnes, resumer } from "./filtre";
import { IconeLoupe, IconePlus } from "./icones";
import styles from "./config-equipe-liste.module.css";
import type { EtatListe, ListeEquipe, Personne, Role } from "./types";

/** Identifiant que « Ajouter une personne » met dans l'adresse de ConfigPersonne pour une création. */
const NOUVELLE = "nouvelle";

export interface PropsEquipeListeVue {
  etat: EtatListe;
  /** La liste de l'équipe, présente quand `etat` vaut `pret`. */
  liste?: ListeEquipe | undefined;
  /** Rôle affiché ; `null` : tous (effectif vide). */
  role: Role | null;
  onRole: (role: Role) => void;
  recherche: string;
  onRecherche: (texte: string) => void;
  onFermer: () => void;
  onReessayer?: () => void;
}

function LignePersonne({ personne }: { personne: Personne }) {
  const { t } = useTranslation("ConfigEquipeListe");
  return (
    <li>
      <a className={styles.ligne} href={urlPlanche("ConfigPersonne", { personneId: personne.id })}>
        <span className={styles.avatar} data-ton={couleurInitiales(personne)} aria-hidden="true">
          {personne.initiales}
        </span>
        <span className={styles.colonne}>
          <span className={styles.nom}>
            {personne.nom}
            {personne.lieu && (
              <>
                {" "}
                · <span className={styles.lieu}>{personne.lieu}</span>
              </>
            )}
          </span>
          <span className={styles.indicateur} data-ton={tonIndicateur(personne)}>
            {personne.indicateur}
          </span>
        </span>
        <span className={styles.modifier}>{t("modifier")}</span>
      </a>
    </li>
  );
}

function Message({
  role,
  texte,
  onReessayer,
}: {
  role: "alert" | "status";
  texte: string;
  onReessayer?: (() => void) | undefined;
}) {
  const { t } = useTranslation("ConfigEquipeListe");
  return (
    <div className={styles.message} role={role}>
      <p>{texte}</p>
      {onReessayer && (
        <Bouton
          variante="secondaire"
          libelle={t("etats.reessayer")}
          onClick={onReessayer}
          className={styles.reessayer}
        />
      )}
    </div>
  );
}

/**
 * Le pop-up : un fond d'écran réduit à l'en-tête et à deux cartes vides sous un voile, puis la feuille « Mon équipe »
 * avec ses quatre rôles (le choix du rôle filtre sur place), le champ de recherche, la liste glissable des personnes,
 * le résumé, « Fermer » et « Ajouter une personne ».
 *
 * « Fermer » et « Ajouter une personne » ne dépendent pas des données : ils restent utilisables pendant le chargement
 * et en cas d'erreur.
 */
export function EquipeListeVue({
  etat,
  liste,
  role,
  onRole,
  recherche,
  onRecherche,
  onFermer,
  onReessayer,
}: PropsEquipeListeVue) {
  const { t } = useTranslation("ConfigEquipeListe");
  const donnees = etat === "pret" ? liste : undefined;
  const chargement = etat === "chargement";
  const libelleRole = (r: Role, count: number) => t(`roles.${r}`, { count });

  const visibles = donnees ? filtrerPersonnes(donnees.personnes, role, recherche) : [];
  const resume = resumer(visibles);
  const sansPersonne = donnees ? donnees.personnes.length === 0 : false;

  const parties = [
    `${resume.total} ${role ? libelleRole(role, resume.total) : ""}`.trim(),
    t("resume.enService", { count: resume.enService }),
    ...(resume.bloquees > 0 ? [t("resume.bloquees", { count: resume.bloquees })] : []),
  ];

  return (
    <div className={styles.ecran} data-planche="ConfigEquipeListe" data-etat={etat}>
      {/* Le fond : réglages assombris, tels que la planche les dessine derrière le pop-up. */}
      <Entete
        className={styles.fondEntete}
        titre={t("fond.titre")}
        sousTitre={donnees ? t("fond.sousTitre", { count: donnees.total }) : undefined}
        retour={{ libelle: t("fond.retour"), href: urlPlanche("Config") }}
      />
      <EcranCorps className={styles.fondCorps} aria-hidden="true">
        <div className={styles.fondCarte} data-taille="petite" />
        <div className={styles.fondCarte} data-taille="grande" />
      </EcranCorps>

      <FeuilleModale
        ouverte
        ancrage="parent"
        forme="feuille"
        className={styles.feuille}
        titre={donnees ? t("popup.titre", { count: donnees.total }) : t("popup.titreSansEffectif")}
        sousTitre={t("popup.aide")}
        libelleFermer={t("popup.fermer")}
        onFermer={onFermer}
        actions={
          <div className={styles.pied}>
            <Bouton
              variante="secondaire"
              libelle={t("actions.fermer")}
              href={urlPlanche("Config")}
              className={styles.fermer}
            />
            <Bouton
              variante="secondaire"
              libelle={t("actions.ajouter")}
              icone={<IconePlus />}
              href={urlPlanche("ConfigPersonne", { personneId: NOUVELLE })}
              className={styles.ajouter}
            />
          </div>
        }
      >
        <div className={styles.contenu} aria-busy={chargement}>
          <div className={styles.bloc}>
            {chargement && (
              <div className={styles.roles} aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={`${styles.squeletteRole} am-pulse`} />
                ))}
              </div>
            )}
            {donnees && donnees.roles.length > 0 && (
              <div className={styles.roles} role="group" aria-label={t("filtres")}>
                {donnees.roles.map((effectif) => (
                  <button
                    key={effectif.role}
                    type="button"
                    className={styles.role}
                    aria-current={effectif.role === role}
                    onClick={() => onRole(effectif.role)}
                  >
                    <span className={styles.roleNombre}>{effectif.nombre}</span>{" "}
                    <span className={styles.roleLibelle}>
                      {libelleRole(effectif.role, effectif.nombre)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <label className={styles.recherche}>
              <IconeLoupe />
              <input
                type="search"
                className={styles.saisie}
                value={recherche}
                placeholder={t("recherche")}
                aria-label={t("recherche")}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => onRecherche(e.target.value)}
              />
            </label>

            <div className={styles.defilement} role="region" aria-label={t("liste")} tabIndex={0}>
              {chargement && (
                <div role="status" aria-label={t("etats.chargement")}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <span key={i} className={styles.squeletteLigne} aria-hidden="true">
                      <span className={`${styles.squeletteTrait} am-pulse`} />
                    </span>
                  ))}
                </div>
              )}
              {etat === "erreur" && (
                <Message role="alert" texte={t("etats.erreur")} onReessayer={onReessayer} />
              )}
              {donnees && sansPersonne && <Message role="status" texte={t("etats.vide")} />}
              {donnees && !sansPersonne && visibles.length === 0 && (
                <Message role="status" texte={t("etats.aucun")} />
              )}
              {visibles.length > 0 && (
                <ul className={styles.liste}>
                  {visibles.map((personne) => (
                    <LignePersonne key={personne.id} personne={personne} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={styles.resume}>
            <span>{donnees ? parties.join(" · ") : ""}</span>
            <span>{t("signature")}</span>
          </div>
        </div>
      </FeuilleModale>
    </div>
  );
}
