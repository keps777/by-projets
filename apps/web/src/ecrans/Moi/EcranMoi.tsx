import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { EcranCorps } from "@afrimove/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useModules } from "@/coquille/modules";
import { FeuilleReglages } from "@/feuilles";
import { LANGUES, changerLangue, estLangue } from "@/i18n";
import {
  Devenir,
  EnteteMoi,
  MesProches,
  MesVoyages,
  PiedMoi,
  Tuiles,
  TitreEcran,
} from "./sections";
import styles from "./moi.module.css";

/**
 * Le billet dont « Mes reçus » ouvre la page : le dernier voyage dont le reçu est disponible, sinon le premier
 * voyage de la liste. Sans voyage, il n'y a rien à ouvrir.
 */
export function billetPourRecus(historique: readonly c.ElementHistorique[]): string | undefined {
  const voyages = historique.filter((e) => e.type === "voyage");
  return (voyages.find((e) => e.recuDisponible) ?? voyages[0])?.id;
}

/**
 * Écran Moi (AM-046, planche Moi.dc.html) : profil, fidélité, parrainage, mes proches, historique des voyages et
 * des colis, « Deviens point de relais » et « Deviens livreur », langue, reçus et aide.
 *
 * Données : `useProfil`, `useFidelite`, `useParrainage`, `useProches`, `useHistorique` ; chaque bloc a ses propres
 * états (chargement, vide, erreur) pour qu'une panne ne vide pas tout l'écran. Un module masqué retire sa carte :
 * fidélité (les deux tuiles), relais, livraison, colis (lignes de l'historique) et USSD (« Aide · WhatsApp »).
 * Le bouton Réglages ouvre la feuille « Réglages » (ticket AM-183, `@/feuilles`) ; `onReglages` la remplace.
 */
export function EcranMoi({ onReglages }: { onReglages?: () => void }) {
  const { i18n } = useTranslation("Moi");
  const { moduleActif } = useModules();
  const [reglagesOuverts, setReglagesOuverts] = useState(false);

  const profil = voyageur.useProfil();
  const fidelite = voyageur.useFidelite({ enabled: moduleActif("fidelite") });
  const parrainage = voyageur.useParrainage({ enabled: moduleActif("fidelite") });
  const proches = voyageur.useProches();
  const historique = voyageur.useHistorique();

  const colisActif = moduleActif("colis");
  const elements = (historique.data ?? []).filter((e) => colisActif || e.type !== "colis");
  const billetRecus = billetPourRecus(elements);

  const langue = estLangue(i18n.language) ? i18n.language : "fr";
  function langueSuivante() {
    const suivante = LANGUES[(LANGUES.indexOf(langue) + 1) % LANGUES.length] ?? "fr";
    void changerLangue(i18n, suivante);
  }

  let recu: { billetId: string } | "chargement" | undefined;
  if (historique.isPending) recu = "chargement";
  else if (billetRecus !== undefined) recu = { billetId: billetRecus };

  return (
    <div className={styles.racine}>
      <TitreEcran />
      <EnteteMoi profil={profil} onReglages={onReglages ?? (() => setReglagesOuverts(true))} />
      <EcranCorps className={styles.corps} data-planche="Moi">
        {moduleActif("fidelite") && <Tuiles fidelite={fidelite} parrainage={parrainage} />}
        <MesProches requete={proches} />
        <MesVoyages requete={historique} elements={elements} />
        <Devenir relais={moduleActif("relais")} livreur={moduleActif("livraison")} />
        <PiedMoi
          codeLangue={langue.toUpperCase()}
          onLangue={langueSuivante}
          recu={recu}
          aide={moduleActif("ussd")}
        />
      </EcranCorps>
      {reglagesOuverts && <FeuilleReglages ouverte onFermer={() => setReglagesOuverts(false)} />}
    </div>
  );
}

export default EcranMoi;
