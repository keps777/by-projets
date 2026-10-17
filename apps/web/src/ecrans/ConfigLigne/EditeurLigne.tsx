import { ErreurHttp, patron, useClientApi } from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import {
  Bouton,
  EcranCorps,
  EcranPied,
  Entete,
  IconeCoche,
  Interrupteur,
  Pastille,
} from "@afrimove/ui";
import { useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import {
  ajouterArret,
  ajouterDepart,
  basculerDepart,
  basculerOption,
  brouillonDepuis,
  CHAMPS_TARIF,
  changerHeure,
  changerTarif,
  erreursDuBrouillon,
  estDeplace,
  estPubliable,
  heureInitiale,
  nombreChangements,
  prixDepart,
  verifierArret,
  versModification,
  type Brouillon,
  type DepartBrouillon,
  type OptionLigne,
} from "./brouillon";
import { FeuilleArret } from "./FeuilleArret";
import { FeuillePin } from "./FeuillePin";
import { formaterMontant, lireMontant, normaliserHeure, prochainLundi } from "./formats";
import styles from "./configligne.module.css";

type Ligne = contrats.LigneEditable;

interface Props {
  ligne: Ligne;
  /** Immatriculation du bus par départ, d'après l'analyse de la ligne (que `LigneEditable` ne porte pas). */
  bus: ReadonlyMap<string, string>;
}

/** Ce que la planche écrit sous l'heure : « classique · LT 118 AB · 40 pl. », « était 10:00 · proposé par l'assistant »… */
function detailDepart(
  t: TFunction<"ConfigLigne">,
  d: DepartBrouillon,
  capacite: number,
  bus: string | null,
): string {
  const segments: string[] = [];
  const avant = heureInitiale(d);
  if (d.nouveau) segments.push(t("departs.nouveau"));
  else if (avant !== null) segments.push(t("departs.etait", { heure: avant }));
  else segments.push(t(`departs.classe.${d.classe}`));
  if (d.jours.length > 0) {
    segments.push(
      t("departs.seulement", { jours: d.jours.map((j) => t(`jours.${j}`)).join(", ") }),
    );
  }
  if (bus !== null) segments.push(bus, t("departs.places", { count: capacite }));
  if (d.note !== null) segments.push(d.note);
  return segments.join(" · ");
}

function libelleHeure(t: TFunction<"ConfigLigne">, d: DepartBrouillon): string {
  if (d.nouveau) {
    return d.jours.length === 1
      ? t("departs.heureNouveauJour", { jour: t(`jours.${d.jours[0]!}`) })
      : t("departs.heureNouveau");
  }
  if (estDeplace(d)) return t("departs.heureModifiee");
  return t("departs.heure", { heure: d.base?.heure ?? d.heure });
}

function LigneDepart({
  depart,
  brouillon,
  capacite,
  bus,
  invalide,
  vise,
  onHeure,
  onBasculer,
}: {
  depart: DepartBrouillon;
  brouillon: Brouillon;
  capacite: number;
  bus: string | null;
  invalide: boolean;
  /** Le départ dont l'adresse (`?depart=`) a ouvert l'écran : on l'amène à l'œil, sans rien changer à son aspect. */
  vise: boolean;
  onHeure: (cle: string, heure: string) => void;
  onBasculer: (cle: string) => void;
}) {
  const { t } = useTranslation("ConfigLigne");
  const etat = depart.nouveau ? "nouveau" : estDeplace(depart) ? "modifie" : "normal";
  const rangee = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (vise) rangee.current?.scrollIntoView?.({ block: "center" });
  }, [vise]);
  return (
    <div
      ref={rangee}
      className={styles.depart}
      data-etat={etat}
      {...(vise ? { "data-vise": "" } : {})}
    >
      <label className={styles.zoneHeure}>
        <input
          type="text"
          className={styles.champHeure}
          aria-label={libelleHeure(t, depart)}
          aria-invalid={invalide ? true : undefined}
          value={depart.heure}
          maxLength={5}
          autoComplete="off"
          onChange={(e) => onHeure(depart.cle, e.target.value)}
          onBlur={(e) => {
            // « 9h15 » devient « 09:15 » en quittant le champ ; une saisie qui n'est pas une heure reste telle quelle.
            const heure = normaliserHeure(e.target.value);
            if (heure !== null && heure !== e.target.value) onHeure(depart.cle, heure);
          }}
        />
      </label>
      <span className={styles.departDetail}>{detailDepart(t, depart, capacite, bus)}</span>
      <span className={styles.departPrix}>{formaterMontant(prixDepart(brouillon, depart))}</span>
      <Interrupteur
        className={styles.bascule}
        checked={depart.actif}
        onChange={() => onBasculer(depart.cle)}
        aria-label={
          depart.heure.trim() === ""
            ? t("departs.actifNouveau")
            : t("departs.actif", { heure: depart.base?.heure ?? depart.heure })
        }
      />
    </div>
  );
}

function LigneOption({
  libelle,
  actif,
  onBasculer,
}: {
  libelle: string;
  actif: boolean;
  onBasculer: () => void;
}) {
  return (
    <label className={styles.option}>
      <span>{libelle}</span>
      <Interrupteur className={styles.bascule} checked={actif} onChange={onBasculer} />
    </label>
  );
}

/**
 * Le brouillon de la ligne : départs, tarifs, arrêts, plan de sièges, deux interrupteurs. Tout ce qui est changé ici
 * reste dans l'écran jusqu'à « Publier dès lundi », qui demande le PIN, envoie la ligne entière (`useModifierLigne`) et
 * revient aux réglages. « Annuler » jette le brouillon : rien n'a quitté l'écran, rien n'a changé pour les guichets.
 */
export function EditeurLigne({ ligne, bus }: Props) {
  const { t } = useTranslation("ConfigLigne");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const client = useClientApi();
  const modifier = patron.useModifierLigne();
  const signer = patron.useSignaturePin();

  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDepuis(ligne));
  const [tentative, setTentative] = useState(false);
  const [pinOuvert, setPinOuvert] = useState(false);
  const [arretOuvert, setArretOuvert] = useState(false);
  const [echec, setEchec] = useState(false);
  const rang = useRef(0);

  const erreurs = erreursDuBrouillon(brouillon);
  const changements = nombreChangements(brouillon, ligne);
  // `?depart=` (lien d'un départ de l'analyse de la ligne) désigne le départ visé ; sinon le premier départ existant.
  const departVise = params.get("depart");
  const departModifiable =
    brouillon.departs.find((d) => d.id !== null && d.id === departVise)?.id ??
    brouillon.departs.find((d) => d.id !== null)?.id ??
    null;

  function publier() {
    if (!estPubliable(erreurs)) {
      setTentative(true);
      return;
    }
    setTentative(false);
    setEchec(false);
    setPinOuvert(true);
  }

  /** Signe et publie. `false` : PIN refusé. Réussi : retour aux réglages, où la ligne est à jour. */
  async function signerEtPublier(pin: string): Promise<boolean> {
    const effetDu =
      ligne.brouillon.publicationA?.slice(0, 10) ?? prochainLundi(client.horloge.iso());
    try {
      await modifier.mutateAsync(versModification(brouillon, ligne, signer(pin), effetDu));
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      setEchec(true);
      throw erreur;
    }
    void navigate(urlPlanche("Config"));
    return true;
  }

  return (
    <div className={styles.racine} data-planche="ConfigLigne">
      <Entete
        className={styles.entete}
        titre={ligne.nom}
        sousTitre={t("sousTitre", {
          departs: t("nbDeparts", { count: brouillon.departs.length }),
          arrets: t("nbArrets", { count: brouillon.arrets.length }),
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Config") }}
        droite={<Pastille statut="brouillon" />}
      />

      <EcranCorps className={styles.corps}>
        <section className={styles.departs} aria-label={t("departs.titre")}>
          <div className={styles.departsTete}>
            <h2 className={styles.departsTitre}>{t("departs.titre")}</h2>
            <button
              type="button"
              className={styles.lien}
              onClick={() => setBrouillon((b) => ajouterDepart(b, ++rang.current))}
            >
              {t("departs.ajouter")}
            </button>
          </div>
          {brouillon.departs.map((depart) => (
            <LigneDepart
              key={depart.cle}
              depart={depart}
              brouillon={brouillon}
              capacite={ligne.plan.capacite}
              bus={depart.id ? (bus.get(depart.id) ?? null) : null}
              invalide={tentative && erreurs.departs.includes(depart.cle)}
              vise={depart.id !== null && depart.id === departVise}
              onHeure={(cle, heure) => setBrouillon((b) => changerHeure(b, cle, heure))}
              onBasculer={(cle) => setBrouillon((b) => basculerDepart(b, cle))}
            />
          ))}
        </section>

        <div className={styles.grille}>
          <section className={styles.carte} aria-label={t("tarifs.titre")}>
            <h2 className={styles.etiquette}>{t("tarifs.titre")}</h2>
            {CHAMPS_TARIF.map((champ) => (
              <span key={champ} className={styles.tarif}>
                <span>{t(`tarifs.${champ}`)}</span>
                <label className={styles.zoneTarif}>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={styles.champTarif}
                    aria-label={t(`tarifs.champ.${champ}`)}
                    aria-invalid={tentative && erreurs.tarifs.includes(champ) ? true : undefined}
                    autoComplete="off"
                    value={
                      brouillon.tarifs[champ] === null
                        ? ""
                        : formaterMontant(brouillon.tarifs[champ])
                    }
                    onChange={(e) =>
                      setBrouillon((b) => changerTarif(b, champ, lireMontant(e.target.value)))
                    }
                  />
                </label>
              </span>
            ))}
          </section>

          <section className={styles.carte} aria-label={t("arrets.titre")}>
            <h2 className={styles.etiquette}>{t("arrets.titre")}</h2>
            {brouillon.arrets.map((arret) => (
              <span key={arret.cle} className={styles.arret}>
                <strong>{arret.nom}</strong> ·{" "}
                {arret.prorata === null
                  ? t("arrets.prorataAPublier")
                  : t("arrets.prorata", { montant: formaterMontant(arret.prorata) })}{" "}
                · {t(arret.montee ? "arrets.monteeOui" : "arrets.monteeNon")}
              </span>
            ))}
            <button
              type="button"
              className={styles.ajouterArret}
              onClick={() => setArretOuvert(true)}
            >
              {t("arrets.ajouter")}
            </button>
          </section>
        </div>

        <section className={`${styles.carte} ${styles.carteOptions}`}>
          <div className={styles.plan}>
            <span>
              {t("plan.libelle")}{" "}
              <strong>{t("plan.resume", { count: ligne.plan.capacite })}</strong>
              {t("plan.detail", {
                disposition: ligne.plan.disposition,
                rangees: t("plan.rangees", { count: ligne.plan.rangees }),
              })}
            </span>
            {departModifiable !== null && (
              <a
                className={styles.modifier}
                href={urlPlanche("SiegePay", { departId: departModifiable })}
              >
                {t("plan.modifier")}
              </a>
            )}
          </div>
          {(["venteEnLigne", "fusionAuto"] as const satisfies readonly OptionLigne[]).map(
            (option) => (
              <LigneOption
                key={option}
                libelle={t(`options.${option}`)}
                actif={brouillon.options[option]}
                onBasculer={() => setBrouillon((b) => basculerOption(b, option))}
              />
            ),
          )}
        </section>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {tentative && !estPubliable(erreurs) && (
          <p role="alert" className={styles.aCorriger}>
            {t("actions.aCorriger")}
          </p>
        )}
        <div className={styles.actions}>
          <Bouton
            variante="secondaire"
            className={styles.annuler}
            href={urlPlanche("Config")}
            libelle={t("actions.annuler")}
          />
          <Bouton
            className={styles.publier}
            libelle={t("actions.publier")}
            sousLibelle={t("actions.publierDetail", {
              changements: t("nbChangements", { count: changements }),
            })}
            icone={<IconeCoche taille={22} trait={2.8} />}
            aria-busy={modifier.isPending}
            onClick={publier}
          />
        </div>
      </EcranPied>

      <FeuilleArret
        ouverte={arretOuvert}
        onFermer={() => setArretOuvert(false)}
        verifier={(nom) => verifierArret(brouillon, nom)}
        onAjouter={(nom, montee) => {
          setBrouillon((b) => ajouterArret(b, nom, montee, ++rang.current));
          setArretOuvert(false);
        }}
      />
      <FeuillePin
        ouverte={pinOuvert}
        onFermer={() => setPinOuvert(false)}
        resume={t("nbChangements", { count: changements })}
        onSigner={signerEtPublier}
        echec={echec}
      />
    </div>
  );
}
