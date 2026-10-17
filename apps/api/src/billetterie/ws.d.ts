/**
 * Types minimaux de la bibliothèque `ws` (le paquet `@types/ws` n'est pas installé : aucun accès au
 * réseau). Seul ce que la passerelle temps réel utilise est déclaré.
 */
declare module "ws" {
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    send(donnees: string): void;
    close(code?: number, raison?: string): void;
    terminate(): void;
    ping(): void;
    on(evenement: "close", ecouteur: () => void): this;
    on(evenement: "error", ecouteur: (erreur: Error) => void): this;
    on(evenement: "message", ecouteur: (donnees: Buffer) => void): this;
    on(evenement: "pong", ecouteur: () => void): this;
  }

  export class WebSocketServer {
    constructor(options: { noServer: true; maxPayload?: number });
    readonly clients: Set<WebSocket>;
    handleUpgrade(
      requete: IncomingMessage,
      socket: Duplex,
      tete: Buffer,
      rappel: (ws: WebSocket) => void,
    ): void;
    close(rappel?: () => void): void;
  }
}
