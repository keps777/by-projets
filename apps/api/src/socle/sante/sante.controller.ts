import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../auth/decorateurs";
import { PrismaService } from "../db/prisma.service";

export class SanteReponse {
  @ApiProperty({ enum: ["ok", "degrade"] })
  statut!: "ok" | "degrade";

  @ApiProperty({ enum: ["ok", "indisponible"] })
  base!: "ok" | "indisponible";

  @ApiProperty({ description: "Secondes depuis le démarrage" })
  uptime!: number;
}

@ApiTags("Santé")
@Controller("health")
export class SanteController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: "L'API répond-elle, et la base aussi ?" })
  @ApiResponse({ status: 200, type: SanteReponse })
  @ApiResponse({ status: 503, type: SanteReponse, description: "La base ne répond pas" })
  async sante(
    @Res({ passthrough: true }) res: { status(code: number): unknown },
  ): Promise<SanteReponse> {
    const baseOk = await this.prisma.estJoignable();
    if (!baseOk) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      statut: baseOk ? "ok" : "degrade",
      base: baseOk ? "ok" : "indisponible",
      uptime: Math.round(process.uptime()),
    };
  }
}
