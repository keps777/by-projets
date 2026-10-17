import { agence } from "@afrimove/api-client";
import { ClavierPin, FeuilleModale } from "@afrimove/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  blocageEnCours,
  compteBloque,
  deriverCle,
  enregistrerBlocage,
  leverBlocage,
  pinRefuse,
  signer,
} from "@/ecrans/SuperviseurValider/pin";

/** Ce que `useSuperviseurAppareil` renvoie : l'appareil bloqué (@afrimove/contrats n'est pas lu directement ici). */
export type Appareil = NonNullable<ReturnType<typeof agence.useSuperviseurAppareil>["data"]>;
export type Option = Appareil["options"][number]["option"];

const LONGUEUR_PIN = 6;
const BLOCAGE_MS = 15 * 60_000;

/**
 * Le PIN du superviseur, dans une feuille par-dessus la planche (elle n'existe que pendant le geste : la planche
 * elle-même n'a pas de clavier). À la sixième touche, le PIN sert à dériver la clé qui signe `appareil.debloque`
 * (option choisie + appareil), puis il est oublié : seule la signature voyage.
 *
 * Le clavier du kit compte les essais : refuser le PIN (`false`) en use un, le troisième le bloque 15 minutes. Une
 * panne (réseau, superviseur inconnu) lève une erreur : « Vérification impossible », sans compter d'essai.
 */
export function FeuillePin({
  appareilId,
  option,
  titre,
  onFermer,
  onDebloque,
}: {
  appareilId: string;
  option: Option;
  titre: string;
  onFermer: () => void;
  onDebloque: (option: Option) => void;
}) {
  const { t } = useTranslation("SuperviseurDebloquer");
  const debloquer = agence.useDebloquerAppareil();
  // Le contrat de l'appareil ne dit pas qui est connecté : le superviseur de la gare est lu sur l'accueil.
  const gare = agence.useSuperviseurGare({}, { networkMode: "always" });
  const superviseur = gare.data?.superviseur;
  const superviseurId = superviseur?.id;

  const [bloqueJusqua, setBloqueJusqua] = useState<number | null>(null);
  useEffect(() => {
    if (superviseurId) setBloqueJusqua(blocageEnCours(superviseurId));
  }, [superviseurId]);

  async function surPin(pin: string): Promise<boolean | void> {
    if (!superviseurId) throw new Error("Superviseur inconnu : signature impossible");
    const cle = await deriverCle(pin, superviseurId);
    const signature = await signer(cle, { appareilId, option, superviseurId, methode: "pin" });
    try {
      await debloquer.mutateAsync({
        appareilId,
        option,
        validePar: { superviseurId, methode: "pin", signature },
      });
    } catch (erreur) {
      if (compteBloque(erreur)) {
        const jusqua = Date.now() + BLOCAGE_MS;
        enregistrerBlocage(superviseurId, jusqua);
        setBloqueJusqua(jusqua);
        return false;
      }
      if (pinRefuse(erreur)) return false;
      throw erreur;
    }
    onDebloque(option);
  }

  return (
    <FeuilleModale ouverte onFermer={onFermer} titre={titre} libelleFermer={t("pin.fermer")}>
      <ClavierPin
        longueur={LONGUEUR_PIN}
        titre={superviseur ? t("pin.titre", { nom: superviseur.nom }) : t("pin.titreCourt")}
        sousTitre={t("pin.aide", { longueur: LONGUEUR_PIN })}
        dureeBlocageMs={BLOCAGE_MS}
        bloqueJusqua={bloqueJusqua}
        onBlocage={({ jusqua }) => {
          if (superviseurId) enregistrerBlocage(superviseurId, jusqua);
        }}
        onDeblocage={() => {
          if (superviseurId) leverBlocage(superviseurId);
          setBloqueJusqua(null);
        }}
        onComplet={surPin}
      />
    </FeuilleModale>
  );
}
