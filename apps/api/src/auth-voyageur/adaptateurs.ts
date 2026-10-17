import { Injectable } from "@nestjs/common";
import { TokensService } from "../socle/auth/tokens.service";
import { ComptesService } from "../socle/comptes/comptes.service";
import { PersonnesRepository, TelephoneDejaUtilise } from "../socle/comptes/personnes.repository";
import type { PersonneEnregistree } from "../socle/comptes/personnes.repository";
import { Horloge } from "../socle/horloge";
import { PasserelleSmsService } from "../sms/passerelle.service";
import { CanalIndisponible } from "./erreurs";
import {
  ComptesVoyageur,
  EmetteurSession,
  EnvoiCodeSms,
  type CompteVoyageur,
  type DemandeEnvoiCode,
  type SessionEmise,
} from "./ports";

/**
 * Adaptateurs de production qui s'appuient sur le socle (comptes, jetons) et sur la passerelle SMS
 * (AM-166). Ils sont fournis par défaut pour les comptes et la session ; l'envoi par SMS se branche
 * avec `AuthVoyageurModule.avec({ imports: [SmsModule], providers: [{ provide: EnvoiCodeSms,
 * useClass: EnvoiCodeSmsPasserelle }] })`.
 */

const versCompte = (p: PersonneEnregistree): CompteVoyageur => ({
  id: p.id,
  nom: p.nom,
  eligible: p.actif && p.roles.includes("voyageur"),
});

/** Le compte voyageur est une `Personne` du socle ayant le rôle « voyageur ». */
@Injectable()
export class ComptesVoyageurSocle extends ComptesVoyageur {
  constructor(
    private readonly comptes: ComptesService,
    private readonly personnes: PersonnesRepository,
  ) {
    super();
  }

  async trouver(telephone: string): Promise<CompteVoyageur | null> {
    const p = await this.comptes.trouverParTelephone(telephone);
    return p ? versCompte(p) : null;
  }

  async creer(telephone: string): Promise<{ compte: CompteVoyageur; cree: boolean }> {
    try {
      const p = await this.comptes.creer({ nom: "", telephone, roles: ["voyageur"] });
      return { compte: versCompte(p), cree: true };
    } catch (e) {
      if (!(e instanceof TelephoneDejaUtilise)) throw e;
      // Deux vérifications simultanées : l'autre a créé le compte, on le relit.
      const existant = await this.comptes.trouverParTelephone(telephone);
      if (!existant) throw e;
      return { compte: versCompte(existant), cree: false };
    }
  }
}

/** Session = jeton d'accès du socle (JWT HS256) portant le seul rôle « voyageur ». */
@Injectable()
export class EmetteurSessionJwt extends EmetteurSession {
  constructor(
    private readonly tokens: TokensService,
    private readonly horloge: Horloge,
  ) {
    super();
  }

  async emettre(compte: CompteVoyageur): Promise<SessionEmise> {
    const emis = await this.tokens.emettre({
      sub: compte.id,
      role: "voyageur",
      cid: null,
      gid: null,
    });
    return {
      jeton: emis.accessToken,
      expireA: new Date(this.horloge.maintenant().getTime() + emis.expiresIn * 1000),
    };
  }
}

/**
 * Le code part par la passerelle SMS (type `systeme` : file, reprise, secours, journal sans texte,
 * texte chiffré dans la file). Le texte est confié tel quel.
 *
 * ATTENTION : le gabarit `systeme` de `apps/api/src/sms/gabarits.ts` ramène les sauts de ligne à des
 * espaces (`Lecteur.texte`), donc la dernière ligne `@domaine #code` que WebOTP attend n'existe plus à
 * l'arrivée. Tant que ce gabarit n'est pas corrigé (ou qu'un type `code_connexion` qui conserve les
 * lignes n'est pas ajouté à la passerelle), l'auto-remplissage Chrome ne marche pas ; la saisie
 * manuelle et `autocomplete="one-time-code"` (iOS) marchent. Voir le README, « À faire hors périmètre ».
 */
@Injectable()
export class EnvoiCodeSmsPasserelle extends EnvoiCodeSms {
  readonly reel = true;

  constructor(private readonly passerelle: PasserelleSmsService) {
    super();
  }

  async envoyer(demande: DemandeEnvoiCode): Promise<void> {
    try {
      await this.passerelle.envoyer({
        type: "systeme",
        variables: { texte: demande.texte },
        destinataire: demande.telephone,
        cle: demande.cle,
        expireA: demande.expireA,
      });
    } catch (e) {
      throw new CanalIndisponible("sms", { cause: e });
    }
  }
}
