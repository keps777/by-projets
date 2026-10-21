import type { colis as contrats } from "@afrimove/contrats";
import { Fragment, useId } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { useMaintenant } from "@/coquille/horloge";
import {
  dateCourte,
  departPourClient,
  detailDepart,
  formaterMontant,
  heureDouala,
  jourRelatif,
  listeFrancaise,
  nomCompagnie,
  separerTrajet,
} from "./formats";
import { IconeBouclier } from "./icones";
import styles from "./vendeur.module.css";

/** Ce que les hooks de l'api-client renvoient, sans en dépendre pour les types de contrat. */
type Lecture<T> = { data: T | undefined; isError: boolean; refetch: () => unknown };

/** Adresse de la vente : le départ choisi dans SiegePay, ou la recherche de trajets quand aucun départ n'est connu. */
export function adresseVente(depart: contrats.DepartVendeur | undefined): string {
  return depart ? urlPlanche("SiegePay", { departId: depart.departId }) : urlPlanche("Main");
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** Vide ou erreur d'un bloc : un titre, une phrase et, pour l'erreur, de quoi réessayer. */
function Etat({
  cle,
  type,
  onReessayer,
  className,
}: {
  cle: "espace" | "departs" | "clients";
  type: "vide" | "erreur";
  onReessayer?: () => void;
  className?: string;
}) {
  const { t } = useTranslation("Vendeur");
  const base = `etats.${cle}.${type}` as const;
  return (
    <div
      className={className ? `${styles.etat} ${className}` : styles.etat}
      role={type === "erreur" ? "alert" : "status"}
    >
      <p className={styles.etatTitre}>{t(`${base}.titre`)}</p>
      <p className={styles.etatDetail}>{t(`${base}.detail`)}</p>
      {type === "erreur" && onReessayer && (
        <button type="button" className={styles.reessayer} onClick={onReessayer}>
          {t("etats.reessayer")}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ en-tête */

/**
 * En-tête : le titre de la planche, « Nadège · quartier Ndokoti · agréée par Alpha et Bêta » et le numéro du vendeur.
 * Le h1 de l'écran (clé commune de la coquille) est masqué : la planche n'a pas de titre de page.
 */
export function Entete({ espace }: { espace: Lecture<contrats.EspaceVendeur> }) {
  const { t } = useTranslation("Vendeur");
  const vendeur = espace.data?.vendeur;
  return (
    <header className={styles.entete}>
      <h1 className={styles.titreEcran}>{t("ecrans.Vendeur.titre", { ns: "translation" })}</h1>
      <span className={styles.identite}>
        <span className={styles.marque}>{t("titre")}</span>
        {vendeur ? (
          <span className={styles.sousTitre}>
            {t("identite", {
              nom: vendeur.nom,
              quartier: vendeur.quartier,
              compagnies: listeFrancaise(vendeur.compagnies),
            })}
          </span>
        ) : (
          !espace.isError && (
            <Squelette className={`${styles.squeletteLigne} ${styles.squeletteSousTitre}`} />
          )
        )}
      </span>
      {vendeur ? (
        <span className={styles.numero}>{t("numero", { numero: vendeur.numero })}</span>
      ) : (
        !espace.isError && <Squelette className={styles.squeletteNumero} />
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ vendre à un voisin */

function LigneDepart({
  depart,
  rang,
  commissionParDefaut,
  detailPaiement,
}: {
  depart: contrats.DepartVendeur;
  rang: number;
  commissionParDefaut: number;
  detailPaiement: string;
}) {
  const { t } = useTranslation("Vendeur");
  const detail = detailDepart(depart, rang, commissionParDefaut);
  return (
    <a className={styles.depart} data-premier={rang === 0} href={adresseVente(depart)}>
      <span className={styles.heure}>{heureDouala(depart.heureDepart)}</span>
      <span className={styles.departTextes}>
        <span className={styles.compagnie}>
          {t("vente.places", { compagnie: nomCompagnie(depart), count: depart.placesLibres })}
        </span>
        <span className={styles.departDetail}>
          {detail.type === "paiement"
            ? detailPaiement
            : t("vente.commission", { montant: formaterMontant(detail.montant) })}
        </span>
      </span>
      <span className={styles.prix}>{formaterMontant(depart.prix)}</span>
    </a>
  );
}

/**
 * Carte « Vendre à un voisin » : le trajet, le jour et les départs à vendre. Chaque départ ouvre SiegePay. La
 * commission par défaut vient de l'espace du vendeur ; sans elle, c'est celle du premier départ.
 */
export function CarteVente({
  departs,
  espace,
}: {
  departs: Lecture<contrats.DepartsVendeur>;
  espace: Lecture<contrats.EspaceVendeur>;
}) {
  const { t } = useTranslation("Vendeur");
  const maintenant = useMaintenant();
  const titreId = useId();
  const donnees = departs.data;
  const commissionParDefaut =
    espace.data?.commissionParDefaut ?? donnees?.departs[0]?.commission ?? 0;
  const trajet = donnees ? separerTrajet(donnees.trajet) : null;
  const jour = donnees ? jourRelatif(donnees.jour, maintenant) : null;

  return (
    <section className={styles.vente} aria-labelledby={titreId}>
      <div className={styles.venteHaut}>
        <span id={titreId} className={styles.etiquette}>
          {t("vente.titre")}
        </span>
        {donnees ? (
          <span className={styles.commission}>{donnees.commissionLibelle}</span>
        ) : (
          !departs.isError && (
            <Squelette className={`${styles.squeletteLigne} ${styles.squeletteSousTitre}`} />
          )
        )}
      </div>

      {donnees && trajet && jour && (
        <div className={styles.trajet}>
          <span className={styles.trajetVilles}>
            {trajet.origine}
            {trajet.destination !== null && (
              <>
                {" "}
                <span className={styles.fleche}>→</span> {trajet.destination}
              </>
            )}
          </span>
          <span className={styles.jour}>
            {jour.type === "date" ? jour.date : t(`vente.jour.${jour.type}`)}
          </span>
        </div>
      )}

      {donnees ? (
        donnees.departs.length === 0 ? (
          <Etat cle="departs" type="vide" />
        ) : (
          donnees.departs.map((depart, rang) => (
            <LigneDepart
              key={depart.departId}
              depart={depart}
              rang={rang}
              commissionParDefaut={commissionParDefaut}
              detailPaiement={donnees.detailPaiement}
            />
          ))
        )
      ) : departs.isError ? (
        <Etat cle="departs" type="erreur" onReessayer={() => void departs.refetch()} />
      ) : (
        <>
          <Squelette className={styles.squeletteDepart} />
          <Squelette className={styles.squeletteDepart} />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ chiffres du mois */

function Tuile({
  etiquette,
  valeur,
  detail,
  ton,
}: {
  etiquette: string;
  valeur: string;
  detail: string;
  ton?: "vert";
}) {
  return (
    <div className={styles.tuile}>
      <span className={styles.tuileEtiquette}>{etiquette}</span>
      <span className={styles.tuileValeur} data-ton={ton}>
        {valeur}
      </span>
      <span className={styles.tuileDetail}>{detail}</span>
    </div>
  );
}

/** Trois tuiles : billets vendus ce mois, gain du mois, clients (dont réguliers). */
export function Bilan({ espace }: { espace: Lecture<contrats.EspaceVendeur> }) {
  const { t } = useTranslation("Vendeur");
  const bilan = espace.data?.bilan;
  if (!bilan) {
    if (espace.isError) {
      return (
        <div className={styles.bilan}>
          <Etat
            cle="espace"
            type="erreur"
            className={styles.etatBilan}
            onReessayer={() => void espace.refetch()}
          />
        </div>
      );
    }
    return (
      <div
        className={styles.bilan}
        role="status"
        aria-busy="true"
        aria-label={t("etats.chargement")}
      >
        <Squelette className={styles.squeletteTuile} />
        <Squelette className={styles.squeletteTuile} />
        <Squelette className={styles.squeletteTuile} />
      </div>
    );
  }
  return (
    <div className={styles.bilan}>
      <Tuile
        etiquette={t("bilan.mois.etiquette")}
        valeur={String(bilan.billetsDuMois)}
        detail={t("bilan.mois.detail")}
      />
      <Tuile
        etiquette={t("bilan.gain.etiquette")}
        valeur={formaterMontant(bilan.gainDuMois)}
        detail={t("bilan.gain.detail", { jour: bilan.versement })}
        ton="vert"
      />
      <Tuile
        etiquette={t("bilan.clients.etiquette")}
        valeur={String(bilan.clients)}
        detail={t("bilan.clients.detail", { count: bilan.clientsReguliers })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ mes clients */

/**
 * Adresse de la revente à un client : le départ que l'API propose (`departId`), même s'il n'est pas dans la carte de
 * vente du lendemain ; sans lui (ancienne réponse), le départ de la carte dont l'heure est dans la proposition.
 */
export function adresseRevente(
  client: contrats.ClientVendeur,
  departs: readonly contrats.DepartVendeur[],
): string {
  return client.departId !== undefined
    ? urlPlanche("SiegePay", { departId: client.departId })
    : adresseVente(departPourClient(departs, client.proposition));
}

function LigneClient({ client, href }: { client: contrats.ClientVendeur; href: string }) {
  const { t } = useTranslation("Vendeur");
  const suite = [
    client.habitude === null ? client.destination : `${client.destination} ${client.habitude}`,
    client.telephoneMasque,
  ];
  const dernier = client.dernierVoyage === null ? "" : dateCourte(client.dernierVoyage);
  return (
    <a className={styles.client} href={href}>
      <span className={styles.clientTexte}>
        <strong>{client.nom}</strong>
        {suite.map((morceau, i) => (
          <Fragment key={i}>
            {" · "}
            {morceau}
          </Fragment>
        ))}
      </span>
      {client.proposition !== null ? (
        <span className={styles.clientAction}>
          {t("clients.proposition", { proposition: client.proposition })}
        </span>
      ) : dernier !== "" ? (
        <span className={styles.clientDernier}>{t("clients.dernier", { date: dernier })}</span>
      ) : null}
    </a>
  );
}

/**
 * « Mes clients · revendre en 1 touche » : un client par ligne, qui ouvre SiegePay avec le départ de la proposition
 * (`client.departId`). Repli pour une réponse sans lui : le départ de la carte dont l'heure est dans la proposition,
 * sinon le premier.
 */
export function CartesClients({
  clients,
  departs,
}: {
  clients: Lecture<contrats.ClientsVendeur>;
  departs: readonly contrats.DepartVendeur[];
}) {
  const { t } = useTranslation("Vendeur");
  const titreId = useId();
  const donnees = clients.data;
  return (
    <section className={styles.clients} aria-labelledby={titreId}>
      <div className={styles.clientsTitre}>
        {donnees ? (
          <span id={titreId}>{donnees.titre}</span>
        ) : (
          <>
            <span id={titreId} hidden>
              {t("etats.chargement")}
            </span>
            {!clients.isError && (
              <Squelette className={`${styles.squeletteLigne} ${styles.squeletteSousTitre}`} />
            )}
          </>
        )}
      </div>
      {donnees ? (
        donnees.clients.length === 0 ? (
          <Etat cle="clients" type="vide" />
        ) : (
          donnees.clients.map((client, i) => (
            <LigneClient
              key={`${client.nom}-${i}`}
              client={client}
              href={adresseRevente(client, departs)}
            />
          ))
        )
      ) : clients.isError ? (
        <Etat cle="clients" type="erreur" onReessayer={() => void clients.refetch()} />
      ) : (
        <>
          <Squelette className={styles.squeletteClient} />
          <Squelette className={styles.squeletteClient} />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ la règle */

/** « Le billet est au nom du voisin… Tu ne gardes jamais d'argent » : le texte vient de l'espace du vendeur. */
export function Regle({ espace }: { espace: Lecture<contrats.EspaceVendeur> }) {
  const regle = espace.data?.regle;
  if (regle === undefined) {
    return espace.isError ? null : <Squelette className={styles.squeletteRegle} />;
  }
  return (
    <p className={styles.regle}>
      <span className={styles.regleIcone}>
        <IconeBouclier />
      </span>
      {regle}
    </p>
  );
}
