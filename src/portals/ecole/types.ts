export type Panneau = 'dash' | 'notes' | 'frais' | 'messages' | 'eleves';
export type VaVers = (p: Panneau, ctx?: { classe?: string; cible?: { tous?: boolean; classe?: string; eleve?: string; libelle: string } }) => void;
