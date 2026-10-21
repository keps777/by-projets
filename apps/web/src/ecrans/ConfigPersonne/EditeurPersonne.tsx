import { ErreurHttp, patron } from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import {
  Bouton,
  Champ,
  EcranCorps,
  EcranPied,
  Entete,
  LigneInterrupteur,
  Pastille,
  SelecteurDeroulant,
  type OptionSelecteurDeroulant,
} from "@afrimove/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import {
  OPERATEURS,
  ROLES,
  GUICHETS,
  CLES_DROITS,
  aUnGuichet,
  basculerDroit,
  brouillonDepuis,
  brouillonVide,
  champsModifies,
  changerRole,
  erreursDuBrouillon,
  estEnregistrable,
  exceptions,
  versCreation,
  versModification,
  type Brouillon,
  type Operateur,
  type Role,
} from "./brouillon";
import { FeuillePin, type ActionSignee } from "./FeuillePin";
import {
  afficherTelephone,
  formaterJour,
  formaterMontant,
  lireMontant,
  lireTelephone,
  nomCourt,
} from "./formats";
import { IconeCadenas } from "./icones";
import styles from "./configpersonne.module.css";

type Personne = contrats.PersonneEditable;
type Gares = contrats.VueGares;

interface Props {
  /** La fiche à modifier ; `null` pour une nouvelle personne (champs vides). */
  personne: Personne | null;
  /** Les gares du patron (le choix de « Gare ») et le jour de paie (« Salaire · payé le 30 »). */
  gares: Gares;
}

/** « Akwa · Douala », « Mvan · Yaoundé », « Bafoussam » : la ville n'est répétée que si elle diffère du nom. */
function libelleGare(gare: contrats.GareResume): string {
  return gare.nom === gare.ville ? gare.nom : `${gare.nom} · ${gare.ville}`;
}

/**
 * La fiche d'une personne : champs, droits du rôle, PIN provisoire, fiche, désactivation. Tout ce qui est tapé reste
 * dans l'écran jusqu'à « Enregistrer · mon PIN », qui demande le PIN, envoie la fiche (`useModifierPersonne`,
 * `useCreerPersonne`) et revient à l'équipe. Le PIN provisoire et la désactivation sont signés de la même façon.
 */
export function EditeurPersonne({ personne, gares }: Props) {
  const { t, i18n } = useTranslation("ConfigPersonne");
  const navigate = useNavigate();
  const modifier = patron.useModifierPersonne();
  const creer = patron.useCreerPersonne();
  const provisoire = patron.useNouveauPinProvisoire();
  const desactiver = patron.useDesactiverPersonne();
  const signer = patron.useSignaturePin();

  const [brouillon, setBrouillon] = useState<Brouillon>(() =>
    personne ? brouillonDepuis(personne) : brouillonVide(),
  );
  const [tentative, setTentative] = useState(false);
  const [action, setAction] = useState<ActionSignee | null>(null);
  const [echec, setEchec] = useState(false);

  const erreurs = erreursDuBrouillon(brouillon);
  const nbExceptions = exceptions(brouillon).length;

  function changer<K extends keyof Brouillon>(cle: K, valeur: Brouillon[K]) {
    setBrouillon((b) => ({ ...b, [cle]: valeur }));
  }

  function ouvrirPin(suivante: ActionSignee) {
    setEchec(false);
    setAction(suivante);
  }

  function enregistrer() {
    setTentative(true);
    if (!estEnregistrable(erreurs)) return;
    // Rien n'a changé : il n'y a rien à signer, on revient à l'équipe.
    if (personne && Object.keys(champsModifies(brouillon, personne)).length === 0) {
      void navigate(urlPlanche("ConfigEquipeListe"));
      return;
    }
    ouvrirPin("enregistrer");
  }

  /** Signe et exécute l'action ouverte. `false` : PIN refusé. Réussi : on quitte la fiche (la sienne ou la liste). */
  async function signerEtExecuter(pin: string): Promise<boolean> {
    const signature = signer(pin);
    try {
      if (action === "enregistrer") {
        if (personne) await modifier.mutateAsync(versModification(brouillon, personne, signature));
        else await creer.mutateAsync(versCreation(brouillon, signature));
      } else if (personne && action === "provisoire") {
        await provisoire.mutateAsync({ personneId: personne.id, signature });
      } else if (personne && action === "desactiver") {
        await desactiver.mutateAsync({ personneId: personne.id, signature });
      } else {
        return false;
      }
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      setEchec(true);
      throw erreur;
    }
    void navigate(urlPlanche(action === "provisoire" ? "SuperviseurEquipe" : "ConfigEquipeListe"));
    return true;
  }

  const optionsRole: OptionSelecteurDeroulant[] = ROLES.map((role) => ({
    valeur: role,
    libelle: t(`roles.${role}`),
  }));
  const optionsGare: OptionSelecteurDeroulant[] = [
    { valeur: "", libelle: t("aucun") },
    ...gares.gares.map((g) => ({ valeur: g.id, libelle: libelleGare(g) })),
  ];
  const guichets =
    GUICHETS.includes(brouillon.guichet) || brouillon.guichet === ""
      ? GUICHETS
      : [...GUICHETS, brouillon.guichet];
  const optionsGuichet: OptionSelecteurDeroulant[] = [
    { valeur: "", libelle: t("aucun") },
    ...guichets.map((g) => ({ valeur: g, libelle: t(`guichets.${g}`, { defaultValue: g }) })),
  ];
  const optionsOperateur: OptionSelecteurDeroulant[] = OPERATEURS.map((o) => ({
    valeur: o,
    libelle: o,
  }));

  const erreur = (champ: keyof typeof erreurs, message: string) =>
    tentative && erreurs[champ] ? t(message) : undefined;

  /* En-tête : la fiche enregistrée (pas le brouillon), « Guichetier · Akwa guichet 2 · depuis le 5 janv. 2027 ». */
  let titre = t("nouvelle.titre");
  let sousTitre = t("nouvelle.sousTitre");
  if (personne) {
    const gare = gares.gares.find((g) => g.id === personne.gareId);
    const lieu =
      gare === undefined
        ? null
        : personne.guichet === null
          ? gare.nom
          : `${gare.nom} ${t(`guichets.${personne.guichet}`, { defaultValue: personne.guichet }).toLocaleLowerCase()}`;
    titre = nomCourt(personne.nom);
    sousTitre = [
      t(`roles.${personne.role}`),
      lieu,
      t("depuis", { date: formaterJour(personne.depuis, i18n.language) }),
    ]
      .filter((segment) => segment !== null)
      .join(" · ");
  }

  const peutDesactiver = personne?.actif === true;

  return (
    <div className={styles.racine} data-planche="ConfigPersonne">
      <Entete
        className={styles.entete}
        titre={titre}
        sousTitre={sousTitre}
        retour={{ libelle: t("retour"), href: urlPlanche("ConfigEquipeListe") }}
        droite={
          personne ? (
            <Pastille statut="modifier" />
          ) : (
            <Pastille statut="modifier" libelle={t("nouvelle.badge")} ton="vert" />
          )
        }
      />

      <EcranCorps className={styles.corps}>
        <div className={styles.champs}>
          <Champ
            variante="config"
            className={styles.pleine}
            label={t("champs.nom")}
            value={brouillon.nom}
            autoComplete="off"
            onChange={(e) => changer("nom", e.target.value)}
            erreur={erreur("nom", "erreurs.nom")}
          />
          <Champ
            variante="config"
            mono
            label={t("champs.telephone")}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={brouillon.telephone}
            onChange={(e) => changer("telephone", e.target.value)}
            onBlur={(e) => {
              // « 677123423 » devient « 6 77 12 34 23 » en quittant le champ ; une saisie qui n'est pas un numéro reste telle quelle.
              const numero = lireTelephone(e.target.value);
              if (numero !== null) changer("telephone", afficherTelephone(numero));
            }}
            erreur={erreur("telephone", "erreurs.telephone")}
          />
          <SelecteurDeroulant
            variante="config"
            label={t("champs.operateur")}
            options={optionsOperateur}
            value={brouillon.operateur}
            onChange={(e) => changer("operateur", e.target.value as Operateur)}
          />
          <SelecteurDeroulant
            variante="config"
            label={t("champs.role")}
            options={optionsRole}
            value={brouillon.role}
            onChange={(e) => setBrouillon((b) => changerRole(b, e.target.value as Role))}
          />
          <SelecteurDeroulant
            variante="config"
            label={t("champs.gare")}
            options={optionsGare}
            value={brouillon.gareId}
            onChange={(e) => changer("gareId", e.target.value)}
            erreur={erreur("gare", "erreurs.gare")}
          />
          {aUnGuichet(brouillon.role) && (
            <SelecteurDeroulant
              variante="config"
              label={t("champs.guichet")}
              options={optionsGuichet}
              value={brouillon.guichet}
              onChange={(e) => changer("guichet", e.target.value)}
              erreur={erreur("guichet", "erreurs.guichet")}
            />
          )}
          <Champ
            variante="config"
            mono
            label={t("champs.salaire", { jour: gares.paie.jourDuMois })}
            inputMode="numeric"
            autoComplete="off"
            value={brouillon.salaire}
            onChange={(e) => {
              const montant = lireMontant(e.target.value);
              changer("salaire", montant === null ? "" : formaterMontant(montant));
            }}
            erreur={erreur("salaire", "erreurs.salaire")}
          />
        </div>

        <section className={styles.droits} aria-label={t("droits.titre")}>
          <div className={styles.droitsTete}>
            <h2 className={styles.droitsTitre}>{t("droits.titre")}</h2>
            <span className={styles.droitsAide} data-exception={nbExceptions > 0 ? "" : undefined}>
              {nbExceptions > 0
                ? t("droits.exceptions", { count: nbExceptions })
                : t("droits.defaut")}
            </span>
          </div>
          {CLES_DROITS.map((cle, rang) => (
            <LigneInterrupteur
              key={cle}
              className={styles.bascule}
              libelle={t(`droits.liste.${cle}`)}
              separateur={rang > 0}
              checked={brouillon.droits[cle]}
              onChange={() => setBrouillon((b) => basculerDroit(b, cle))}
            />
          ))}
        </section>

        {personne && (
          <div className={styles.liens}>
            <button type="button" className={styles.lien} onClick={() => ouvrirPin("provisoire")}>
              <span className={styles.lienTitre}>{t("liens.pin.titre")}</span>
              <span className={styles.lienDetail}>{t("liens.pin.detail")}</span>
            </button>
            <a
              className={styles.lien}
              href={urlPlanche("PatronPersonne", { personneId: personne.id })}
            >
              <span className={styles.lienTitre}>{t("liens.fiche.titre")}</span>
              <span className={styles.lienDetail}>{t("liens.fiche.detail")}</span>
            </a>
          </div>
        )}

        <p className={styles.note}>{t("note")}</p>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <div className={styles.actions} data-seule={peutDesactiver ? undefined : ""}>
          {peutDesactiver && (
            <Bouton
              variante="secondaire"
              className={styles.desactiver}
              libelle={
                <>
                  {t("actions.desactiver.libelle")}
                  <br />
                  <span className={styles.desactiverDetail}>{t("actions.desactiver.detail")}</span>
                </>
              }
              onClick={() => ouvrirPin("desactiver")}
            />
          )}
          <Bouton
            className={styles.enregistrer}
            libelle={t("actions.enregistrer.libelle")}
            sousLibelle={t("actions.enregistrer.detail")}
            icone={<IconeCadenas />}
            aria-busy={modifier.isPending || creer.isPending}
            onClick={enregistrer}
          />
        </div>
      </EcranPied>

      <FeuillePin
        action={action}
        onFermer={() => setAction(null)}
        nom={personne ? nomCourt(personne.nom) : t("nouvelle.titre")}
        onSigner={signerEtExecuter}
        echec={echec}
      />
    </div>
  );
}
