import { ChampRecherche, FeuilleModale } from "@afrimove/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  filtrerClients,
  initiales,
  lireClientsConnus,
  telephoneNational,
  type ClientConnu,
} from "./clients-connus";
import { useTextesFeuilles } from "./textes";
import styles from "./feuilles.module.css";

interface PropsFeuilleClientConnu {
  ouverte: boolean;
  onFermer: () => void;
  /** Touche d'un client : le billet se remplit avec lui, la feuille se referme. */
  onChoisir: (client: ClientConnu) => void;
  /** Le carnet à montrer ; sans lui, celui de l'appareil (`lireClientsConnus`). */
  clients?: readonly ClientConnu[];
  ancrage?: "ecran" | "parent";
}

/** « 2027-01-05T08:30:00+01:00 » -> « 5 janv. », le jour qu'il est alors à Douala. */
export function jourCourt(iso: string, langue: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  return new Intl.DateTimeFormat(langue, {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Douala",
  }).format(instant);
}

/**
 * Feuille « Client connu » de la vente (bouton « Client connu ↓ ») : les voyageurs déjà servis à ce guichet, avec une
 * recherche par nom ou par numéro. Toucher un client remplit nom, téléphone et pièce du billet. Aucune planche ne la
 * dessine (ticket AM-183). Montée à l'ouverture seulement : chaque ouverture relit le carnet et repart d'une
 * recherche vide.
 */
export function FeuilleClientConnu({
  ouverte,
  onFermer,
  onChoisir,
  clients,
  ancrage = "parent",
}: PropsFeuilleClientConnu) {
  const { t } = useTextesFeuilles();
  const { i18n } = useTranslation();
  const [saisie, setSaisie] = useState("");
  const carnet = useMemo(() => clients ?? (ouverte ? lireClientsConnus() : []), [clients, ouverte]);
  const trouves = useMemo(() => filtrerClients(carnet, saisie), [carnet, saisie]);

  return (
    <FeuilleModale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={t("clientConnu.titre")}
      sousTitre={t("clientConnu.sousTitre")}
      libelleFermer={t("fermer")}
      ancrage={ancrage}
    >
      <div className={styles.contenu}>
        {carnet.length === 0 ? (
          <p className={styles.etat} role="status">
            {t("clientConnu.vide")}
          </p>
        ) : (
          <>
            <ChampRecherche
              label={t("clientConnu.recherche")}
              placeholder={t("clientConnu.recherche")}
              value={saisie}
              onChange={setSaisie}
              autoFocus
            />
            {trouves.length === 0 ? (
              <p className={styles.etat} role="status">
                {t("clientConnu.aucun")}
              </p>
            ) : (
              <ul className={styles.liste} aria-label={t("clientConnu.liste")}>
                {trouves.map((client) => (
                  <li key={`${client.telephone ?? ""}|${client.nom}`}>
                    <button
                      type="button"
                      className={styles.client}
                      onClick={() => onChoisir(client)}
                    >
                      <span className={styles.initiales} aria-hidden="true">
                        {initiales(client.nom)}
                      </span>
                      <span className={styles.identite}>
                        <span className={styles.nom}>{client.nom}</span>
                        <span className={styles.clientNumero}>
                          {client.telephone !== null
                            ? telephoneNational(client.telephone)
                            : t("clientConnu.sansNumero")}
                          {client.pieceQuatreDerniers !== null &&
                            ` · ${t("clientConnu.piece", { chiffres: client.pieceQuatreDerniers })}`}
                        </span>
                        <span className={styles.clientNote}>
                          {t("clientConnu.derniere", {
                            date: jourCourt(client.dernierBilletA, i18n.language),
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </FeuilleModale>
  );
}
