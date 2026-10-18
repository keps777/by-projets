import {
  ErreurAnnulee,
  ErreurDelai,
  ErreurHttp,
  ErreurReseau,
  agence,
  type ClientApi,
  type Operation,
  type OptionsExecution,
} from "@afrimove/api-client";
import type { agence as contrats } from "@afrimove/contrats";
import { versIsoDouala } from "@afrimove/domain";
import {
  AppareilBloque,
  DonneesInvalides,
  PartInconnue,
  SiegeDejaVendu,
  SiegeHorsPart,
  type EtatSync,
  type MoteurSync,
} from "@afrimove/sync";
import type { CacheLectures } from "./cache";
import {
  billetLocal,
  cashDeLaVente,
  venteDeEvenement,
  ventesEnAttente,
  type DepartConnu,
  type IdentiteAgence,
  type VenteEnFile,
} from "./ventes-locales";

/**
 * Le client d'API de l'application en mode HTTP, branché sur le moteur hors ligne `@afrimove/sync`.
 *
 * - **Ventes** (`billet.vendu`, `billet.vendu_cadence`, `billet.telephone_ajoute`) : envoyées au serveur comme avant ;
 *   si le moteur dit « hors ligne », ou si le serveur ne répond pas (réseau, délai, passerelle), l'événement — déjà créé
 *   sur l'appareil, avec son UUID et son numéro de la plage — est mis en file (`mettreEnFile`) et l'écran reçoit tout
 *   de suite le billet à imprimer. Le moteur le rejoue à la reconnexion (`POST /sync/evenements`), et le serveur en
 *   fait le même billet que `POST /agence/billets` (une seule fois : l'identifiant d'événement est la clé).
 * - **Lectures** de l'accueil, de la vente et de la cadence : la dernière lecture réussie est gardée ; sans réseau,
 *   elle est servie, corrigée de ce que l'appareil sait (ventes en file, part de sièges, état de synchronisation réel).
 * - Tout le reste passe tel quel : ce client n'invente aucune réponse du serveur.
 */

/** Les écritures qui peuvent attendre le réseau, avec la définition de leur événement. */
const VENTES = new Map<string, contrats.DefinitionEvenement<string, never, boolean>>([
  [agence.ECRITURES.billetVendu.operation.nom, agence.ECRITURES.billetVendu.evenement],
  [
    agence.ECRITURES.billetVenduCadence.operation.nom,
    agence.ECRITURES.billetVenduCadence.evenement,
  ],
  [
    agence.ECRITURES.billetTelephoneAjoute.operation.nom,
    agence.ECRITURES.billetTelephoneAjoute.evenement,
  ],
] as never);

/** Statuts HTTP qui disent « le serveur n'est pas joignable » (passerelle, délai), pas « ta demande est mauvaise ». */
const STATUTS_PANNE: ReadonlySet<number> = new Set([408, 502, 503, 504]);

export function estPanneReseau(e: unknown): boolean {
  return (
    e instanceof ErreurReseau ||
    e instanceof ErreurDelai ||
    (e instanceof ErreurHttp && STATUTS_PANNE.has(e.statut))
  );
}

export interface DepsHorsLigne {
  moteur: MoteurSync;
  cache: CacheLectures;
  /** Repli quand l'accueil n'a jamais été lu : le code agence et le code gare de l'appareil. */
  identite: IdentiteAgence;
  /** Attente maximale de l'envoi direct d'une vente avant de la mettre en file. Défaut 8 s. */
  delaiVenteMs?: number;
}

/** Traduit un refus du moteur en erreur que les écrans savent déjà montrer. */
function traduire(e: unknown): unknown {
  if (e instanceof SiegeHorsPart || e instanceof SiegeDejaVendu) {
    return new ErreurHttp(409, "Ce siège n'est plus disponible sans réseau", "SIEGE_PRIS");
  }
  if (e instanceof PartInconnue) {
    return new ErreurHttp(409, e.message, "PART_INCONNUE");
  }
  if (e instanceof AppareilBloque) {
    return new ErreurHttp(423, e.message, "APPAREIL_BLOQUE");
  }
  if (e instanceof DonneesInvalides) {
    return new ErreurHttp(422, e.message, "DONNEES_INVALIDES");
  }
  return e;
}

export const synchroDe = (etat: EtatSync): contrats.SynchroAgence => ({
  etat: etat.etat,
  derniereSyncA: etat.derniereSyncA,
  evenementsEnAttente: etat.evenementsEnAttente,
});

export function creerClientHorsLigne(base: ClientApi, deps: DepsHorsLigne): ClientApi {
  const { moteur, cache } = deps;
  const delaiVente = deps.delaiVenteMs ?? 8_000;

  // L'état instantané est rafraîchi en différé : pour décider d'attendre ou non le réseau, on relit l'état à jour.
  const enLigne = async (): Promise<boolean> => (await moteur.etat()).enLigne !== false;
  const etatReel = async (): Promise<EtatSync> => moteur.instantane() ?? (await moteur.etat());
  const maintenantIso = (): string => versIsoDouala(base.horloge.maintenant());

  /** Une lecture gardée : celle des mêmes paramètres, sinon la dernière de cette opération (joker). */
  function relire<R>(nom: string, params: unknown): { valeur: R; a: string } | null {
    return cache.lire<R>(nom, params) ?? cache.lire<R>(nom, "*");
  }
  function memoriser(nom: string, params: unknown, valeur: unknown): void {
    const a = maintenantIso();
    cache.ecrire(nom, params, valeur, a);
    cache.ecrire(nom, "*", valeur, a);
  }

  const identite = (): IdentiteAgence => {
    const accueil = relire<contrats.GuichetAccueil>(agence.OP_GUICHET_ACCUEIL.nom, undefined);
    return accueil
      ? { compagnie: accueil.valeur.agence.compagnie, gare: accueil.valeur.agence.gare }
      : deps.identite;
  };

  function departConnu(departId: string): DepartConnu | null {
    const contexte = relire<contrats.VenteContexte>(agence.OP_VENTE_CONTEXTE.nom, "*");
    const dansContexte = contexte?.valeur.departs.find((d) => d.departId === departId);
    if (dansContexte) {
      return { destination: dansContexte.destination, heureDepart: dansContexte.heureDepart };
    }
    const cadence = relire<contrats.CadenceEtat>(agence.OP_CADENCE_ETAT.nom, "*");
    if (cadence?.valeur.depart.departId === departId) {
      return {
        destination: cadence.valeur.depart.destination,
        heureDepart: cadence.valeur.depart.heureDepart,
      };
    }
    return null;
  }

  function placesRestantesApres(departId: string): number {
    const cadence = relire<contrats.CadenceEtat>(agence.OP_CADENCE_ETAT.nom, "*");
    if (cadence?.valeur.depart.departId === departId) {
      return Math.max(0, cadence.valeur.depart.placesRestantes - 1);
    }
    return 0;
  }

  function billetDe(vente: VenteEnFile): contrats.BilletImprimable {
    const numero = moteur.numeroDe({
      type: vente.type,
      at: vente.at,
      numeroPlage: vente.numeroPlage,
    });
    return billetLocal(vente, numero ?? "", identite(), departConnu(vente.departId));
  }

  /* ---------------------------------------------------------------- ventes */

  function reponseLocale(
    nom: string,
    evenement: contrats.EvenementAgence<string, unknown, boolean>,
  ) {
    const accuse = { evenementId: evenement.id, statut: "accepte" as const, recuA: evenement.at };
    const vente = venteDeEvenement(evenement as never);
    if (!vente) return { accuse };
    const billet = billetDe(vente);
    return nom === agence.ECRITURES.billetVenduCadence.operation.nom
      ? { accuse, billet, placesRestantes: placesRestantesApres(vente.departId) }
      : { accuse, billet };
  }

  async function mettreEnFile<R>(
    operation: Operation<never, R>,
    definition: contrats.DefinitionEvenement<string, never, boolean>,
    evenement: contrats.EvenementAgence<string, unknown, boolean>,
  ): Promise<R> {
    try {
      await moteur.mettreEnFile(definition as never, evenement as never);
    } catch (e) {
      throw traduire(e);
    }
    return operation.reponse.parse(reponseLocale(operation.nom, evenement));
  }

  async function ecrireVente<P, R>(
    operation: Operation<P, R>,
    definition: contrats.DefinitionEvenement<string, never, boolean>,
    params: P,
    options?: OptionsExecution,
  ): Promise<R> {
    const evenement = params as unknown as contrats.EvenementAgence<string, unknown, boolean>;
    const enFile = (): Promise<R> =>
      mettreEnFile(operation as unknown as Operation<never, R>, definition, evenement);
    if (!(await enLigne())) return enFile();

    // Un délai propre à la vente : le guichet n'attend pas 45 s (trois essais de 15 s) un réseau qui ne répond plus.
    const controleur = new AbortController();
    let expire = false;
    const minuterie = setTimeout(() => {
      expire = true;
      controleur.abort();
    }, delaiVente);
    const surAbandon = (): void => controleur.abort();
    options?.signal?.addEventListener("abort", surAbandon, { once: true });
    try {
      return await base.executer(operation, params, { signal: controleur.signal });
    } catch (e) {
      const panne = estPanneReseau(e) || (e instanceof ErreurAnnulee && expire);
      if (!panne) throw e;
      // Le moteur apprend la panne (indicateur HORS LIGNE) et réessaiera tout seul.
      void moteur.synchroniser().catch(() => undefined);
      return enFile();
    } finally {
      clearTimeout(minuterie);
      options?.signal?.removeEventListener("abort", surAbandon);
    }
  }

  /* ---------------------------------------------------------------- lectures */

  async function adapterContexte(
    ctx: contrats.VenteContexte,
    horsLigne: boolean,
  ): Promise<contrats.VenteContexte> {
    const ventes = await ventesEnAttente(moteur);
    const prisParDepart = new Map<string, Set<number>>();
    for (const v of ventes) {
      if (v.siege === null) continue;
      const deja = prisParDepart.get(v.departId) ?? new Set<number>();
      deja.add(v.siege);
      prisParDepart.set(v.departId, deja);
    }
    const dernierNumero = ventes.reduce((m, v) => Math.max(m, v.numeroPlage ?? 0), 0);
    if (ventes.length === 0 && !horsLigne) return ctx;

    const choisi = ctx.departChoisiId;
    const vendables = horsLigne
      ? new Set((await moteur.siegesVendablesHorsLigne(choisi)) ?? [])
      : null;
    const pris = prisParDepart.get(choisi) ?? new Set<number>();
    const libresNumeros = ctx.siege.plan.cases
      .filter(
        (c) => c.etat !== "pris" && !pris.has(c.numero) && (!vendables || vendables.has(c.numero)),
      )
      .map((c) => c.numero);
    const propose = libresNumeros.includes(ctx.siege.propose)
      ? ctx.siege.propose
      : (libresNumeros[0] ?? ctx.siege.propose);
    const cases = ctx.siege.plan.cases.map((c) => ({
      numero: c.numero,
      etat: !libresNumeros.includes(c.numero)
        ? ("pris" as const)
        : c.numero === propose
          ? ("attribue" as const)
          : ("libre" as const),
    }));

    const departs: contrats.VenteContexte["departs"] = [];
    for (const d of ctx.departs) {
      if (d.departId === choisi) {
        departs.push({ ...d, placesLibres: libresNumeros.length });
      } else if (horsLigne) {
        // Sans réseau, un autre départ ne se vend que si l'appareil a sa part de sièges.
        const part = await moteur.siegesVendablesHorsLigne(d.departId);
        if (part && part.length > 0) departs.push({ ...d, placesLibres: part.length });
      } else {
        const retire = prisParDepart.get(d.departId)?.size ?? 0;
        departs.push({ ...d, placesLibres: Math.max(0, d.placesLibres - retire) });
      }
    }

    const sequence = Math.max(ctx.prochainNumero.sequence, dernierNumero + 1);
    const numero =
      moteur.numeroDe({
        type: "billet.vendu",
        at: maintenantIso(),
        numeroPlage: sequence,
      }) ?? ctx.prochainNumero.numero;
    return {
      ...ctx,
      departs,
      prochainNumero: { sequence, numero },
      siege: {
        propose,
        libres: libresNumeros.length,
        plan: { ...ctx.siege.plan, cases },
      },
    };
  }

  async function adapterAccueil(a: contrats.GuichetAccueil): Promise<contrats.GuichetAccueil> {
    const ventes = await ventesEnAttente(moteur);
    return {
      ...a,
      synchro: synchroDe(await etatReel()),
      compteurs: {
        ...a.compteurs,
        billets: a.compteurs.billets + ventes.length,
        enCaisse: a.compteurs.enCaisse + ventes.reduce((s, v) => s + cashDeLaVente(v), 0),
      },
    };
  }

  async function adapterCadence(
    c: contrats.CadenceEtat,
    horsLigne: boolean,
  ): Promise<contrats.CadenceEtat> {
    const ventes = (await ventesEnAttente(moteur)).filter(
      (v) => v.departId === c.depart.departId && v.type === "billet.vendu_cadence",
    );
    const dernier = ventes.at(-1);
    const sieges = new Set(ventes.flatMap((v) => (v.siege === null ? [] : [v.siege])));
    let siege = c.prochain.siege;
    if (horsLigne) {
      const part = await moteur.siegesVendablesHorsLigne(c.depart.departId);
      if (part && part.length > 0) siege = part[0]!;
    } else {
      while (sieges.has(siege)) siege += 1;
    }
    return {
      ...c,
      depart: {
        ...c.depart,
        placesRestantes: Math.max(0, c.depart.placesRestantes - ventes.length),
      },
      dernierBillet: dernier
        ? {
            billetId: dernier.billetId,
            sequence: dernier.numeroPlage ?? 1,
            siege: dernier.siege ?? 1,
            nom: null,
            venduA: dernier.at,
          }
        : c.dernierBillet,
      prochain: { ...c.prochain, siege },
      vendusEnCadence: c.vendusEnCadence + ventes.length,
      synchro: synchroDe(await etatReel()),
    };
  }

  type Adaptateur = (valeur: never, horsLigne: boolean) => Promise<unknown>;
  const LECTURES = new Map<string, Adaptateur>([
    [agence.OP_VENTE_CONTEXTE.nom, adapterContexte as Adaptateur],
    [
      agence.OP_GUICHET_ACCUEIL.nom,
      ((v: contrats.GuichetAccueil) => adapterAccueil(v)) as Adaptateur,
    ],
    [agence.OP_CADENCE_ETAT.nom, adapterCadence as Adaptateur],
  ]);

  async function lire<P, R>(
    operation: Operation<P, R>,
    adapter: Adaptateur,
    params: P,
    options?: OptionsExecution,
  ): Promise<R> {
    const adapte = async (valeur: unknown, horsLigne: boolean): Promise<R> =>
      operation.reponse.parse(await adapter(valeur as never, horsLigne));
    // Hors ligne déclaré et lecture gardée : on n'attend pas un réseau qui ne répond pas.
    if (!(await enLigne())) {
      const gardee = relire<unknown>(operation.nom, params);
      if (gardee) return adapte(gardee.valeur, true);
    }
    try {
      const reponse = await base.executer(operation, params, options);
      memoriser(operation.nom, params, reponse);
      return await adapte(reponse, false);
    } catch (e) {
      if (!estPanneReseau(e)) throw e;
      void moteur.synchroniser().catch(() => undefined);
      const gardee = relire<unknown>(operation.nom, params);
      if (!gardee) throw e;
      return adapte(gardee.valeur, true);
    }
  }

  /** Le billet d'une vente de cadence faite ici et pas encore reçue par le serveur : il n'existe que sur l'appareil. */
  async function cadenceBilletLocal(
    params: contrats.ParamsCadenceBillet,
  ): Promise<contrats.CadenceBillet | null> {
    const vente = (await ventesEnAttente(moteur)).find(
      (v) => v.billetId === params.billetId && v.type === "billet.vendu_cadence",
    );
    if (!vente) return null;
    const part = await moteur.siegesVendablesHorsLigne(vente.departId);
    return {
      billet: billetDe(vente),
      vente: {
        dureeMs: 0,
        paiement: vente.paiement,
        placesRestantes: placesRestantesApres(vente.departId),
      },
      recapitulatif: {
        plageSansTrou: true,
        siegeBloque: vente.siege ?? 1,
        imprime: true,
        caisseCash: cashDeLaVente(vente),
        sms: vente.telephone ? "envoye" : "pas_de_numero",
        synchro: "au_retour_du_reseau",
      },
      suivant: { siege: part?.[0] ?? (vente.siege ?? 0) + 1, prix: vente.prix },
    };
  }

  return {
    mode: base.mode,
    horloge: base.horloge,
    souscrire: (canal, params, ecouteur, options) =>
      base.souscrire(canal, params, ecouteur, options),
    async executer<P, R>(
      operation: Operation<P, R>,
      params: P,
      options?: OptionsExecution,
    ): Promise<R> {
      const vente = VENTES.get(operation.nom);
      if (vente) return ecrireVente(operation, vente, params, options);
      if (operation.nom === agence.OP_CADENCE_BILLET.nom) {
        const locale = await cadenceBilletLocal(params as contrats.ParamsCadenceBillet);
        if (locale) return operation.reponse.parse(locale);
      }
      const adapter = LECTURES.get(operation.nom);
      if (adapter) return lire(operation, adapter, params, options);
      return base.executer(operation, params, options);
    },
  };
}
