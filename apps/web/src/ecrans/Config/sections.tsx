import type { patron } from "@afrimove/api-client";
import { Interrupteur } from "@afrimove/ui";
import { useId } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./config.module.css";
import {
  LIGNES_VISIBLES,
  couleurInitiales,
  finDeNumero,
  montant,
  tonIndicateur,
  type LigneReglage,
  type Personne,
  type Regles,
  type Reglages,
  type Role,
} from "./formats";
import { IconeListe } from "./icones";

/** Identifiant de ligne ou de personne que les écrans « modifier » lisent pour une création (« + ligne », « + personne »). */
export const NOUVEAU = "nouvelle";

/* ----------------------------------------------------------------------------------- lignes et tarifs */

/**
 * Ce que la planche écrit sous le nom d'une ligne. Le contrat (`LigneReglage`) donne les départs, les tarifs, les
 * arrêts et la proposition de l'assistant, mais pas le résumé lui-même : on le recompose. Une ligne dont
 * l'assistant propose un changement montre sa grille complète (classique, VIP, bagage) pour juger la proposition ;
 * les autres montrent le prix classique, puis leurs arrêts, ou « prix en route au prorata » quand elles n'en ont pas.
 */
export function detailLigne(ligne: LigneReglage, t: TFunction<"Config">) {
  const parties = [t("lignes.detail.departs", { count: ligne.nbDeparts })];
  if (ligne.propositionAssistant !== null) {
    parties.push(
      t("lignes.detail.classique", { prix: montant(ligne.tarifs.classique) }),
      t("lignes.detail.vip", { prix: montant(ligne.tarifs.vip) }),
      t("lignes.detail.bagage", { prix: montant(ligne.tarifs.bagage) }),
    );
  } else {
    parties.push(montant(ligne.tarifs.classique));
    parties.push(
      ligne.arrets.length > 0
        ? t("lignes.detail.arrets", { liste: ligne.arrets.join(", ") })
        : t("lignes.detail.prorata"),
    );
  }
  return parties.join(" · ");
}

export function LignesVue({ lignes }: { lignes: Reglages["lignes"] }) {
  const { t } = useTranslation("Config");
  return (
    <section className={styles.carte} aria-labelledby="config-lignes">
      <div className={styles.bandeau}>
        <h2 id="config-lignes" className={styles.bandeauTitre}>
          {t("lignes.titre")}
        </h2>
        <a className={styles.ajouter} href={urlPlanche("ConfigLigne", { ligneId: NOUVEAU })}>
          {t("lignes.ajouter")}
        </a>
      </div>
      {lignes.length === 0 && <p className={styles.messageVide}>{t("lignes.vide")}</p>}
      {lignes.map((ligne) => (
        <a
          key={ligne.id}
          className={styles.ligne}
          href={urlPlanche("ConfigLigne", { ligneId: ligne.id })}
        >
          <span className={styles.ligneTextes}>
            <span className={styles.ligneNom}>{ligne.nom}</span>
            <span className={styles.ligneDetail}>{detailLigne(ligne, t)}</span>
          </span>
          <span className={styles.ligneAction} data-propose={ligne.propositionAssistant !== null}>
            {ligne.propositionAssistant !== null
              ? t("lignes.propose", { proposition: ligne.propositionAssistant })
              : t("lignes.modifier")}
          </span>
        </a>
      ))}
    </section>
  );
}

/* ----------------------------------------------------------------------------------- équipe */

type ListeEquipe = ReturnType<typeof patron.useEquipe>;

function LignePersonne({ personne }: { personne: Personne }) {
  const { t } = useTranslation("Config");
  return (
    <li>
      <a
        className={styles.personne}
        href={urlPlanche("PatronPersonne", { personneId: personne.id })}
      >
        <span className={styles.initiales} data-couleur={couleurInitiales(personne)}>
          {personne.initiales}
        </span>
        <span className={styles.personneTextes}>
          <span className={styles.personneNom}>
            {personne.nom} · <span className={styles.personneLieu}>{personne.lieu}</span>
          </span>
          <span className={styles.personneIndicateur} data-ton={tonIndicateur(personne)}>
            {personne.indicateur}
          </span>
        </span>
        <span className={styles.personneAction}>{t("equipe.modifier")}</span>
      </a>
    </li>
  );
}

function ListeGlissable({ liste, libelle }: { liste: ListeEquipe; libelle: string }) {
  const { t } = useTranslation("Config");
  const personnes = liste.data?.personnes ?? [];

  if (liste.isError) {
    return (
      <div className={styles.messageListe} role="alert">
        <p>{t("equipe.erreur")}</p>
        <button type="button" className={styles.voirListe} onClick={() => void liste.refetch()}>
          {t("equipe.reessayer")}
        </button>
      </div>
    );
  }
  if (liste.isPending) {
    return (
      <div className={styles.liste} aria-busy="true" aria-label={t("etats.chargement")}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`${styles.squeletteLigneListe} am-pulse`} aria-hidden="true" />
        ))}
      </div>
    );
  }
  if (personnes.length === 0) {
    return (
      <div className={styles.messageListe} role="status">
        <p>{t("equipe.vide")}</p>
      </div>
    );
  }
  return (
    <>
      <ul className={styles.liste} tabIndex={0} aria-label={libelle}>
        {personnes.map((personne) => (
          <LignePersonne key={personne.id} personne={personne} />
        ))}
      </ul>
      {personnes.length > LIGNES_VISIBLES && <span className={styles.degrade} aria-hidden="true" />}
    </>
  );
}

export interface PropsEquipeVue {
  equipe: Reglages["equipe"];
  /** Rôle dont la liste est affichée. */
  role: Role;
  onRole: (role: Role) => void;
  liste: ListeEquipe;
}

export function EquipeVue({ equipe, role, onRole, liste }: PropsEquipeVue) {
  const { t } = useTranslation("Config");
  const nombre = liste.data?.personnes.length ?? 0;
  const libelleRole = (r: Role, count: number) => t(`equipe.roles.${r}`, { count });
  const visibles = Math.min(nombre, LIGNES_VISIBLES);

  const pied = [
    `${nombre} ${libelleRole(role, nombre)}`,
    t("equipe.visibles", { count: visibles }),
    ...(nombre > LIGNES_VISIBLES ? [t("equipe.glisser")] : []),
  ].join(" · ");

  return (
    <section className={styles.equipe} aria-labelledby="config-equipe">
      <div className={`${styles.bandeau} ${styles.bandeauEquipe}`}>
        <h2 id="config-equipe" className={styles.bandeauTitre}>
          {t("equipe.titre", { count: equipe.total })}
        </h2>
        <a className={styles.ajouter} href={urlPlanche("ConfigPersonne", { personneId: NOUVEAU })}>
          {t("equipe.ajouter")}
        </a>
      </div>
      <div className={styles.roles} role="group" aria-label={t("equipe.filtres")}>
        {equipe.effectifs.map((effectif) => (
          <button
            key={effectif.role}
            type="button"
            className={styles.role}
            aria-current={effectif.role === role}
            onClick={() => onRole(effectif.role)}
          >
            <span className={styles.roleNombre}>{effectif.nombre}</span>
            <span className={styles.roleLibelle}>
              {libelleRole(effectif.role, effectif.nombre)}
            </span>
          </button>
        ))}
      </div>
      <div className={styles.zoneListe}>
        <ListeGlissable liste={liste} libelle={libelleRole(role, 2)} />
      </div>
      <div className={styles.pied}>
        <span className={styles.piedTexte}>{pied}</span>
        <a className={styles.voirListe} href={urlPlanche("ConfigEquipeListe")}>
          <IconeListe />
          {t("equipe.voirListe")}
        </a>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------------- règles */

export type CleInterrupteur = "cadence" | "fraisService";

function LigneInterrupteur({
  libelle,
  actif,
  onChange,
}: {
  libelle: string;
  actif: boolean;
  onChange: (actif: boolean) => void;
}) {
  const id = useId();
  return (
    <div className={styles.regle}>
      <span id={id} className={styles.regleTexte}>
        {libelle}
      </span>
      <Interrupteur checked={actif} onChange={onChange} aria-labelledby={id} />
    </div>
  );
}

export interface PropsReglesVue {
  regles: Regles;
  /** Le patron touche un interrupteur : la valeur voulue, à signer avec son PIN avant d'être enregistrée. */
  onBascule: (cle: CleInterrupteur, valeur: boolean) => void;
}

export function ReglesVue({ regles, onBascule }: PropsReglesVue) {
  const { t } = useTranslation("Config");
  const href = urlPlanche("ConfigRegles");
  const gratuite = regles.annulation.gratuiteJusqua;
  const retenue = t(`regles.annulation.retenue.${regles.annulation.retenue}`);

  return (
    <section className={styles.regles} aria-labelledby="config-regles">
      <div className={styles.bandeau}>
        <h2 id="config-regles" className={styles.bandeauTitre}>
          {t("regles.titre")}
        </h2>
      </div>
      <a className={styles.regle} href={href}>
        <span className={styles.regleTexte}>
          {t(gratuite === "jamais" ? "regles.annulation.debutAucune" : "regles.annulation.debut")}{" "}
          <strong>{t(`regles.annulation.delai.${gratuite}`)}</strong>{" "}
          {t(`regles.annulation.fin.${gratuite}`, { retenue })}
        </span>
        <span className={styles.regleAction}>{t("regles.modifier")}</span>
      </a>
      <a className={styles.regle} href={href}>
        <span className={styles.regleTexte}>
          {t("regles.tolerance.debut")}{" "}
          <strong>
            {t("regles.tolerance.montant", { montant: montant(regles.caisse.toleranceEcart) })}
          </strong>
        </span>
        <span className={styles.regleAction}>{t("regles.modifier")}</span>
      </a>
      <LigneInterrupteur
        libelle={t("regles.cadence")}
        actif={regles.cadence.numeroObligatoire}
        onChange={(valeur) => onBascule("cadence", valeur)}
      />
      <LigneInterrupteur
        libelle={t("regles.fraisService", { montant: montant(regles.fraisService.montant) })}
        actif={regles.fraisService.priseEnChargeParAgence}
        onChange={(valeur) => onBascule("fraisService", valeur)}
      />
      <a className={styles.regle} href={href}>
        <span className={styles.regleTexte}>
          {t("regles.momo", {
            mtn: finDeNumero(regles.comptesMomo.mtn.numeroMasque),
            orange: finDeNumero(regles.comptesMomo.orange.numeroMasque),
          })}
        </span>
        <span className={styles.regleAction}>{t("regles.modifier")}</span>
      </a>
    </section>
  );
}
