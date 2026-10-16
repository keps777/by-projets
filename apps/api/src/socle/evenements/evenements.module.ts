import { Global, Module } from "@nestjs/common";
import { EvenementsPrisma, EvenementsRepository, EvenementsService } from "./evenements.service";

@Global()
@Module({
  providers: [EvenementsService, { provide: EvenementsRepository, useClass: EvenementsPrisma }],
  exports: [EvenementsService],
})
export class EvenementsModule {}
