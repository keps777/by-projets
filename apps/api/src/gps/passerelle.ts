import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { WebSocket, WebSocketServer } from "ws";
import type { Utilisateur } from "../socle/auth/decorateurs";
import type { Role } from "../socle/auth/roles";
import { TokensService } from "../socle/auth/tokens.service";
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { ControleBusService } from "./controle.service";
import { Refus } from "./erreurs";
import { SuiviLivraisonService } from "./livraison.service";
import { DiffusionGps, canalBus, canalControle, canalLivraison } from "./ports";
import { SuiviBusService } from "./suivi.service";
import { messagePositionBus } from "./vues";
import type { MessageBusInterne } from "./modeles";

export const OPTIONS_GPS = Symbol("OPTIONS_GPS");

export interface OptionsGps {
  /** Période des pings WebSocket, en ms ; 0 les désactive (tests). */
  pingMs: number;
}

export const OPTIONS_GPS_PAR_DEFAUT: OptionsGps = { pingMs: 30_000 };

const CHEMIN_BUS = /^\/voyageur\/billets\/([^/]{1,128})\/direct\/position$/;
const CHEMIN_LIVRAISON = /^\/colis\/([^/]{1,128})\/livraison\/direct$/;
const CHEMIN_CONTROLE = /^\/patron\/controle\/bus\/direct$/;
const ROLES_VOYAGEUR: readonly Role[] = ["voyageur"];
const ROLES_CONTROLE: readonly Role[] = ["patron", "superviseur"];

/** Jeton d'une demande d'ouverture : en-tête `Authorization`, ou `?access_token=` pour un navigateur. */
export function jetonDeLaDemande(requete: Pick<IncomingMessage, "headers" | "url">): string | null {
  const en = requete.headers["authorization"];
  const valeur = Array.isArray(en) ? en[0] : en;
  const entete = /^Bearer ([A-Za-z0-9._-]+)$/.exec(valeur ?? "");
  if (entete?.[1]) return entete[1];
  const url = new URL(requete.url ?? "/", "http://localhost");
  const requis = url.searchParams.get("access_token");
  return requis && /^[A-Za-z0-9._-]+$/.test(requis) ? requis : null;
}

function refuser(socket: Duplex, statut: 400 | 401 | 403 | 404 | 409, message: string): void {
  const corps = JSON.stringify({ code: "CANAL_REFUSE", message });
  socket.write(
    `HTTP/1.1 ${statut} ${message}\r\nContent-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(corps)}\r\nConnection: close\r\n\r\n${corps}`,
  );
  socket.destroy();
}

/**
 * Canaux temps réel (WebSocket) du suivi GPS, sur le serveur HTTP de l'application :
 *
 * - `/voyageur/billets/:id/direct/position` : la position du bus du billet, à chaque envoi du
 *   téléphone du chauffeur (toutes les 30 s), avec l'arrivée estimée et le retard ;
 * - `/colis/:id/livraison/direct` : le temps restant du livreur moto ;
 * - `/patron/controle/bus/direct` : les bus de la compagnie et les alertes d'arrêt anormal
 *   (messages `bus`, `a_traiter`, `alerte_resolue`).
 *
 * La connexion exige le jeton d'accès (`Authorization: Bearer`, ou `?access_token=` pour les
 * navigateurs) et le rôle de la route. Les adresses d'un autre module sont laissées à son
 * propre écouteur.
 */
@Injectable()
export class PasserelleGps implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("PasserelleGps");
  private readonly serveur = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  private http: Server | null = null;
  private minuterie: NodeJS.Timeout | null = null;
  private readonly vivants = new WeakSet<WebSocket>();
  private readonly ouverture = (requete: IncomingMessage, socket: Duplex, tete: Buffer): void => {
    void this.recevoir(requete, socket, tete);
  };

  constructor(
    private readonly adaptateur: HttpAdapterHost,
    private readonly tokens: TokensService,
    private readonly personnes: PersonnesRepository,
    private readonly diffusion: DiffusionGps,
    private readonly bus: SuiviBusService,
    private readonly livraisons: SuiviLivraisonService,
    private readonly controle: ControleBusService,
    @Inject(OPTIONS_GPS) private readonly options: OptionsGps,
  ) {}

  onApplicationBootstrap(): void {
    const http = this.adaptateur.httpAdapter?.getHttpServer() as Server | undefined;
    if (!http) return;
    this.http = http;
    http.on("upgrade", this.ouverture);
    if (this.options.pingMs > 0) {
      this.minuterie = setInterval(() => this.battement(), this.options.pingMs);
      this.minuterie.unref();
    }
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
    this.http?.off("upgrade", this.ouverture);
    for (const c of this.serveur.clients) c.terminate();
    this.serveur.close();
  }

  /** Ferme les connexions qui n'ont pas répondu au ping précédent. */
  private battement(): void {
    for (const c of this.serveur.clients) {
      if (!this.vivants.has(c)) {
        c.terminate();
        continue;
      }
      this.vivants.delete(c);
      c.ping();
    }
  }

  private async identifier(requete: IncomingMessage): Promise<Utilisateur | null> {
    const jeton = jetonDeLaDemande(requete);
    if (!jeton) return null;
    const contenu = await this.tokens.verifier(jeton);
    if (!contenu) return null;
    const personne = await this.personnes.trouverParId(contenu.sub);
    if (!personne || !personne.actif || !personne.roles.includes(contenu.role)) return null;
    return {
      id: personne.id,
      role: contenu.role,
      compagnieId: personne.compagnieId,
      gareId: personne.gareId,
    };
  }

  private async recevoir(requete: IncomingMessage, socket: Duplex, tete: Buffer): Promise<void> {
    let chemin: string;
    try {
      chemin = new URL(requete.url ?? "/", "http://localhost").pathname;
    } catch {
      return refuser(socket, 400, "Adresse invalide");
    }
    const bus = CHEMIN_BUS.exec(chemin);
    const livraison = CHEMIN_LIVRAISON.exec(chemin);
    const controle = CHEMIN_CONTROLE.exec(chemin);
    // Les autres adresses ne sont pas les nôtres : un autre module peut les prendre en charge.
    if (!bus && !livraison && !controle) return;

    socket.on("error", () => socket.destroy());
    try {
      const u = await this.identifier(requete);
      if (!u) return refuser(socket, 401, "Authentification requise");
      const roles = controle ? ROLES_CONTROLE : ROLES_VOYAGEUR;
      if (!roles.includes(u.role)) return refuser(socket, 403, "Accès refusé pour votre rôle");

      if (bus) {
        const billetId = decodeURIComponent(bus[1] as string);
        const { departId, initial } = await this.bus.ouvrirFlux(u, billetId);
        this.serveur.handleUpgrade(requete, socket, tete, (ws) =>
          this.suivreBus(ws, billetId, departId, initial),
        );
      } else if (livraison) {
        const colisId = decodeURIComponent(livraison[1] as string);
        const { initial } = await this.livraisons.ouvrirFlux(u, colisId);
        this.serveur.handleUpgrade(requete, socket, tete, (ws) =>
          this.suivreLivraison(ws, colisId, initial),
        );
      } else {
        const compagnieId = this.controle.compagnieDe(u);
        const carte = await this.controle.carte(compagnieId);
        this.serveur.handleUpgrade(requete, socket, tete, (ws) =>
          this.suivreControle(ws, compagnieId, carte),
        );
      }
    } catch (e) {
      if (e instanceof Refus) {
        const statut = e.getStatus();
        return refuser(
          socket,
          statut === 404 || statut === 409 || statut === 403 ? statut : 400,
          e.message,
        );
      }
      this.journal.error(`Ouverture refusée : ${e instanceof Error ? e.message : String(e)}`);
      socket.destroy();
    }
  }

  private envoyer(ws: WebSocket, message: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  private attacher(ws: WebSocket, desabonner: () => void): void {
    this.vivants.add(ws);
    ws.on("pong", () => this.vivants.add(ws));
    ws.on("close", desabonner);
    ws.on("error", () => ws.terminate());
    // Le client n'a rien à dire : ses messages sont ignorés.
    ws.on("message", () => undefined);
  }

  private suivreBus(
    ws: WebSocket,
    billetId: string,
    departId: string,
    initial: ReturnType<typeof messagePositionBus> | null,
  ): void {
    // On s'abonne avant d'envoyer le dernier message : une position arrivée entre-temps n'est pas perdue.
    const desabonner = this.diffusion.souscrire(canalBus(departId), (brut) =>
      this.envoyer(ws, messagePositionBus(billetId, brut as MessageBusInterne)),
    );
    this.attacher(ws, desabonner);
    if (initial) this.envoyer(ws, initial);
  }

  private suivreLivraison(ws: WebSocket, colisId: string, initial: unknown): void {
    const desabonner = this.diffusion.souscrire(canalLivraison(colisId), (m) =>
      this.envoyer(ws, m),
    );
    this.attacher(ws, desabonner);
    if (initial) this.envoyer(ws, initial);
  }

  private suivreControle(
    ws: WebSocket,
    compagnieId: string,
    carte: Awaited<ReturnType<ControleBusService["carte"]>>,
  ): void {
    const desabonner = this.diffusion.souscrire(canalControle(compagnieId), (m) =>
      this.envoyer(ws, m),
    );
    this.attacher(ws, desabonner);
    for (const bus of carte.bus) this.envoyer(ws, { type: "bus", bus });
    for (const element of carte.aTraiter) this.envoyer(ws, { type: "a_traiter", element });
  }
}
