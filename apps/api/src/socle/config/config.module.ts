import { Global, Module } from "@nestjs/common";
import { CONFIG, chargerConfig } from "./config";

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => chargerConfig(process.env) }],
  exports: [CONFIG],
})
export class ConfigModule {}
