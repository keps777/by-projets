<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { premierPrelevement } from '../../core/auto.ts';
  import { jourCourt, jourDe, jourLong } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { auto, monDossier, vehiculeDe } from './etat.ts';
  import { offreValide, estSigne } from './actions.ts';

  auto();
  const d = $derived(monDossier());
  const veh = $derived(vehiculeDe(d?.vehiculeId));
  $effect(() => { if (!d || d.etape === 'annulee') aller('/auto/catalogue', { remplacer: true }); });
  const refuse = $derived(d?.etape === 'refusee');
  const premier = $derived(d && app.compte ? premierPrelevement(jourDe(new Date(maintenant())), app.compte.jourPaie) : '');
  const controles = $derived(d?.decision?.controles ?? []);
  let ouverts = $state<Record<string, boolean>>({});
  const estOuvert = (id: string, ok: boolean) => ouverts[id] ?? !ok;
  const bascule = (id: string, ok: boolean) => (ouverts[id] = !estOuvert(id, ok));
  const expire = $derived(d ? !offreValide(d) && !estSigne(d) && !refuse : false);
</script>

{#if d}
<Ecran titre="Décision" sur="Étape 3 / 5 · analyse automatique" retourVers="/auto/simulation">
  <section class="verdict" class:refus={refuse} role="status">
    <span class="rond">{#if refuse}<Icone nom="fermer" taille={22} trait={2.4} />{:else}<Icone nom="ok" taille={22} trait={2.4} />{/if}</span>
    <b class="mot">{refuse ? 'REFUSÉ' : expire ? 'OFFRE EXPIRÉE' : 'APPROUVÉ'}</b>
    {#if refuse}
      <p class="lead">Nous ne pouvons pas financer {veh?.court ?? 'ce véhicule'} dans ces conditions.</p>
      <p class="motif"><b>Motif :</b> {d.motifRefus}</p>
    {:else}
      <p class="lead"><b class="mono">{fcfa(d.financement)} FCFA</b> accordés pour {veh?.court ?? d.vehiculeTitre}{d.apport ? `, avec ${fcfa(d.apport)} d'apport` : ''}.</p>
      <p class="muted">{expire ? "L'offre de 7 jours a expiré : relancez une simulation." : `Offre valable jusqu'au ${jourLong(d.offreJusqua)}. Rien n'est prélevé avant la livraison.`}</p>
    {/if}
  </section>

  {#if controles.length}
  <section class="controles" aria-label="Contrôles de la décision">
    {#each controles as c (c.id)}
      <div class="ctl" class:ko={!c.ok}>
        <button aria-expanded={estOuvert(c.id, c.ok)} aria-controls="ctl-{c.id}" onclick={() => bascule(c.id, c.ok)}>
          <span class="coche" class:ko={!c.ok}><Icone nom={c.ok ? 'ok' : 'fermer'} taille={14} trait={2.6} /></span>
          <span class="t">{c.titre}</span><span class="tag mono">{c.tag}</span>
          <span class="fl" class:o={estOuvert(c.id, c.ok)}><Icone nom="suivant" taille={14} trait={2.2} /></span>
        </button>
        {#if estOuvert(c.id, c.ok)}<p id="ctl-{c.id}">{c.detail}</p>{/if}
      </div>
    {/each}
  </section>
  {/if}

  {#if !refuse}
    <section class="resume">
      <div><small>Mensualité</small><b class="mono">{fcfa(d.mensualite)}</b></div>
      <div><small>Durée</small><b class="mono">{d.duree} mois</b></div>
      <div><small>1er prélèvement</small><b class="mono">{premier ? jourCourt(premier) : '—'}</b></div>
    </section>
  {/if}
  <p class="legal">Décision rendue par [ÉTABLISSEMENT AGRÉÉ COBAC] sur la base de vos données AssureMe, avec votre accord.</p>

  {#snippet pied()}
    {#if refuse}
      <Bouton href="/auto/simulation">Modifier la durée ou l'apport</Bouton>
      <Bouton variante="discret" href="/auto/catalogue">Choisir un autre véhicule</Bouton>
    {:else if estSigne(d)}
      <Bouton href="/auto/livraison">Suivre ma livraison<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else if expire}
      <Bouton href="/auto/simulation">Relancer la simulation</Bouton>
    {:else}
      <Bouton href="/auto/contrat">Accepter et signer<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
      <Bouton variante="discret" href="/auto/simulation">Modifier la durée ou l'apport</Bouton>
    {/if}
  {/snippet}
</Ecran>
{/if}

<style>
  .verdict { padding: 20px; border-radius: 24px; display: flex; flex-direction: column; gap: 8px; background: linear-gradient(165deg, rgba(61, 213, 152, 0.16), var(--carte) 70%); border: 1px solid rgba(61, 213, 152, 0.4); }
  .verdict.refus { background: linear-gradient(165deg, rgba(255, 114, 114, 0.16), var(--carte) 70%); border-color: rgba(255, 114, 114, 0.4); }
  .rond { width: 44px; height: 44px; border-radius: 22px; display: grid; place-items: center; background: var(--bon); color: #06281c; } .refus .rond { background: var(--danger); color: #3a0a0a; }
  .mot { font: 700 13px var(--mono); letter-spacing: 0.14em; color: var(--bon); } .refus .mot { color: var(--danger); } .lead { font-size: 17px; line-height: 1.35; } .motif { font-size: 14px; }
  .controles { border-radius: 20px; background: var(--carte); border: 1px solid var(--ligne); overflow: hidden; }
  .ctl { border-bottom: 1px solid var(--ligne); } .ctl:last-child { border: 0; }
  .ctl button { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 10px 14px; text-align: left; } .t { flex: 1; font-weight: 550; font-size: 14px; }
  .coche { width: 22px; height: 22px; border-radius: 11px; display: grid; place-items: center; flex: none; background: rgba(61, 213, 152, 0.2); color: var(--bon); } .coche.ko { background: rgba(255, 114, 114, 0.2); color: var(--danger); }
  .tag { font-size: 9.5px; letter-spacing: 0.06em; color: var(--muted); } .fl { color: var(--muted); transition: transform 0.2s; } .fl.o { transform: rotate(90deg); }
  .ctl p { padding: 0 14px 14px 46px; color: var(--doux); font-size: 13.5px; line-height: 1.45; }
  .resume { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .resume div { padding: 12px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 4px; }
  small { color: var(--muted); font: 500 10px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; } .resume b { font-size: 16px; }
  .legal { color: var(--faint); font-size: 12px; line-height: 1.45; }
</style>
