// Numéro de quai d'embarquement : un seul calcul, partagé par la voyageuse (/direct), le quai, le guichet, le superviseur et le patron.
/** Quai d'embarquement (1 à 6), stable pour un départ donné. */
export function quaiDe(departId: string): number { let h = 0; for (const c of departId) h = (h * 31 + c.charCodeAt(0)) % 9973; return (h % 6) + 1; }
