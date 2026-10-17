import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";
import { ROLES, ROLES_DIRECTION, ROLES_PIN, type Role } from "./roles";

const TELEPHONE = /^[+\d][\d\s.()-]{7,24}$/;

export class CodeSmsDto {
  @ApiProperty({ format: "uuid", description: "Identifiant reçu à la demande du code" })
  @IsUUID()
  defiId!: string;

  @ApiProperty({ example: "482915", description: "Code à 6 chiffres reçu par SMS" })
  @IsString()
  @Matches(/^\d{6}$/, { message: "Le code comporte 6 chiffres" })
  code!: string;
}

export class ConnexionPinDto {
  @ApiProperty({ example: "+237655000002" })
  @IsString()
  @Matches(TELEPHONE, { message: "Numéro de téléphone invalide" })
  telephone!: string;

  @ApiProperty({ example: "482915", description: "PIN à 6 chiffres" })
  @IsString()
  @Matches(/^\d{6}$/, { message: "Le PIN comporte 6 chiffres" })
  pin!: string;

  @ApiProperty({ enum: ROLES_PIN, example: "guichetier" })
  @IsIn(ROLES_PIN)
  role!: Role;
}

export class ConnexionDirectionDto {
  @ApiProperty({ example: "+237655000003" })
  @IsString()
  @Matches(TELEPHONE, { message: "Numéro de téléphone invalide" })
  telephone!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  motDePasse!: string;

  @ApiProperty({ enum: ROLES_DIRECTION, example: "patron" })
  @IsIn(ROLES_DIRECTION)
  role!: Role;
}

export class DefiReponse {
  @ApiProperty({ format: "uuid" })
  defiId!: string;

  @ApiProperty({ description: "Durée de validité du code, en secondes", example: 300 })
  expireDans!: number;
}

export class JetonReponse {
  @ApiProperty({ description: "Jeton à envoyer dans l'en-tête Authorization: Bearer …" })
  accessToken!: string;

  @ApiProperty({ example: "Bearer" })
  tokenType!: "Bearer";

  @ApiProperty({ description: "Durée de validité, en secondes", example: 3600 })
  expiresIn!: number;

  @ApiProperty({ enum: ROLES, description: "Rôle actif de cette session" })
  role!: Role;
}

export class MoiReponse {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ROLES })
  role!: Role;

  @ApiProperty({ format: "uuid", nullable: true })
  compagnieId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  gareId!: string | null;

  @ApiProperty({ description: "Ce rôle peut-il vendre un billet ?" })
  peutVendre!: boolean;

  @ApiProperty({ description: "Ce rôle a-t-il accès à l'espace patron ?" })
  accesPatron!: boolean;
}
