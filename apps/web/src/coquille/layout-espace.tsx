import { BarreOnglets, Ecran } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { Outlet, matchPath, useLocation } from "react-router";
import { Cadre } from "./cadre";
import { GardeRole } from "./garde-role";
import { useModules } from "./modules";
import { BARRES, hrefOnglet, motifPlanche } from "./onglets";
import type { Espace } from "./roles";

type OngletsBarre = Parameters<typeof BarreOnglets>[0]["onglets"];

/**
 * Layout commun d'un espace (groupe de routes) : garde de rôle, cadre de 390 px, écran Nuit, puis la page et,
 * pour les écrans qui en ont une dans les maquettes, la barre d'onglets du bas.
 *
 * Une page de route rend donc SES éléments (en-tête, corps, pied) sans écran autour : le layout les pose dans
 * `<Ecran>`, avant la barre. Les `layout.tsx` des groupes se contentent d'appeler ce composant.
 */
export function LayoutEspace({ espace }: { espace: Espace }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { moduleActif } = useModules();

  const barre = BARRES[espace];
  const onglet = barre?.ecrans.find(([planche]) =>
    matchPath({ path: motifPlanche(planche), end: true }, pathname),
  )?.[1];

  return (
    <GardeRole espace={espace}>
      <Cadre>
        <Ecran data-espace={espace}>
          <Outlet />
          {barre && onglet !== undefined && (
            <BarreOnglets
              aria-label={t(`navigation.${espace}.aria`)}
              actif={onglet}
              // Un module masqué retire son onglet. Le kit type 4 ou 5 entrées ; avec un onglet en moins, la
              // barre en garde 3 : la structure reste valide à l'exécution.
              onglets={
                barre.onglets
                  .filter((entree) => entree.module === undefined || moduleActif(entree.module))
                  .map((entree) => ({
                    cle: entree.cle,
                    libelle: t(`navigation.${espace}.${entree.libelle}`),
                    icone: entree.icone,
                    href: hrefOnglet(entree),
                  })) as unknown as OngletsBarre
              }
            />
          )}
        </Ecran>
      </Cadre>
    </GardeRole>
  );
}
