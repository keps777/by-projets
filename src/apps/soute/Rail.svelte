<script lang="ts">
  import { positionRail } from './calcul.ts';
  /** Rail de prix de 50 $ au plafond : offres (carrés orange, empilés à égalité), demandes (ronds bleus), moi (barre jaune), plafond (pointillé). */
  let { plafond, offres, demandes, moi, aria }: { plafond: number; offres: number[]; demandes: number[]; moi: number; aria: string } = $props();
  const pos = (p: number) => positionRail(p, plafond);
  const pile = $derived.by(() => { const vu: Record<number, number> = {}; return offres.map((p) => { const n = vu[p] ?? 0; vu[p] = n + 1; return { p, haut: 14 - n * 12 }; }); });
  const pilesDemandes = $derived.by(() => { const vu: Record<number, number> = {}; return demandes.map((p) => { const n = vu[p] ?? 0; vu[p] = n + 1; return { p, haut: 38 + n * 12 }; }); });
  const milieu = $derived(Math.round((Math.min(50, plafond) + plafond) / 2));
</script>
<div class="cadre">
  <div class="rail" role="img" aria-label={aria}>
    <span class="axe"></span><span class="plafond"></span>
    {#each pile as a, i (i)}<span class="offre" style:left="calc({pos(a.p)}% - 5px)" style:top="{a.haut}px"></span>{/each}
    {#each pilesDemandes as d, i (i)}<span class="demande" style:left="calc({pos(d.p)}% - 5px)" style:top="{d.haut}px"></span>{/each}
    <span class="moi" style:left="calc({pos(moi)}% - 1px)"></span><span class="bouton" style:left="calc({pos(moi)}% - 9px)"></span>
  </div>
  <div class="graduation mono" aria-hidden="true"><span>{Math.min(50, plafond)}&nbsp;$</span><span>{milieu}&nbsp;$</span><span>{plafond}&nbsp;$</span></div>
  <div class="legende" aria-hidden="true">
    <span><i class="l-offre"></i>Bagages proposés</span><span><i class="l-demande"></i>Demandes</span><span><i class="l-moi"></i>Vous</span><span><i class="l-plafond"></i>Plafond</span>
  </div>
</div>
<style>
  .cadre { border-radius: 14px; background: #060708; padding: 12px 14px 10px; }
  .rail { position: relative; height: 60px; } .rail span { position: absolute; display: block; }
  .axe { left: 0; right: 0; top: 29px; height: 2px; background: var(--line); }
  .plafond { right: 0; top: 0; height: 60px; border-left: 2px dashed var(--ink3); }
  .offre { width: 10px; height: 10px; border-radius: 2px; background: var(--down); } .demande { width: 10px; height: 10px; border-radius: 999px; background: var(--up); }
  .moi { top: 0; width: 2px; height: 60px; background: var(--signal); } .bouton { top: 21px; width: 18px; height: 18px; border-radius: 999px; background: var(--signal); border: 3px solid #060708; }
  .graduation { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--ink3); }
  .legende { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); }
  .legende span { display: inline-flex; align-items: center; gap: 6px; } .legende i { display: inline-block; }
  .l-offre { width: 8px; height: 8px; border-radius: 2px; background: var(--down); } .l-demande { width: 8px; height: 8px; border-radius: 999px; background: var(--up); }
  .l-moi { width: 2px; height: 12px; background: var(--signal); } .l-plafond { height: 12px; border-left: 2px dashed var(--ink3); }
</style>
