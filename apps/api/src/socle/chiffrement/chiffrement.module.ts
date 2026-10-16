import { Global, Module } from "@nestjs/common";
import { ChiffrementService } from "./chiffrement.service";

@Global()
@Module({ providers: [ChiffrementService], exports: [ChiffrementService] })
export class ChiffrementModule {}
