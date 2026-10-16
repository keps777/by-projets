import { Injectable } from "@nestjs/common";

/** Source de l'heure, remplaçable dans les tests (expiration des codes, blocage du PIN). */
export abstract class Horloge {
  abstract maintenant(): Date;
}

@Injectable()
export class HorlogeSysteme extends Horloge {
  maintenant(): Date {
    return new Date();
  }
}
