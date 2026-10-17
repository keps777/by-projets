import { ErreurHttp, agence } from "@afrimove/api-client";
import type { agence as contrats } from "@afrimove/contrats";
import { aleaCrypto, genererCodeBillet } from "@afrimove/domain";
import { BadgeTouche, Champ, EcranCorps, EcranPied, Entete, useConception } from "@afrimove/ui";
import { useId, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import {
  afficherTelephone,
  formaterMontant,
  heureDouala,
  lireMontant,
  lirePiece,
  lireTelephone,
  placesCourtes,
  renduCash,
  totalAPayer,
} from "./calculs";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { impressionParDefaut, type BilletAImprimer, type ImpressionBillet } from "./impression";
import { PlanSieges } from "./PlanSieges";
import styles from "./vente.module.css";

export type ContexteVente = contrats.VenteContexte;
type ModePaiement = contrats.ModePaiementAgence;

interface PropsEcranVente {
  /** Impression du billet 58 mm ; branchée sur `@afrimove/impression` quand AM-075 sera livré. */
  impression?: ImpressionBillet;
}

/** Planche « Vente » (touche 2 → 3) : vendre un billet en un écran. Lit le contexte par `useVenteContexte`. */
export function EcranVente({ impression = impressionParDefaut }: PropsEcranVente) {
  const requete = agence.useVenteContexte();

  if (requete.isPending) return <EtatChargement />;
  if (requete.isError) {
    const erreur = requete.error;
    return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
      <EtatVide />
    ) : (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    );
  }
  if (requete.data.departs.length === 0) return <EtatVide />;
  return (
    <Vendre
      contexte={requete.data}
      impression={impression}
      recharger={async () => (await requete.refetch()).data}
    />
  );
}

type Champs = "nom" | "telephone" | "piece";

interface PropsVendre {
  contexte: ContexteVente;
  impression: ImpressionBillet;
  recharger: () => Promise<ContexteVente | undefined>;
}

function Vendre({ contexte, impression, recharger }: PropsVendre) {
  const { t } = useTranslation("Vente");
  const navigate = useNavigate();
  const conception = useConception();
  const appareil = agence.useAppareilAgence();
  const vendre = agence.useVendreBillet();
  const imprimer = agence.useImprimer();
  const identifiant = useId();

  const brouillon = contexte.brouillon;
  const { tarifs } = contexte;

  const [departId, setDepartId] = useState(contexte.departChoisiId);
  const [siegeChoisi, setSiegeChoisi] = useState<number | null>(contexte.siege.propose);
  const [nom, setNom] = useState(brouillon?.passager.nom ?? "");
  const [telephone, setTelephone] = useState(
    afficherTelephone(brouillon?.passager.telephone ?? null),
  );
  const [piece, setPiece] = useState(brouillon?.passager.pieceQuatreDerniers ?? "");
  const [bagage, setBagage] = useState(brouillon?.bagage ?? false);
  const [mode, setMode] = useState<ModePaiement>(brouillon?.paiement.mode ?? "cash");
  const [recu, setRecu] = useState(
    brouillon?.paiement.mode === "cash" && brouillon.paiement.recu > 0
      ? brouillon.paiement.recu
      : totalAPayer(tarifs.classique, tarifs.bagage, brouillon?.bagage ?? false),
  );
  const [reference, setReference] = useState(brouillon?.paiement.reference ?? "");
  const [sms, setSms] = useState(brouillon?.sms ?? true);
  const [erreurs, setErreurs] = useState<Partial<Record<Champs, string>>>({});
  const [alerte, setAlerte] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const enCours = useRef(false);
  /** Billet déjà vendu dont l'impression a échoué : le bouton le réimprime au lieu de le revendre. */
  const vendu = useRef<BilletAImprimer | null>(null);
  const impressions = useRef(0);

  const planDisponible = departId === contexte.departChoisiId;
  const siegeAttribue = siegeChoisi === contexte.siege.propose;
  const total = totalAPayer(tarifs.classique, tarifs.bagage, bagage);
  const rendu = renduCash(recu, total) ?? 0;

  function changerSiege(numero: number) {
    setSiegeChoisi(numero);
  }

  async function imprimerBillet(billet: BilletAImprimer): Promise<boolean> {
    impressions.current += 1;
    const [physique] = await Promise.allSettled([
      impression.imprimerBillet(billet),
      imprimer.mutateAsync({
        document: "billet",
        documentId: billet.billetId,
        copies: 1,
        reimpression: impressions.current > 1,
      }),
    ]);
    if (physique.status === "rejected") {
      setAlerte(t("erreurs.impression", { numero: billet.numero }));
      return false;
    }
    return true;
  }

  async function encaisser(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (enCours.current) return;
    setAlerte(null);

    enCours.current = true;
    setOccupe(true);
    try {
      if (vendu.current) {
        if (await imprimerBillet(vendu.current)) void navigate(urlPlanche("Guichet"));
        return;
      }

      const lu = lireTelephone(telephone);
      const pieceLue = lirePiece(piece);
      const manquants: Partial<Record<Champs, string>> = {};
      if (nom.trim() === "") manquants.nom = t("erreurs.nom");
      if (!lu.ok) manquants.telephone = t("erreurs.telephone");
      if (!pieceLue.ok) manquants.piece = t("erreurs.piece");
      setErreurs(manquants);
      if (Object.keys(manquants).length > 0 || !lu.ok || !pieceLue.ok) return;
      if (mode === "cash" && renduCash(recu, total) === null) {
        setAlerte(t("erreurs.recu"));
        return;
      }
      if (mode === "orange_money" && reference.trim() === "") {
        setAlerte(t("erreurs.reference"));
        return;
      }
      if (!planDisponible) {
        setAlerte(t("erreurs.departAutre"));
        return;
      }

      const resultat = await vendre.mutateAsync({
        billetId: appareil.nouvelId(),
        departId,
        siege: siegeChoisi,
        classe: "classique",
        prix: tarifs.classique,
        bagage: bagage ? tarifs.bagage : 0,
        passager: { nom: nom.trim(), telephone: lu.valeur, pieceQuatreDerniers: pieceLue.valeur },
        paiement: {
          mode,
          recu: mode === "cash" ? recu : 0,
          rendu: mode === "cash" ? rendu : 0,
          reference: mode !== "cash" && reference.trim() !== "" ? reference.trim() : null,
        },
        codeBillet: genererCodeBillet(aleaCrypto()),
        sms,
      });
      vendu.current = resultat.billet;
      if (await imprimerBillet(resultat.billet)) void navigate(urlPlanche("Guichet"));
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.code === "SIEGE_PRIS") {
        setAlerte(t("erreurs.siegePris"));
        const frais = await recharger();
        if (frais) setSiegeChoisi(frais.siege.propose);
      } else {
        setAlerte(t("erreurs.vente"));
      }
    } finally {
      enCours.current = false;
      setOccupe(false);
    }
  }

  const montantRecap = formaterMontant(total);

  return (
    <>
      <Entete
        titre={t("titre")}
        sousTitre={t("sousTitre", {
          rang: contexte.guichet.rang,
          numero: contexte.prochainNumero.numero,
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Guichet") }}
        droite={<BadgeTouche n={2} />}
      />

      <EcranCorps className={styles.corps} data-planche="Vente">
        <div className={styles.departs}>
          {contexte.departs.map((depart) => (
            <button
              key={depart.departId}
              type="button"
              className={styles.depart}
              aria-pressed={depart.departId === departId}
              onClick={() => setDepartId(depart.departId)}
            >
              <span className={styles.departHeure}>{heureDouala(depart.heureDepart)}</span>
              <span className={styles.departDestination}>
                {t(placesCourtes(depart.placesLibres) ? "departs.placesCourt" : "departs.places", {
                  destination: depart.destination,
                  nombre: depart.placesLibres,
                })}
              </span>
            </button>
          ))}
          {contexte.autresDeparts > 0 && (
            <button type="button" className={styles.autres}>
              {t("departs.autres", { nombre: contexte.autresDeparts })}
            </button>
          )}
        </div>

        <PlanSieges
          plan={contexte.siege.plan}
          choisi={planDisponible ? siegeChoisi : null}
          libres={contexte.siege.libres}
          disponible={planDisponible}
          automatique={siegeAttribue}
          onChoisir={changerSiege}
        />

        <div className={styles.ligneNom}>
          <Champ
            className={styles.champ}
            label={t("voyageur.nom")}
            type="text"
            autoComplete="off"
            autoFocus
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            erreur={erreurs.nom}
          />
          <Champ
            className={styles.champ}
            label={t("voyageur.telephone")}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            mono
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            erreur={erreurs.telephone}
          />
        </div>
        <div className={styles.ligneOptions}>
          <Champ
            className={styles.champ}
            label={t("voyageur.piece")}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            mono
            value={piece}
            onChange={(e) => setPiece(e.target.value)}
            erreur={erreurs.piece}
          />
          <button type="button" className={styles.option}>
            {t("voyageur.clientConnu")}
          </button>
          <button
            type="button"
            className={styles.option}
            aria-pressed={bagage}
            onClick={() => setBagage((b) => !b)}
          >
            {t("voyageur.bagage", { montant: formaterMontant(tarifs.bagage) })}
          </button>
        </div>

        <div className={styles.modes}>
          <button
            type="button"
            className={styles.mode}
            aria-pressed={mode === "cash"}
            onClick={() => setMode("cash")}
          >
            <span>{t("paiement.cash")}</span>
            <span className={styles.modeDetail}>
              {t("paiement.rendu", { montant: formaterMontant(rendu) })}
            </span>
          </button>
          <button
            type="button"
            className={styles.mode}
            aria-pressed={mode === "momo"}
            onClick={() => setMode("momo")}
          >
            <span>{t("paiement.momo")}</span>
            <span className={styles.modeDetail}>{t("paiement.push")}</span>
          </button>
          <button
            type="button"
            className={styles.mode}
            aria-pressed={mode === "orange_money"}
            onClick={() => setMode("orange_money")}
          >
            <span>{t("paiement.orange")}</span>
            <span className={styles.modeDetail}>{t("paiement.reference")}</span>
          </button>
        </div>

        <div className={styles.recap}>
          {mode === "cash" && (
            <span>
              <span id={`${identifiant}-recu`}>{t("recap.recu")}</span>{" "}
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className={styles.saisie}
                aria-labelledby={`${identifiant}-recu`}
                style={{ width: `${formaterMontant(recu).length}ch` }}
                value={formaterMontant(recu)}
                onChange={(e) => setRecu(lireMontant(e.target.value))}
              />{" "}
              · {t("recap.billet", { montant: formaterMontant(tarifs.classique) })}
              {bagage && ` · ${t("recap.bagage", { montant: formaterMontant(tarifs.bagage) })}`}
            </span>
          )}
          {mode === "momo" && (
            <span>
              {t("recap.aEncaisser")} <strong className={styles.mono}>{montantRecap}</strong> ·{" "}
              {t("recap.billet", { montant: formaterMontant(tarifs.classique) })}
              {bagage && ` · ${t("recap.bagage", { montant: formaterMontant(tarifs.bagage) })}`}
            </span>
          )}
          {mode === "orange_money" && (
            <span>
              <span id={`${identifiant}-ref`}>{t("recap.referenceLibelle")}</span>{" "}
              <input
                type="text"
                autoComplete="off"
                className={styles.saisie}
                aria-labelledby={`${identifiant}-ref`}
                style={{ width: `${Math.max(reference.length, 8)}ch` }}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </span>
          )}
          <span>
            <span id={`${identifiant}-sms`}>{t("recap.sms")}</span>{" "}
            <button
              type="button"
              id={`${identifiant}-smsvaleur`}
              className={`${styles.bascule} ${sms ? styles.smsOui : styles.smsNon}`}
              aria-pressed={sms}
              aria-labelledby={`${identifiant}-sms ${identifiant}-smsvaleur`}
              onClick={() => setSms((s) => !s)}
            >
              {sms ? t("recap.oui") : t("recap.non")}
            </button>
          </span>
        </div>

        {alerte && (
          <p role="alert" className={styles.alerte}>
            {alerte}
          </p>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <a
          href={urlPlanche("Guichet")}
          className={styles.encaisser}
          aria-busy={occupe}
          onClick={(e) => void encaisser(e)}
        >
          <span className={styles.encaisserTextes}>
            <span className={styles.encaisserLibelle}>{t("encaisser.libelle")}</span>
            <span className={styles.encaisserDetail}>
              {conception ? "touche 3 · " : ""}
              {t(sms ? "encaisser.detail" : "encaisser.detailSansSms")}
            </span>
          </span>
          <span className={styles.encaisserMontant}>{montantRecap}</span>
        </a>
        <a href={urlPlanche("Superviseur")} className={styles.annuler} aria-label={t("annuler")}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </a>
      </EcranPied>
    </>
  );
}
