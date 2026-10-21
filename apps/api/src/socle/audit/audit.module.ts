import { Global, Module } from "@nestjs/common";
import { AuditAfrimoveController, AuditPatronController } from "./audit.controller";
import { AuditPrisma, AuditRepository } from "./audit.repository";
import { AuditService } from "./audit.service";

@Global()
@Module({
  controllers: [AuditPatronController, AuditAfrimoveController],
  providers: [AuditService, { provide: AuditRepository, useClass: AuditPrisma }],
  exports: [AuditService],
})
export class AuditModule {}
