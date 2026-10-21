import { useTranslation } from "react-i18next";
import { contexteGenre, heureDouala, tonAvatar, type Equipe, type Personne } from "./formats";
import styles from "./superviseur-equipe.module.css";

function useTextes() {
  const { t } = useTranslation("SuperviseurEquipe");

  /** « Joseph M. · guichetier · guichet 2 » */
  function ligne(p: Personne): string {
    const role = t(`roles.${p.role}`, contexteGenre(p.nom));
    return p.affectation
      ? t("liste.ligne", { nom: p.nom, role, affectation: p.affectation })
      : t("liste.ligneSansAffectation", { nom: p.nom, role });
  }

  /** « PIN à renouveler · 3 écarts en 10 jours », « PIN OK · en route vers Yaoundé », « bloquée · 3 PIN faux à 09:40 » */
  function etat(p: Personne): { texte: string; ton: "ambre" | "rouge" | "doux" } {
    if (p.pin.etat === "bloque") {
      return {
        texte: t("pin.bloque", {
          faux: p.pin.fauxEssais,
          heure: p.pin.bloqueA ? heureDouala(p.pin.bloqueA) : "",
          ...contexteGenre(p.nom),
        }),
        ton: "rouge",
      };
    }
    const debut = t(p.pin.etat === "ok" ? "pin.ok" : "pin.aRenouveler");
    const suite = p.alerte ?? p.situation;
    return {
      texte: suite ? `${debut} · ${suite}` : debut,
      ton: p.pin.etat === "ok" ? "doux" : "ambre",
    };
  }

  function statut(p: Personne): string {
    return t(`statut.${p.statut === "bloquee" ? "bloquee" : p.statut}`, contexteGenre(p.nom));
  }

  return { t, ligne, etat, statut };
}

/**
 * « En service aujourd'hui » : une ligne par personne, la ligne choisie est ouverte dans la fiche. Les personnes en
 * plus (celles que la planche résume par « + 5 autres ») ne sont qu'un décompte.
 */
export function ListeEquipe({
  equipe,
  choisie,
  onChoisir,
}: {
  equipe: Equipe;
  choisie: string;
  onChoisir: (personneId: string) => void;
}) {
  const { t, ligne, etat, statut } = useTextes();
  const { autres } = equipe;

  return (
    <div className={styles.liste}>
      <div className={styles.listeTete}>
        <h2 className={styles.listeTitre}>{t("liste.titre")}</h2>
        <span className={styles.listeAide}>{t("liste.aide")}</span>
      </div>
      {equipe.enService.map((p) => {
        const { texte, ton } = etat(p);
        return (
          <button
            key={p.personneId}
            type="button"
            className={styles.personne}
            aria-pressed={p.personneId === choisie}
            onClick={() => onChoisir(p.personneId)}
          >
            <span className={styles.avatar} data-ton={tonAvatar(p)} aria-hidden="true">
              {p.initiales}
            </span>
            <span className={styles.personneTextes}>
              <span className={styles.personneNom}>{ligne(p)}</span>
              <span className={styles.personneEtat} data-ton={ton}>
                {texte}
              </span>
            </span>
            <span
              className={styles.personneStatut}
              {...(p.statut === "bloquee" ? { "data-ton": "rouge" } : {})}
            >
              {statut(p)}
            </span>
          </button>
        );
      })}
      {autres.nombre > 0 && (
        <div className={styles.autres}>
          {autres.detail
            ? t("liste.autresDetail", { count: autres.nombre, detail: autres.detail })
            : t("liste.autres", { count: autres.nombre })}
        </div>
      )}
    </div>
  );
}
