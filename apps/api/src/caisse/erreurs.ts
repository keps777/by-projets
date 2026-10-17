import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";

/**
 * Les erreurs de l'agence ont toutes le corps `{ code, message, details? }` que lit le client d'API
 * (`ErreurHttp.code`, `ErreurHttp.details`). Le code est stable ; le message est en français.
 */

type Details = unknown;

const corps = (code: string, message: string, details?: Details) => ({
  code,
  message,
  ...(details !== undefined ? { details } : {}),
});

export const introuvable = (code: string, message: string, details?: Details) =>
  new NotFoundException(corps(code, message, details));

export const interdit = (code: string, message: string, details?: Details) =>
  new ForbiddenException(corps(code, message, details));

export const conflit = (code: string, message: string, details?: Details) =>
  new ConflictException(corps(code, message, details));

export const invalide = (code: string, message: string, details?: Details) =>
  new UnprocessableEntityException(corps(code, message, details));

export const requeteInvalide = (code: string, message: string, details?: Details) =>
  new BadRequestException(corps(code, message, details));

export const nonAuthentifie = (code: string, message: string, details?: Details) =>
  new UnauthorizedException(corps(code, message, details));

/** 423 : ressource verrouillée (PIN bloqué). */
export const verrouille = (code: string, message: string, details?: Details) =>
  new HttpException(corps(code, message, details), HttpStatus.LOCKED);

/** 502 : un service externe (SMS) a échoué. */
export const serviceIndisponible = (code: string, message: string, details?: Details) =>
  new HttpException(corps(code, message, details), HttpStatus.BAD_GATEWAY);
