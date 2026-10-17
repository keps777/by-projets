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
import { PersonnesRepository } from "../socle/comptes/personnes.repository";
import { TokensService } from "../socle/auth/tokens.service";
import type { Utilisateur } from "../socle/auth/decorateurs";
import type { Role } from "../socle/auth/roles";
import { canalQuai } from "./agence.service";
import { DepartsService } from "./departs.service";
import { Refus } from "./erreurs";
import { DiffusionTempsReel, Catalogue } from "./ports";
import { canalSieges, type MessageSiegeInterne } from "./sieges.service";

export const OPTIONS_BILLETTERIE = Symbol("OPTIONS_BILLETTERIE");

export interface OptionsBilletterie {
  /** Période du balayage (blocages et commandes échus), en ms ; 0 le désactive (tests). */
  balayageMs: number;
  /** Période des pings WebSocket, en ms ; 0 les désactive (tests). */
  pingMs: number;
}

export const OPTIONS_PAR_DEFAUT: OptionsBilletterie = { balayageMs: 30_000, pingMs: 30_000 };

const CHEMIN_SIEGES = /^\/voyageur\/departs\/([^/]{1,128})\/sieges\/direct$/;
const CHEMIN_QUAI = /^\/agence\/quai\/([^/]{1,128})\/direct$/;
const ROLES_SIEGES: readonly Role[] = ["voyageur"];
const ROLES_QUAI: readonly Role[] = ["guichetier", "superviseur", "patron"];

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

function refuser(socket: Duplex, statut: 400 | 401 | 403 | 404, message: string): void {
  const corps = JSON.stringify({ code: "CANAL_REFUSE", message });
  socket.write(
    `HTTP/1.1 ${statut} ${message}\r\nContent-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(corps)}\r\nConnection: close\r\n\r\n${corps}`,
  );
  socket.destroy();
}

/**
 * Canaux temps réel (WebSocket) de la billetterie, sur le serveur HTTP de l'application :
 *
 * - `/voyageur/departs/:id/sieges/direct` : le plan d'un départ puis chaque changement de siège
 *   (libre, pris, bloqué, « à moi » pour celui qui l'a bloqué) avec le numéro de version du plan ;
 * - `/agence/quai/:id/direct` : chaque scan du quai et le compte des embarqués.
 *
 * La connexion exige le jeton d'accès (`Authorization: Bearer`, ou `?access_token=` pour les
 * navigateurs qui ne peuvent pas poser d'en-tête) et le rôle de la route. Les messages passent par
 * `DiffusionTempsReel` : avec Redis ou NOTIFY, toutes les instances de l'API voient les changements.
 */
@Injectable()
export class PasserelleTempsReel implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger("PasserelleTempsReel");
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
    private readonly diffusion: DiffusionTempsReel,
    private readonly departs: DepartsService,
    private readonly catalogue: Catalogue,
    @Inject(OPTIONS_BILLETTERIE) private readonly options: OptionsBilletterie,
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
    const sieges = CHEMIN_SIEGES.exec(chemin);
    const quai = CHEMIN_QUAI.exec(chemin);
    // Les autres adresses ne sont pas les nôtres : un autre module peut les prendre en charge.
    if (!sieges && !quai) return;

    socket.on("error", () => socket.destroy());
    try {
      const u = await this.identifier(requete);
      if (!u) return refuser(socket, 401, "Authentification requise");
      const roles = sieges ? ROLES_SIEGES : ROLES_QUAI;
      if (!roles.includes(u.role)) return refuser(socket, 403, "Accès refusé pour votre rôle");

      if (sieges) {
        const departId = decodeURIComponent(sieges[1] as string);
        const plan = await this.departs.plan(departId, u.id);
        this.serveur.handleUpgrade(requete, socket, tete, (ws) => this.suivreSieges(ws, u, plan));
      } else if (quai) {
        const departId = decodeURIComponent(quai[1] as string);
        const dc = await this.catalogue.depart(departId);
        if (!dc || dc.compagnie.id !== u.compagnieId)
          return refuser(socket, 404, "Départ introuvable");
        this.serveur.handleUpgrade(requete, socket, tete, (ws) => this.suivreQuai(ws, departId));
      }
    } catch (e) {
      if (e instanceof Refus) return refuser(socket, e.getStatus() === 404 ? 404 : 400, e.message);
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

  private suivreSieges(
    ws: WebSocket,
    u: Utilisateur,
    plan: Awaited<ReturnType<DepartsService["plan"]>>,
  ): void {
    // On s'abonne avant d'envoyer le plan : un changement survenu entre-temps n'est pas perdu
    // (`versionPlan` permet au client d'ignorer ce qu'il a déjà).
    const desabonner = this.diffusion.souscrire(canalSieges(plan.departId), (brut) => {
      const m = brut as MessageSiegeInterne;
      this.envoyer(ws, {
        type: "siege",
        departId: m.departId,
        siege: m.siege,
        etat: m.etat === "bloque" && m.par === u.id ? "a_moi" : m.etat,
        ...(m.etat === "bloque" && m.jusqua ? { jusqua: m.jusqua } : {}),
        versionPlan: m.versionPlan,
      });
    });
    this.attacher(ws, desabonner);
    this.envoyer(ws, { type: "plan", plan });
  }

  private suivreQuai(ws: WebSocket, departId: string): void {
    const desabonner = this.diffusion.souscrire(canalQuai(departId), (message) =>
      this.envoyer(ws, message),
    );
    this.attacher(ws, desabonner);
  }
}
