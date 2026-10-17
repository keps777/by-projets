import { ErreurHttp, colis } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import {
  Bouton,
  Champ,
  EcranCorps,
  EcranPied,
  Entete,
  IconeFleche,
  Pastille,
  SelecteurDeroulant,
} from "@afrimove/ui";
import { useId, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import {
  abreger,
  decouperRegles,
  deplacementDe,
  formaterNombre,
  neufChiffres,
  operateurDe,
  pieceMotoDe,
} from "./formats";
import type { PieceMoto } from "./formats";
import styles from "./livreur-devenir.module.css";

type Message = "photos" | "momo" | "dejaLivreur" | "echec";

/** Les photos prises (référence opaque), une par pièce de moto. */
type Photos = Partial<Record<PieceMoto, string>>;

const options = (choix: readonly string[]) => choix.map((c) => ({ valeur: c, libelle: c }));

/**
 * L'écran : les chiffres du programme, les particularités à choisir (moyen, zone, heures, charge, MoMo), les pièces,
 * les trois règles, puis « Plus tard » et « Je m'inscris ».
 *
 * Permis et assurance ne se demandent qu'à moto : les deux cases deviennent des boutons de photo, et sans les deux
 * photos l'inscription ne part pas. Hors moto, elles restent affichées comme la maquette (« photo · si moto »).
 */
export function LivreurDevenirVue({ programme }: { programme: contrats.ProgrammeLivreur }) {
  const { t } = useTranslation("LivreurDevenir");
  const navigate = useNavigate();
  const deposer = colis.useDeposerDemandeLivreur();

  const { particularites, pieces, regles } = programme;
  const [deplacement, setDeplacement] = useState(particularites.deplacement.choix[0] ?? "");
  const [zone, setZone] = useState(particularites.zone.valeur);
  const [heures, setHeures] = useState(particularites.heures.valeur);
  const [charge, setCharge] = useState(particularites.charge.valeur);
  const [momo, setMomo] = useState(particularites.momo.valeurMasquee);
  const [photos, setPhotos] = useState<Photos>({});
  const [tentative, setTentative] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const enCours = useRef(false);
  const idDeplacement = useId();

  const moto = deplacementDe(deplacement) === "moto";
  const momoIntact = momo === particularites.momo.valeurMasquee;
  const neuf = momoIntact ? null : neufChiffres(momo);
  const momoInvalide = tentative && !momoIntact && neuf === null;
  const photoManquante = (piece: PieceMoto) => moto && photos[piece] === undefined;

  function prendrePhoto(piece: PieceMoto, evenement: ChangeEvent<HTMLInputElement>) {
    const pris = evenement.target.files?.length ?? 0;
    evenement.target.value = "";
    // Le téléversement des photos est hors de ce périmètre : on garde une référence de la photo prise.
    if (pris > 0) setPhotos((avant) => ({ ...avant, [piece]: `photo-${crypto.randomUUID()}` }));
  }

  function inscrire() {
    if (enCours.current) return;
    setTentative(true);
    const mode = deplacementDe(deplacement);
    if (mode === null) return;
    if (!momoIntact && neuf === null) {
      setMessage("momo");
      return;
    }
    if (moto && (photos.permis === undefined || photos.assurance === undefined)) {
      setMessage("photos");
      return;
    }
    setMessage(null);
    enCours.current = true;
    deposer.mutate(
      {
        deplacement: mode,
        zone,
        heures,
        chargeMax: charge,
        // Le numéro retapé en entier part avec la demande ; laissé tel quel (le MoMo masqué du compte), il ne part pas :
        // le serveur prend celui du compte.
        ...(neuf !== null
          ? { momo: { telephone: `+237${neuf}`, operateur: operateurDe(momo, neuf) } }
          : {}),
        pieces: moto
          ? {
              ...(photos.permis !== undefined ? { permisRef: photos.permis } : {}),
              ...(photos.assurance !== undefined ? { assuranceRef: photos.assurance } : {}),
            }
          : {},
        reglesAcceptees: true,
      },
      {
        onSuccess: () => void navigate(urlPlanche("LivreurVerification")),
        onError: (erreur) => {
          enCours.current = false;
          const code = erreur instanceof ErreurHttp ? erreur.code : undefined;
          // Une demande est déjà en cours : son suivi est la bonne suite.
          if (code === "demande_en_cours") void navigate(urlPlanche("LivreurVerification"));
          else setMessage(code === "deja_livreur" ? "dejaLivreur" : "echec");
        },
      },
    );
  }

  const { partParCourse: course, exemple, livreursActifs: actifs } = programme;

  return (
    <div className={styles.racine}>
      <Entete
        titre={programme.titre}
        sousTitre={programme.detail}
        retour={{ libelle: t("retour"), href: urlPlanche("Moi") }}
        droite={
          <Pastille
            statut="enCours"
            ton="bleu"
            point={false}
            libelle={t("pastille", { montant: formaterNombre(course) })}
          />
        }
      />

      <EcranCorps className={styles.corps} data-planche="LivreurDevenir">
        <div className={styles.chiffres}>
          <div className={styles.chiffre}>
            <span className={styles.chiffreLibelle}>{t("chiffres.course")}</span>
            <span className={styles.chiffreValeur}>
              {t("montant", { montant: formaterNombre(course) })}
            </span>
            <span className={styles.chiffreDetail}>{t("chiffres.courseDetail")}</span>
          </div>
          <div className={styles.chiffre}>
            <span className={styles.chiffreLibelle}>{exemple.nom}</span>
            <span className={`${styles.chiffreValeur} ${styles.gain}`}>
              {abreger(exemple.gain)}
            </span>
            <span className={styles.chiffreDetail}>
              {t("chiffres.semaine", { count: exemple.courses })}
            </span>
          </div>
          <div className={styles.chiffre}>
            <span className={styles.chiffreLibelle}>{t("chiffres.livreurs")}</span>
            <span className={styles.chiffreValeur}>{formaterNombre(actifs)}</span>
            <span className={styles.chiffreDetail}>
              {t("chiffres.villes", { count: programme.villes })}
            </span>
          </div>
        </div>

        <div className={styles.particularites}>
          <span className={styles.titreCarte}>{particularites.titre}</span>

          <div className={styles.groupe}>
            <span id={idDeplacement} className={styles.etiquette}>
              {particularites.deplacement.libelle}
            </span>
            <div className={styles.puces} role="radiogroup" aria-labelledby={idDeplacement}>
              {particularites.deplacement.choix.map((choix) => (
                <button
                  key={choix}
                  type="button"
                  role="radio"
                  aria-checked={choix === deplacement}
                  className={styles.puce}
                  onClick={() => setDeplacement(choix)}
                >
                  {choix}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.champs}>
            <SelecteurDeroulant
              variante="config"
              className={styles.champ}
              label={particularites.zone.libelle}
              options={options(particularites.zone.choix)}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
            <SelecteurDeroulant
              variante="config"
              className={styles.champ}
              label={particularites.heures.libelle}
              options={options(particularites.heures.choix)}
              value={heures}
              onChange={(e) => setHeures(e.target.value)}
            />
            <SelecteurDeroulant
              variante="config"
              className={styles.champ}
              label={particularites.charge.libelle}
              options={options(particularites.charge.choix)}
              value={charge}
              onChange={(e) => setCharge(e.target.value)}
            />
            <Champ
              variante="config"
              mono
              className={styles.champ}
              label={particularites.momo.libelle}
              value={momo}
              inputMode="tel"
              autoComplete="tel"
              onChange={(e) => setMomo(e.target.value)}
              {...(momoInvalide ? { erreur: t("messages.momo") } : {})}
            />
          </div>
        </div>

        <div className={styles.pieces}>
          {pieces.map((piece) => {
            const pieceMoto = pieceMotoDe(piece.titre);
            const contenu = (
              <>
                <strong className={styles.pieceTitre}>{piece.titre}</strong>
                {piece.detail}
              </>
            );
            if (pieceMoto === null) {
              return (
                <div key={piece.titre} className={`${styles.piece} ${styles.pieceVerifiee}`}>
                  {contenu}
                </div>
              );
            }
            if (!moto) {
              return (
                <div key={piece.titre} className={`${styles.piece} ${styles.pieceAFournir}`}>
                  {contenu}
                </div>
              );
            }
            const fournie = photos[pieceMoto] !== undefined;
            return (
              <PhotoPiece
                key={piece.titre}
                fournie={fournie}
                manquante={tentative && photoManquante(pieceMoto)}
                onPhoto={(e) => prendrePhoto(pieceMoto, e)}
              >
                {contenu}
              </PhotoPiece>
            );
          })}
        </div>

        {message !== null && (
          <p role="alert" className={styles.alerte}>
            {t(`messages.${message}`)}
          </p>
        )}

        <div className={styles.regles}>
          <span className={styles.titreRegles}>{regles.titre}</span>
          <span>
            {decouperRegles(regles.texte).map((morceau, i) =>
              morceau.gras ? <strong key={i}>{morceau.texte}</strong> : morceau.texte,
            )}
          </span>
        </div>

        <span className={styles.mention}>{programme.mention}</span>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <a className={styles.plusTard} href={urlPlanche("Moi")}>
          {t("actions.plusTard")}
        </a>
        <Bouton
          className={styles.inscrire}
          libelle={t("actions.inscrire")}
          sousLibelle={t("actions.inscrireDetail")}
          icone={<IconeFleche taille={22} trait={2.6} />}
          aria-busy={deposer.isPending}
          onClick={inscrire}
        />
      </EcranPied>
    </div>
  );
}

/** Case d'une pièce de moto : un bouton qui ouvre l'appareil photo, vert une fois la photo prise. */
function PhotoPiece({
  fournie,
  manquante,
  onPhoto,
  children,
}: {
  fournie: boolean;
  manquante: boolean;
  onPhoto: (evenement: ChangeEvent<HTMLInputElement>) => void;
  children: ReactNode;
}) {
  const fichier = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={`${styles.piece} ${fournie ? styles.pieceVerifiee : styles.pieceAFournir} ${styles.pieceBouton}`}
        aria-pressed={fournie}
        data-manquante={manquante ? "true" : undefined}
        onClick={() => fichier.current?.click()}
      >
        {children}
      </button>
      <input
        ref={fichier}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.fichier}
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPhoto}
      />
    </>
  );
}
