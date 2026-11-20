// Horaire type de la journée (points de prière) : liste pure des blocs récurrents, posés dans Prévu (spec §7, nov. 2026).
// Jours : 0 = lundi … 6 = dimanche.
export interface BlocType { titre: string; debut: number; fin: number; jours: number[] }

const h = (heures: number, minutes = 0) => heures * 60 + minutes;
const TOUS = [0, 1, 2, 3, 4, 5, 6];
const SANS = (...exclus: number[]) => TOUS.filter((j) => !exclus.includes(j));
const [LUN, MAR, MER, JEU, VEN, SAM, DIM] = TOUS;

export const HORAIRE_TYPE: BlocType[] = [
  { titre: 'Prière · communion avec Dieu', debut: h(0), fin: h(2), jours: SANS(VEN) },
  { titre: 'Lecture de la Bible', debut: h(2), fin: h(3), jours: SANS(VEN) },
  { titre: 'Méditation', debut: h(3), fin: h(4), jours: SANS(VEN) },
  { titre: 'Repos', debut: h(4), fin: h(8, 30), jours: SANS(VEN) },
  { titre: 'Nuit de prière · éveillé', debut: h(0), fin: h(6), jours: [VEN] },
  { titre: 'Communion fraternelle puis repos', debut: h(6), fin: h(12), jours: [VEN] },
  { titre: 'Préparer la journée', debut: h(8, 30), fin: h(9), jours: SANS(VEN) },
  { titre: 'Travail · Hydro-Québec et prière', debut: h(9), fin: h(12), jours: SANS(VEN) },
  { titre: 'Dîner, collègues et relances de suivi', debut: h(12), fin: h(13), jours: TOUS },
  { titre: 'Travail · Hydro-Québec, NexG-TT, contacts, WhatsApp', debut: h(13), fin: h(17), jours: TOUS },
  { titre: 'Prêcher l’Évangile en 1 à 1', debut: h(17), fin: h(18), jours: TOUS },
  { titre: 'Repas, repos, fréquentation et mariage', debut: h(18), fin: h(20), jours: TOUS },
  { titre: 'Projets personnels', debut: h(20), fin: h(21), jours: TOUS },
  { titre: 'Temps libre bien investi', debut: h(21), fin: h(23), jours: [MAR, JEU, VEN, SAM] },
  { titre: 'Temps libre', debut: h(22), fin: h(23), jours: [DIM] },
  { titre: 'Lecture · littérature chrétienne', debut: h(23), fin: h(24), jours: SANS(VEN, MER) },
  { titre: 'FDL · progrès spirituel', debut: h(21), fin: h(24), jours: [MER] },
  { titre: 'Logement propre', debut: h(21), fin: h(22), jours: [LUN] },
  { titre: 'Cuisiner pour la semaine', debut: h(21), fin: h(23), jours: [LUN] },
  { titre: 'Bilan de mes finances', debut: h(21), fin: h(22), jours: [DIM] }
];
