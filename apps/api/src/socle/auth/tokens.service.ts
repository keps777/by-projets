import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CONFIG, type AppConfig } from "../config/config";
import { estRole, type Role } from "./roles";

export interface ContenuJeton {
  /** Identifiant de la personne. */
  sub: string;
  /** Le SEUL rôle actif de cette session : les autres rôles du compte ne comptent pas. */
  role: Role;
  cid: string | null;
  gid: string | null;
}

export interface JetonEmis {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  role: Role;
}

/** Émission et vérification des jetons d'accès (JWT signé HS256, à durée courte). */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async emettre(contenu: ContenuJeton): Promise<JetonEmis> {
    const accessToken = await this.jwt.signAsync(contenu, {
      algorithm: "HS256",
      expiresIn: this.config.jwt.ttlSeconds,
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
    });
    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: this.config.jwt.ttlSeconds,
      role: contenu.role,
    };
  }

  /** Renvoie le contenu du jeton, ou `null` s'il est invalide, expiré ou mal formé. */
  async verifier(jeton: string): Promise<ContenuJeton | null> {
    try {
      const p = await this.jwt.verifyAsync<Record<string, unknown>>(jeton, {
        algorithms: ["HS256"],
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
      });
      if (typeof p.sub !== "string" || !estRole(p.role)) return null;
      return {
        sub: p.sub,
        role: p.role,
        cid: typeof p.cid === "string" ? p.cid : null,
        gid: typeof p.gid === "string" ? p.gid : null,
      };
    } catch {
      return null;
    }
  }
}
