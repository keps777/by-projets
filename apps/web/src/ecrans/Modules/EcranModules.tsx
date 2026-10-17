import { ErreurHttp, patron } from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import { EcranCorps, EcranPied } from "@afrimove/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { modules } from "./client-modules";
import { EnteteModules, EtatChargement, EtatErreur, EtatVide } from "./etats";
import { FeuillePin, type ChangementEnAttente } from "./FeuillePin";
import { LigneModule } from "./LigneModule";
import { contexteDePortee, nomCourtAgence, porteeDepuisUrl } from "./regles";
import styles from "./modules.module.css";

/**
 * Planche « Modules » (touche 3 du patron) : les 12 modules, activer ou masquer.
 *
 * - La liste (noms, phrases d'état) vient de `patron.useModules` ; l'état affiché est celui de l'agence, ou celui de la
 *   gare / de la ville quand l'URL en nomme une (`useModulesActifs`, qui applique les exceptions).
 * - Toucher un interrupteur ouvre le clavier PIN : le changement est signé, puis `modules.useChangerModule` l'applique
 *   à la portée affichée et recharge les menus.
 */
export function EcranModules() {
  const [params] = useSearchParams();
  const portee = useMemo(() => porteeDepuisUrl(params), [params]);
  const parPortee = portee.type !== "agence";

  const liste = patron.useModules();
  const lecture = modules.useModulesActifs(contexteDePortee(portee), { enabled: parPortee });
  const agence = patron.useTableauDuJour();

  const enAttente = liste.isPending || (parPortee && lecture.isPending);
  if (enAttente && !liste.isError && !lecture.isError) return <EtatChargement />;
  if (liste.isError || (parPortee && lecture.isError)) {
    return (
      <EtatErreur
        onReessayer={() => {
          void liste.refetch();
          if (parPortee) void lecture.refetch();
        }}
      />
    );
  }
  if (!liste.data || liste.data.modules.length === 0) return <EtatVide />;

  const etats = new Map<string, boolean>(
    parPortee && lecture.data
      ? lecture.data.modules.map((m) => [m.code, m.actif])
      : liste.data.modules.map((m) => [m.code, m.actif]),
  );
  return (
    <ListeModules
      liste={liste.data.modules}
      etats={etats}
      portee={portee}
      agence={agence.data ? nomCourtAgence(agence.data.compagnie) : null}
    />
  );
}

interface PropsListe {
  liste: readonly contrats.ModuleAgence[];
  etats: ReadonlyMap<string, boolean>;
  portee: contrats.PorteeModule;
  /** Nom court de l'agence, ou `null` tant qu'il n'est pas connu. */
  agence: string | null;
}

function ListeModules({ liste, etats, portee, agence }: PropsListe) {
  const { t } = useTranslation("Modules");
  const changer = modules.useChangerModule();
  const signer = patron.useSignaturePin();
  const [enAttente, setEnAttente] = useState<ChangementEnAttente | null>(null);

  const actifs = liste.filter((m) => etats.get(m.code) ?? m.actif).length;

  async function signerEtAppliquer(pin: string): Promise<boolean> {
    if (!enAttente) return true;
    try {
      await changer.mutateAsync({
        code: enAttente.code,
        actif: enAttente.actif,
        portee,
        signature: signer(pin),
      });
    } catch (erreur) {
      // PIN refusé : un essai de moins ; toute autre erreur est technique (le clavier le dit, rien n'est changé).
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      throw erreur;
    }
    setEnAttente(null);
    return true;
  }

  return (
    <>
      <EnteteModules />

      <EcranCorps className={styles.corps} data-planche="Modules">
        <ul className={styles.liste} aria-label={t("titre")}>
          {liste.map((module) => {
            const actif = etats.get(module.code) ?? module.actif;
            return (
              <LigneModule
                key={module.code}
                nom={module.nom}
                detail={module.detail}
                actif={actif}
                socle={module.socle}
                onBascule={() =>
                  setEnAttente({ code: module.code, nom: module.nom, actif: !actif })
                }
              />
            );
          })}
        </ul>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <p className={styles.notePied}>
          {agence === null
            ? t("pied.sansAgence", { actifs, total: liste.length })
            : t("pied.avecAgence", { actifs, total: liste.length, agence })}
        </p>
      </EcranPied>

      <FeuillePin
        changement={enAttente}
        onFermer={() => setEnAttente(null)}
        onPin={signerEtAppliquer}
      />
    </>
  );
}
