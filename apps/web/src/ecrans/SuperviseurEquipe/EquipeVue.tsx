import { Bouton, EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { EXEMPLES_PARAMS, urlPlanche } from "@/coquille/planches";
import { Fiche, type DemandeFiche } from "./Fiche";
import { FeuilleActions, type Feuille, type Resultat } from "./FeuilleActions";
import { FeuilleJournal } from "./FeuilleJournal";
import { ListeEquipe } from "./ListeEquipe";
import { prenom, type Equipe } from "./formats";
import { IconeCadenas } from "./icones";
import styles from "./superviseur-equipe.module.css";

/**
 * L'équipe affichée : la liste « En service aujourd'hui », la fiche de la personne choisie et ses actions.
 *
 * Toute action qui change un compte ouvre la feuille « Mon PIN » : le PIN du superviseur signe l'action, qui est
 * tracée et visible par le patron. « Renouveler · mon PIN » envoie le PIN provisoire par SMS, puis mène à l'écran du
 * PIN du superviseur (SuperviseurValider), comme la planche. La planche ne dit pas quelle clôture : on vise celle des
 * valeurs d'exemple, la clôture du guichet 2 (point douteux signalé dans le rapport).
 */
export function EquipeVue({ equipe }: { equipe: Equipe }) {
  const { t } = useTranslation("SuperviseurEquipe");
  const navigate = useNavigate();

  const [choisieId, setChoisieId] = useState<string | undefined>(
    equipe.fiche?.personneId ?? equipe.enService[0]?.personneId,
  );
  const [feuille, setFeuille] = useState<Feuille | null>(null);
  const [journalDe, setJournalDe] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  // La personne choisie peut avoir quitté la liste (compte désactivé) : on retombe sur la première.
  const choisie = equipe.enService.find((p) => p.personneId === choisieId) ?? equipe.enService[0];
  const urlValider = urlPlanche("SuperviseurValider", EXEMPLES_PARAMS);

  function demander(demande: DemandeFiche) {
    setResultat(null);
    if (demande.genre === "journal") setJournalDe(demande.personneId);
    else setFeuille(demande);
  }

  function apresAction(fait: Resultat) {
    const etaitRenouvellement = feuille?.genre === "renouveler";
    setFeuille(null);
    setResultat(fait);
    if (etaitRenouvellement) void navigate(urlValider);
  }

  function surRenouveler(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (choisie) demander({ genre: "renouveler", personneId: choisie.personneId });
  }

  const annonce = resultat
    ? t(`resultat.${resultat.cle}`, { nom: resultat.nom, prenom: prenom(resultat.nom) })
    : null;
  const journal = journalDe ? equipe.enService.find((p) => p.personneId === journalDe) : undefined;

  return (
    <>
      <Entete
        titre={t("titre")}
        sousTitre={t("sousTitre", { gare: equipe.gare.nom, count: equipe.effectif })}
        retour={{ libelle: t("retour"), href: urlPlanche("Superviseur") }}
        droite={
          <button
            type="button"
            className={styles.ajouter}
            onClick={() => void navigate(urlPlanche("ConfigPersonne", { personneId: "nouvelle" }))}
          >
            {t("ajouter")}
          </button>
        }
      />

      <EcranCorps className={styles.corps} data-planche="SuperviseurEquipe" data-etat="pret">
        <ListeEquipe
          equipe={equipe}
          choisie={choisie?.personneId ?? ""}
          onChoisir={(id) => {
            setChoisieId(id);
            setResultat(null);
          }}
        />
        {choisie && (
          <Fiche equipe={equipe} personne={choisie} annonce={annonce} onDemander={demander} />
        )}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <Bouton
          variante="secondaire"
          className={styles.annuler}
          href={urlPlanche("Superviseur")}
          libelle={t("pied.annuler")}
        />
        <Bouton
          variante="principal"
          className={styles.renouveler}
          href={urlValider}
          libelle={t("pied.renouveler.libelle")}
          sousLibelle={t("pied.renouveler.detail", { prenom: prenom(choisie?.nom ?? "") })}
          icone={<IconeCadenas />}
          onClick={surRenouveler}
        />
      </EcranPied>

      {feuille && (
        <FeuilleActions
          feuille={feuille}
          equipe={equipe}
          onFermer={() => setFeuille(null)}
          onFait={apresAction}
        />
      )}
      {journalDe && (
        <FeuilleJournal
          personneId={journalDe}
          titre={t("fiche.actions.voir_journal.titre")}
          sousTitre={journal?.nom ?? ""}
          onFermer={() => setJournalDe(null)}
        />
      )}
    </>
  );
}
