import { ErreurHttp, agence } from "@afrimove/api-client";
import type { agence as c } from "@afrimove/contrats";
import {
  Bouton,
  EcranCorps,
  EcranPied,
  Entete,
  IconeCoche as IconeCocheKit,
  Pastille,
} from "@afrimove/ui";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import { formaterMontant, heureDeIso, heureDoualaDe, sequenceSur4 } from "../Cadence/format";
import { useScanContinu } from "../Quai/useScanContinu";
import { partDe, heureSecondes } from "./completion";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import {
  FormulaireCompletion,
  ID_FORMULAIRE,
  type Donnees,
  type Issue,
} from "./FormulaireCompletion";
import { IconeAlerte, IconeCoche, IconeRefus, IconeScan } from "./icones";
import styles from "./cadence-quai.module.css";

export type QuaiCadence = NonNullable<ReturnType<typeof agence.useQuaiCadence>["data"]>;
type ScanQuai = c.ScanQuai;

/** Planche « CadenceQuai » (20c) : le convoyeur scanne un billet de cadence sans nom, complète nom et pièce, embarque. */
export function EcranCadenceQuai() {
  const requete = agence.useQuaiCadence();

  // Une relecture qui échoue ne retire pas le billet déjà chargé : le convoyeur peut finir de le compléter.
  if (requete.data) return <Completer quai={requete.data} />;
  if (requete.isPending) return <EtatChargement />;
  const erreur = requete.error;
  return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
    <EtatVide />
  ) : (
    <EtatErreur onReessayer={() => void requete.refetch()} />
  );
}

/** Ce que dit la carte du haut quand le dernier scan fait sur cet écran n'est pas un billet à compléter. */
type AutreScan = ScanQuai | "introuvable" | "echec";

function Completer({ quai }: { quai: QuaiCadence }) {
  const { t } = useTranslation("CadenceQuai");
  const maintenant = useMaintenant(30_000);
  const departId = quai.depart.departId;
  const scanner = agence.useScannerAuQuai();
  const completer = agence.useCompleterBillet();

  // Billets rendus nominatifs depuis cet écran (identifiant -> nom) : tant que le prochain n'est pas scanné, il n'y a
  // rien à compléter. Le serveur, lui, refuse de nommer deux fois le même billet (409).
  const [nominatifs, setNominatifs] = useState<ReadonlyMap<string, string>>(new Map());
  const [autre, setAutre] = useState<AutreScan | null>(null);

  const file = useRef<Promise<unknown>>(Promise.resolve());

  /** Un scan à la fois, dans l'ordre : deux billets présentés coup sur coup sont tous les deux lus. */
  function surQr(qr: string) {
    const travail = async () => {
      try {
        const resultat = await scanner.mutateAsync({ departId, qr });
        // Un billet sans nom devient le billet de l'écran (la lecture est rechargée après l'écriture).
        setAutre(resultat.scan.resultat === "sans_nom" ? null : resultat.scan);
      } catch (erreur) {
        // Le serveur ne connaît pas ce QR (404) : c'est un refus, pas une panne.
        setAutre(erreur instanceof ErreurHttp && erreur.statut === 404 ? "introuvable" : "echec");
      }
    };
    file.current = file.current.then(travail, travail);
  }

  const camera = useScanContinu(true, surQr);

  async function completerBillet(donnees: Donnees): Promise<Issue> {
    const billetId = quai.scan.billetId;
    try {
      await completer.mutateAsync({ billetId, departId, ...donnees, embarquer: true });
    } catch (erreur) {
      return erreur instanceof ErreurHttp && erreur.statut === 409 ? "deja" : "echec";
    }
    setNominatifs((avant) => new Map(avant).set(billetId, donnees.nom));
    setAutre(null);
    return "ok";
  }

  const { scan, embarquement, sansNom } = quai;
  const nomEmbarque = nominatifs.get(scan.billetId);
  const mode = t(`modes.${scan.paiement}`);

  return (
    <>
      <Entete
        className={styles.entete}
        titre={t("enTete.titre", {
          quai: quai.quai,
          heure: heureDeIso(quai.depart.heureDepart),
          destination: quai.depart.destination,
        })}
        sousTitre={t("enTete.sousTitre", { convoyeur: quai.convoyeur.nom })}
        retour={{ libelle: t("retour"), href: urlPlanche("CadenceBillet") }}
        droite={<Pastille statut="sync" libelle={heureDoualaDe(maintenant)} />}
      />

      <EcranCorps className={styles.corps} data-planche="CadenceQuai">
        {autre !== null && <CarteAutreScan autre={autre} />}

        {nomEmbarque === undefined ? (
          <section className={styles.scan} role="status" aria-label={t("scan.libelle")}>
            <div className={styles.scanLigne}>
              <span className={styles.scanTitre}>
                <IconeScan />
                {t("scan.libelle")}
              </span>
              <span className={styles.scanHeure}>{heureSecondes(scan.at)}</span>
            </div>
            <div className={styles.scanLigneBase}>
              <span className={styles.scanNumero}>{scan.numero}</span>
              <span className={styles.scanSiege}>{t("scan.siege", { numero: scan.siege })}</span>
            </div>
            <span className={styles.scanDetail}>
              {t("scan.vente", {
                heure: heureDeIso(scan.venduA),
                guichet: scan.guichetRang,
                mode,
                montant: formaterMontant(scan.montant),
                validite: t(scan.validePourCeDepart ? "scan.valide" : "scan.nonValide"),
              })}
            </span>
          </section>
        ) : (
          <section className={`${styles.scan} ${styles.scanFait}`} role="status">
            <div className={styles.scanLigne}>
              <span className={styles.scanTitre}>
                <span className={styles.scanRond}>
                  <IconeCoche />
                </span>
                {t("suivant.titre", { nom: nomEmbarque })}
              </span>
            </div>
            <div className={styles.scanLigneBase}>
              <span className={styles.scanNumero}>{scan.numero}</span>
              <span className={styles.scanSiege}>{t("scan.siege", { numero: scan.siege })}</span>
            </div>
            <span className={styles.scanDetail}>{t("suivant.detail")}</span>
          </section>
        )}

        {nomEmbarque === undefined && (
          <FormulaireCompletion
            key={scan.billetId}
            saisie={quai.saisie}
            onCompleter={completerBillet}
          />
        )}

        <section className={styles.embarques} aria-label={t("embarquement.libelle")}>
          <span className={styles.embarquesChiffre}>
            <span className={styles.grand}>
              {embarquement.embarques}
              <span className={styles.grandSur}>/{embarquement.capacite}</span>
            </span>
            <span className={styles.embarquesLibelle}>{t("embarquement.libelle")}</span>
          </span>
          <span className={styles.barreBloc}>
            <span className={styles.barre}>
              <span
                className={styles.segmentVert}
                style={{ width: `${partDe(embarquement.nominatifs, embarquement.capacite)}%` }}
              />
              <span
                className={styles.segmentAmbre}
                style={{
                  width: `${partDe(embarquement.cadenceCompletes, embarquement.capacite)}%`,
                }}
              />
            </span>
            <span className={styles.barreLegende}>
              <span>
                <span className={styles.nombreVert}>{embarquement.nominatifs}</span>{" "}
                {t("embarquement.nominatifs")}{" "}
                <span className={styles.nombreAmbre}>{embarquement.cadenceCompletes}</span>{" "}
                {t("embarquement.completes")}
              </span>
              <span className={styles.depart}>
                {t("embarquement.depart", { heure: heureDeIso(quai.depart.heureDepart) })}
              </span>
            </span>
          </span>
        </section>

        <section className={styles.liste} aria-label={t("sansNom.titre")}>
          <div className={styles.listeEntete}>
            <span>{t("sansNom.titre")}</span>
            <span className={styles.listeTotal}>{sansNom.total}</span>
          </div>
          <div className={styles.lignes}>
            {sansNom.liste.length === 0 && <p className={styles.ligneVide}>{t("sansNom.aucun")}</p>}
            {sansNom.liste.map((billet) => (
              <div key={billet.billetId} className={styles.ligne}>
                <span>
                  <strong className={styles.ligneNumero}>{sequenceSur4(billet.sequence)}</strong>{" "}
                  {t("sansNom.detail", {
                    siege: billet.siege,
                    heure: heureDeIso(billet.venduA),
                    mode: t(`modes.${billet.paiement}`),
                  })}
                  {billet.smsEnvoye && (
                    <>
                      {" · "}
                      <span className={styles.ligneSms}>{t("sansNom.sms")}</span>
                    </>
                  )}
                </span>
                <span className={styles.ligneAction}>{t("sansNom.action")}</span>
              </div>
            ))}
          </div>
        </section>

        <p className={styles.note}>
          <span className={styles.noteIcone}>
            <IconeAlerte />
          </span>
          {t("rapport")}
        </p>

        <video
          ref={camera.refVideo}
          className={styles.camera}
          muted
          playsInline
          aria-hidden="true"
        />
      </EcranCorps>

      <EcranPied className={styles.pied} data-seul={nomEmbarque !== undefined ? "" : undefined}>
        <a href={urlPlanche("Quai")} className={styles.vue}>
          {t("pied.vue")}
        </a>
        {nomEmbarque === undefined && (
          <Bouton
            type="submit"
            form={ID_FORMULAIRE}
            variante="assistant"
            className={styles.embarquer}
            aria-busy={completer.isPending}
            libelle={t("pied.embarquer.libelle", { siege: scan.siege })}
            sousLibelle={t("pied.embarquer.detail")}
            icone={<IconeCocheKit taille={22} trait={2.8} />}
          />
        )}
      </EcranPied>
    </>
  );
}

/** Un scan fait sur cet écran qui n'est pas un billet à compléter : accepté, refusé, ou pas parti. */
function CarteAutreScan({ autre }: { autre: AutreScan }) {
  const { t } = useTranslation("CadenceQuai");

  if (autre === "echec" || autre === "introuvable") {
    const echec = autre === "echec";
    return (
      <div className={`${styles.scan} ${styles.scanRefus}`} role="alert">
        <div className={styles.scanLigne}>
          <span className={styles.scanTitre}>
            {echec ? t("autreScan.echec.titre") : t("autreScan.titre.introuvable")}
          </span>
        </div>
        {echec && <span className={styles.scanDetail}>{t("autreScan.echec.detail")}</span>}
      </div>
    );
  }

  const refus = autre.resultat !== "monte";
  return (
    <div
      className={`${styles.scan} ${refus ? styles.scanRefus : styles.scanFait}`}
      role={refus ? "alert" : "status"}
    >
      <div className={styles.scanLigne}>
        <span className={styles.scanTitre}>
          <span className={styles.scanRond}>{refus ? <IconeRefus /> : <IconeCoche />}</span>
          {t(`autreScan.titre.${autre.resultat}`)}
        </span>
        <span className={styles.scanHeure}>{heureSecondes(autre.at)}</span>
      </div>
      {autre.voyageur !== null && (
        <div className={styles.scanLigneBase}>
          <span className={styles.scanNumero}>{autre.voyageur}</span>
          {autre.siege !== null && (
            <span className={styles.scanSiege}>{t("scan.siege", { numero: autre.siege })}</span>
          )}
        </div>
      )}
      <span className={styles.scanDetail}>{autre.numero}</span>
    </div>
  );
}
