<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt as fmtBrut, fmtSigne as fmtSigneBrut, flecheEcart } from '../../core/argent.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import type { Compte } from '../../domain/types.ts';
  import Picto from './Picto.svelte';
  import { dropEnDirect } from './accueil.ts';
  import { heureDe, horlogeDrop, jourCourt, jourSemaine, nb } from './format.ts';
  import { va } from './lien.ts';
  import { agregatPortefeuille, droitsActifs, pointsLigne, prochaineEcheance, serieValeur } from './portefeuille.ts';
  import { tempsReel } from './temps.svelte.ts';

  /** Colonne de droite du marché (PC, face nuit) : « Drop membres en direct » avec son compte à rebours, puis « Votre portefeuille ». Sans compte : invitation à créer un compte. */
  let { compte }: { compte?: Compte } = $props();
  const temps = tempsReel(1000), now = $derived(temps.maintenant);
  const fmt = (n: number) => nb(fmtBrut(n)), fmtSigne = (n: number) => nb(fmtSigneBrut(n));
  const drop = $derived(dropEnDirect(app.monde, now)), dropVol = $derived(drop ? volDe(drop.volId) : undefined);
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const agregat = $derived(compte ? agregatPortefeuille(app.monde, compte.id, now) : undefined);
  const ligne = $derived(compte ? pointsLigne(serieValeur(app.monde, compte.id, now)) : null);
  const echeance = $derived(compte ? prochaineEcheance(app.monde, compte.id, now) : undefined);
  const aNommer = $derived(compte ? droitsActifs(app.monde, compte.id, now).filter((x) => x.droit.statut === 'detenu').length : 0);
</script>

<div class="colonne">
  {#if drop && dropVol}
    <section class="drop" aria-labelledby="drop-pc-t">
      <div class="haut"><h2 id="drop-pc-t"><span class="pouls" aria-hidden="true"></span>Drop membres en direct</h2><span class="decompte" role="timer"><Icone nom="horloge" taille={16} trait={2} /><span class="sr">Se termine dans </span>{horlogeDrop(drop.fin - now)}</span></div>
      <div class="col g4"><span class="route">{dropVol.de} → {dropVol.vers}</span><span class="detail">{ville(dropVol.vers)} · {jourSemaine(Date.parse(`${dropVol.jour}T${dropVol.heureDepart}`), { avecAnnee: true })} · {compagnieDe(dropVol).nom}</span></div>
      <div class="bas"><div class="col g2"><span class="prix">{fmt(drop.prixMembre)}</span><span class="equiv">Prix équivalent ≈ <s>{fmt(drop.prixEquivalent)}</s></span></div><span class="places">{drop.restantes} place{drop.restantes > 1 ? 's' : ''}</span></div>
      <a class="voir" href="/drops" onclick={(e) => va(e, '/drops')}>Voir le Drop<Picto nom="fleche" taille={18} /></a>
      <p class="aide">Réservé aux membres du Pass NexG (nom provisoire), 9,99{' '}$/mois, indicatif. Quantités limitées, sans garantie d’obtenir une place. <a href="/pass" onclick={(e) => va(e, '/pass')}>Devenir membre</a></p>
    </section>
  {:else}
    <section class="sans-drop" aria-labelledby="drop-pc-t"><h2 id="drop-pc-t">Aucun drop en direct</h2><p>Vous serez alerté à la prochaine ouverture.</p><a class="lien" href="/drops" onclick={(e) => va(e, '/drops')}>Voir les drops</a></section>
  {/if}

  {#if compte && agregat}
    <section class="pf" aria-labelledby="pf-pc-t">
      <a class="pf-ent" href="/portefeuille" onclick={(e) => va(e, '/portefeuille')}><h2 id="pf-pc-t">Votre portefeuille · {agregat.nb === 0 ? 'aucun droit' : `${agregat.nb} droit${agregat.nb > 1 ? 's' : ''}`}</h2><Picto nom="chevron" taille={20} trait={1.75} /></a>
      {#if agregat.nb}
        <div class="valeur">
          <div class="col g2"><span class="lib">Prix équivalent aujourd’hui</span><span class="gros">{fmt(agregat.equivalent)}</span>
            <span class="paye">Payé {fmt(agregat.paye)}<span class="ecart {agregat.ecart.sens}"><Picto nom={agregat.ecart.sens === 'baisse' ? 'baisse' : 'hausse'} taille={14} trait={2.25} /><span class="sr">{agregat.ecart.sens === 'baisse' ? 'En baisse de' : agregat.ecart.sens === 'hausse' ? 'En hausse de' : 'Stable :'} </span>{agregat.ecart.sens === 'stable' ? `${flecheEcart(agregat.ecart)} ` : ''}{fmtSigne(agregat.ecart.abs)}</span></span></div>
          {#if ligne}<svg width="112" height="48" viewBox="0 0 112 48" aria-hidden="true" style="flex:none"><polyline points={ligne.points} fill="none" stroke="var(--up)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><circle cx={ligne.dernier.x} cy={ligne.dernier.y} r="3.5" fill="var(--up)" /></svg>{/if}
        </div>
      {:else}<p class="aide">Achetez un billet neuf ou en revente : votre premier droit de voyage apparaîtra ici, avec son prix équivalent du jour.</p>{/if}
      {#if echeance}
        <a class="rang" href="/nommer/{echeance.droitId}" onclick={(e) => va(e, `/nommer/${echeance.droitId}`)}><Icone nom="horloge" taille={18} trait={2} /><span class="grow">{aNommer} à nommer&nbsp;: {echeance.vol.de} → {echeance.vol.vers} avant le {jourCourt(echeance.echeanceMs)} {heureDe(echeance.echeanceMs)}</span><Picto nom="chevron" /></a>
      {/if}
      <p class="aide">Indicatif : prix d’un billet neuf équivalent aujourd’hui. Ce n’est ni un prix de revente garanti, ni un gain.</p>
    </section>
  {:else}
    <section class="pf"><h2>Votre portefeuille</h2><p class="aide">Créez un compte pour acheter, détenir et revendre vos billets : vos droits de voyage apparaîtront ici.</p><a class="btn sec" href="/inscription" onclick={(e) => va(e, '/inscription')}>Créer un compte</a></section>
  {/if}
</div>

<style>
  .colonne { display: flex; flex-direction: column; gap: 20px; min-width: 0; } a { text-decoration: none; }
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; } .g4 { gap: 4px; } .grow { flex: 1; min-width: 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .drop { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: #ffd23f; color: #0d0e11; }
  .haut { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .drop h2 { margin: 0; display: inline-flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; }
  .pouls { width: 8px; height: 8px; border-radius: 999px; background: #0d0e11; animation: nx-pulse 1.4s ease-in-out infinite; } .decompte { display: inline-flex; align-items: center; gap: 6px; font: 600 15px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .route { font: 700 48px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .detail { font: 500 14px/20px 'Barlow', sans-serif; }
  .bas { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding-top: 14px; border-top: 1px solid rgba(13, 14, 17, 0.22); }
  .prix { font: 600 34px/36px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .equiv { font: 500 13px/18px 'Barlow', sans-serif; }
  .places { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 999px; background: #0d0e11; color: #ffd23f; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .voir { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border-radius: 14px; background: #0d0e11; color: #ffd23f; font: 700 15px/1 'Barlow', sans-serif; }
  .drop .aide { margin: 0; font: 500 13px/18px 'Barlow', sans-serif; color: #0d0e11; } .drop .aide a { color: #0d0e11; font-weight: 700; text-decoration: underline; }
  .sans-drop, .pf { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .sans-drop h2, .pf h2 { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .sans-drop p { margin: 0; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .lien { display: inline-flex; align-items: center; min-height: 44px; color: var(--accent); font-weight: 700; }
  .pf-ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; color: var(--ink2); }
  .valeur { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; } .lib { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .gros { font: 600 30px/34px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .paye { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .ecart { display: inline-flex; align-items: center; gap: 3px; font: 600 13px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .ecart.hausse { color: var(--up); } .ecart.baisse { color: var(--down); } .ecart.stable { color: var(--ink2); }
  .rang { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font: 600 14px/18px 'Barlow', sans-serif; }
  .pf .aide { margin: 0; font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); }
  @media (prefers-reduced-motion: reduce) { .pouls { animation: none; } }
</style>
