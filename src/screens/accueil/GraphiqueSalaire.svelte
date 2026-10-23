<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { PLAFOND_ENDETTEMENT } from '../../core/credit.ts';
  import { pourcent, type Repartition } from '../../core/calendrier-paie.ts';
  /** Salaire net → prélèvements → solde versé : trois barres à la même échelle, plafond de 33 % repéré. */
  let { rep }: { rep: Repartition } = $props();
  const COULEUR: Record<string, string> = { pass: '#7C93FF', credit: '#3050FF', coffre: '#3DD598', verse: 'var(--ligne-forte)' };
  const plafond = PLAFOND_ENDETTEMENT * 100;
  const resume = $derived(`Salaire net ${fcfa(rep.salaire)}, dont ${fcfa(rep.preleve)} prélevés (${pourcent(rep.part)} %) et ${fcfa(rep.verse)} versés sur votre solde.`);
</script>

<figure role="img" aria-label={resume}>
  <div class="rang">
    <span class="mono lib">SALAIRE NET</span>
    <div class="piste"><i style="width:100%; background:var(--primaire-fond); border: 1px solid var(--primaire)"></i></div>
    <b class="mono">{fcfa(rep.salaire)}</b>
  </div>
  <div class="fleche" aria-hidden="true">↓</div>
  <div class="rang">
    <span class="mono lib">PRÉLEVÉ</span>
    <div class="piste">
      {#each rep.segments.filter((s) => s.type !== 'verse') as s (s.type)}<i style:width="{s.pct}%" style:background={COULEUR[s.type]} title="{s.libelle} {fcfa(s.montant)}"></i>{/each}
      <em class="plafond" style:left="{plafond}%" title="Plafond 33 %"></em>
    </div>
    <b class="mono" class:dan={rep.depassePlafond}>{fcfa(rep.preleve)}</b>
  </div>
  <div class="fleche" aria-hidden="true">↓</div>
  <div class="rang">
    <span class="mono lib">VERSÉ</span>
    <div class="piste"><i style:width="{(rep.verse / (rep.salaire || 1)) * 100}%" style="background: var(--bon)"></i></div>
    <b class="mono">{fcfa(rep.verse)}</b>
  </div>
  <figcaption class="mono"><span class="p"><u style="background:{COULEUR.pass}"></u>Pass</span><span class="p"><u style="background:{COULEUR.credit}"></u>Crédit</span><span class="p"><u style="background:{COULEUR.coffre}"></u>Coffre</span><span class="p"><u class="pl"></u>Plafond 33 %</span></figcaption>
</figure>

<style>
  figure { display: flex; flex-direction: column; gap: 4px; }
  .rang { display: grid; grid-template-columns: 84px 1fr auto; align-items: center; gap: 10px; } .lib { font-size: 10px; letter-spacing: 0.08em; color: var(--muted); } b { font-size: 13px; font-weight: 500; min-width: 66px; text-align: right; } .dan { color: var(--danger); }
  .piste { position: relative; height: 16px; border-radius: 8px; background: var(--carte2); display: flex; gap: 2px; overflow: visible; } .piste i { display: block; height: 100%; border-radius: 6px; min-width: 3px; transition: width 0.5s; }
  .plafond { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--texte); opacity: 0.6; }
  .fleche { padding-left: 94px; color: var(--faint); font-size: 12px; line-height: 1; }
  figcaption { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font-size: 10.5px; color: var(--muted); } .p { display: inline-flex; align-items: center; gap: 6px; } u { width: 9px; height: 9px; border-radius: 3px; display: inline-block; } .pl { width: 2px; height: 12px; background: var(--texte); border-radius: 0; opacity: 0.6; }
</style>
