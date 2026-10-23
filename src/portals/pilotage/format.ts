import { fcfa } from '../../core/money.ts';

const sans = (s: string) => s.replace(/[  ]/g, ' ');
export const decimal = (n: number, d = 1) => sans(n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
/** « 2,84 Md », « 642 M », « 86 500 » */
export function grand(n: number): string {
  const a = Math.abs(n);
  return a >= 1e9 ? `${decimal(n / 1e9, 2)} Md` : a >= 1e6 ? `${sans((n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }))} M` : fcfa(n);
}
export const pourcent = (n: number) => `${decimal(n)} %`;
export const maj = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const entier = (n: number) => fcfa(n);
