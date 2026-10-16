import { Controller, Get, Post, SetMetadata } from "@nestjs/common";
import { Authentifie, CLE_VENTE, Roles, Vente } from "../auth/decorateurs";

/**
 * Routes factices, montées dans les tests seulement, pour prouver le comportement des gardes
 * sur des cas que les vraies routes n'ont pas encore (vente de billet, route oubliée, erreur de
 * configuration qui donnerait la vente à AfriMove).
 */
@Controller("sondes")
export class SondesController {
  @Vente()
  @Post("vente")
  vente() {
    return { ok: true };
  }

  @Vente("guichetier")
  @Post("vente-guichet")
  venteGuichet() {
    return { ok: true };
  }

  /** Mauvaise configuration volontaire : AfriMove ajouté aux rôles d'une route de vente. */
  @SetMetadata(CLE_VENTE, true)
  @Roles("afrimove", "guichetier")
  @Post("vente-piege")
  ventePiege() {
    return { ok: true };
  }

  @Roles("patron")
  @Get("patron")
  patron() {
    return { ok: true };
  }

  @Roles("afrimove")
  @Get("afrimove")
  afrimove() {
    return { ok: true };
  }

  @Authentifie()
  @Get("tous")
  tous() {
    return { ok: true };
  }

  /** Aucune règle déclarée : doit être refusée à tout le monde. */
  @Get("oubliee")
  oubliee() {
    return { ok: true };
  }
}
