import { colis as api } from "@afrimove/api-client";
import { EcranCorps, EcranPied } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { Bilan, CarteVente, CartesClients, Entete, Regle, adresseVente } from "./sections";
import styles from "./vendeur.module.css";

/**
 * Écran Vendeur (AM-147, planche Vendeur.dc.html) : l'accueil du vendeur ambulant. Trois lectures de
 * `@afrimove/api-client` (`useEspaceVendeur`, `useDepartsVendeur`, `useClientsVendeur`), chacune avec son propre
 * chargement, son vide et son erreur : une lecture qui échoue ne vide pas les autres blocs. Les départs, les clients
 * et le grand bouton mènent à SiegePay (le voisin paie, le vendeur règle l'agence par MoMo dans la minute).
 */
export function EcranVendeur() {
  const { t } = useTranslation("Vendeur");
  const espace = api.useEspaceVendeur();
  const departs = api.useDepartsVendeur();
  const clients = api.useClientsVendeur();
  const liste = departs.data?.departs ?? [];

  return (
    <>
      <Entete espace={espace} />
      <EcranCorps data-planche="Vendeur">
        <CarteVente departs={departs} espace={espace} />
        <Bilan espace={espace} />
        <CartesClients clients={clients} departs={liste} />
        <Regle espace={espace} />
      </EcranCorps>
      <EcranPied className={styles.pied}>
        <a className={styles.action} href={adresseVente(liste[0])}>
          {t("action")}
        </a>
      </EcranPied>
    </>
  );
}

export default EcranVendeur;
