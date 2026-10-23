<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Etiquette from '../_services/Etiquette.svelte';
  import Choix from '../_services/Choix.svelte';
  import Verrou from '../_services/Verrou.svelte';
  import { chiffres, pct1 } from '../_services/format.ts';
  import { KITS } from '../../core/energie.ts';
  import { PLAFOND_ENDETTEMENT } from '../../core/credit.ts';
  import { NOM_NIVEAU, niveauPourKit, premierPrelevementKit } from '../../core/services.ts';
  import { jourCourt, jourDe, jourLong } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { commander, creneaux, evaluer, niveau, taux } from './actions.ts';
  import { DUREES, apercu, dateFinPlan, etatInstallation, kitAccessible, kitDe, texteEcart } from './calcul.ts';
  import { etat, type Plan } from './etat.ts';
  import type { Decision } from '../../core/credit.ts';

  const e = etat();
  const lvl = $derived(niveau());
  const kit = $derived(kitDe(e.kit));
  const accessible = $derived(kitAccessible(kit.prix, lvl));
  const requis = $derived(niveauPourKit(kit.prix));
  const facture = $derived(parseInt(e.facture || '0', 10) || 0);
  const ev = $derived(evaluer(e.kit, e.duree));
  const ap = $derived(apercu(kit.prix, e.duree, taux(), facture));
  const jourPaie = $derived(app.compte?.jourPaie ?? 28);
  const maintenantJour = $derived(jourDe(new Date(maintenant())));
  const slots = $derived(creneaux());
  let creneau = $state('');
  $effect(() => { if (!slots.some((s) => s.jour === creneau)) creneau = slots[0]?.jour ?? ''; });
  const premier = $derived(creneau ? premierPrelevementKit(creneau, jourPaie) : '');

  let ouverte = $state(false); let refus = $state<Decision | null>(null); let erreur = $state(''); let commande = $state<Plan | null>(null);
  function ouvrir() { refus = null; erreur = ''; commande = null; ouverte = true; }
  function confirmer() {
    const r = commander(e.kit, e.duree, creneau);
    if (r.ok) { commande = r.plan; montrer(`Kit commandé · installation ${slots.find((s) => s.jour === creneau)?.label.toLowerCase()}`); return; }
    erreur = r.erreur; refus = r.decision ?? null;
  }
  const specs = $derived([[kit.puissance, 'de panneaux'], [kit.autonomie, "d'autonomie"], [kit.garantie, 'de garantie']]);
  const creditDe = (p: Plan) => app.credits.find((c) => c.id === p.creditId);
</script>

<Ecran titre="Énergie solaire" sur="Installé en 5 jours">
  <p class="slogan">Payez l'énergie, pas le kit.</p>
  {#if e.plans.length}
    <section class="bloc" aria-labelledby="mk">
      <Etiquette id="mk">Mes kits</Etiquette>
      {#each e.plans as p (p.id)}
        {@const c = creditDe(p)}
        <Carte accent={p.termine ? 'var(--bon)' : ''}>
          <div class="plan">
            <div class="entete"><b>Kit {p.nom}</b>
              {#if p.termine}<Pastille ton="bon">À vous</Pastille>{:else if p.veille}<Pastille ton="alerte">En veille</Pastille>{:else}<Pastille ton="primaire">{etatInstallation(p, maintenantJour) === 'installee' ? 'Installé' : 'Installation planifiée'}</Pastille>{/if}
            </div>
            <small class="muted">{etatInstallation(p, maintenantJour) === 'installee' ? 'Posé le' : 'Installation'} {p.creneau}</small>
            {#if c}<Jauge pct={(c.payees / c.duree) * 100} couleur="var(--alerte)" />
              <div class="entete"><span class="mono">{c.payees} / {c.duree} mensualités</span><span class="mono muted">{fcfa(p.mensualite)} / mois</span></div>
              {#if p.termine}<small class="bon">Les {c.duree} mensualités sont payées : le kit vous appartient.</small>
              {:else}<small class="muted">Prochain prélèvement le {jourCourt(c.prochaine)} · le kit est à vous après le {jourLong(dateFinPlan(p, jourPaie))}.</small>
                {#if p.veille}<small class="alerte">Mensualité reportée : le kit repart dès le prochain paiement, sans pénalité.</small>{/if}{/if}
            {/if}
          </div>
        </Carte>
      {/each}
    </section>
  {/if}

  <section class="bloc" aria-labelledby="qk">
    <Etiquette id="qk">Quel kit ?</Etiquette>
    <div class="kits" role="radiogroup" aria-label="Kit solaire">
      {#each KITS as k (k.id)}
        {@const ok = kitAccessible(k.prix, lvl)}
        <button type="button" role="radio" aria-checked={e.kit === k.id} class:on={e.kit === k.id} class:off={!ok} onclick={() => (e.kit = k.id)}>
          <Icone nom={ok ? 'solaire' : 'verrou'} taille={22} /><b>{k.nom}</b><span class="mono">{fcfa(k.prix)}</span>
        </button>
      {/each}
    </div>
    {#if !accessible}<Verrou requis={requis} quoi={`Kit ${kit.court}`} />{/if}
  </section>

  <section class="bloc" aria-labelledby="sur">
    <Etiquette id="sur">Sur</Etiquette>
    <Choix nom="Durée" bind:valeur={e.duree} options={DUREES.map((d) => ({ valeur: d as number, label: `${d} mois` }))} />
  </section>

  <Champ bind:valeur={e.facture} etiquette="Votre facture ENEO" suffixe="/ mois" inputmode="numeric" placeholder="ex. 18000" oninput={() => (e.facture = chiffres(e.facture, 7))} />

  <section class="hero" aria-live="polite">
    <div class="ligne"><span class="mono">KIT {kit.court.toUpperCase()} · SUR SALAIRE LE {jourPaie}</span></div>
    <div class="prix"><b class="mono">{ev ? fcfa(ev.mensualite) : '—'}</b><span>/ mois</span></div>
    <p>Le kit est à vous après {e.duree} mois</p>
    <p class="ecart mono" class:eco={ap?.economie}>{facture ? texteEcart(ap?.ecart ?? null) : 'Entrez votre facture ENEO pour comparer'}</p>
    <div class="specs">{#each specs as [v, l] (l)}<div><b class="mono">{v}</b><small>{l}</small></div>{/each}</div>
  </section>

  {#if ev}
    <div class="part" class:trop={!ev.decision.approuve && ev.part > PLAFOND_ENDETTEMENT}>
      <div class="entete"><span>Part de votre salaire prélevée</span><b class="mono">{pct1(ev.part)} %</b></div>
      <Jauge pct={ev.part * 100} trait={PLAFOND_ENDETTEMENT * 100} couleur={ev.part > PLAFOND_ENDETTEMENT ? 'var(--danger)' : 'var(--alerte)'} />
      <small class="muted">Tous crédits compris, le plafond est de 33 % : avant cette commande, vous pouviez encore prélever {fcfa(ev.capacite)} par mois.</small>
      {#if ev.part > PLAFOND_ENDETTEMENT}<small class="danger" role="alert">Cette commande dépasserait 33 % de votre salaire : allongez la durée ou choisissez un kit plus petit.</small>{/if}
    </div>
  {/if}

  <p class="info"><Icone nom="info" taille={16} />En cas de retard, le kit se met en veille et repart au paiement. Jamais de saisie, jamais de pénalité.</p>

  {#snippet pied()}
    <Bouton desactive={!accessible} onclick={ouvrir}>{accessible ? `Commander le kit ${kit.court}` : `Kit ${kit.court} · niveau ${NOM_NIVEAU[requis ?? 'ELITE']} requis`}</Bouton>
  {/snippet}
</Ecran>

<Feuille bind:ouverte titre={commande ? 'Commande confirmée' : refus ? 'Demande refusée' : `Installation du kit ${kit.court}`}>
  {#if commande}
    <div class="fin" role="status"><span class="coche"><Icone nom="ok" taille={26} trait={3} /></span><b>Kit {commande.nom} commandé</b>
      <p class="muted">Installation {commande.creneau}. Première mensualité de {fcfa(commande.mensualite)} le {jourCourt(commande.premier)}, sur votre salaire.</p>
      <Bouton onclick={() => (ouverte = false)}>Fermer</Bouton><Bouton variante="discret" href="/">Retour à l'accueil</Bouton></div>
  {:else if refus}
    <p class="muted">Nous ne pouvons pas accorder ce kit aujourd'hui.</p>
    {#each refus.controles as c (c.id)}
      <div class="ctl" class:ko={!c.ok}><Icone nom={c.ok ? 'ok' : 'fermer'} taille={16} trait={2.4} /><span><b>{c.titre}</b><small>{c.detail}</small></span></div>
    {/each}
    {#if ev && ev.capacite > 0}<p class="muted petit">Vous pouvez encore prélever {fcfa(ev.capacite)} par mois : essayez une durée plus longue ou un kit moins cher.</p>{/if}
    <Bouton onclick={() => (ouverte = false)}>Modifier ma commande</Bouton>
  {:else}
    <p class="muted">Un technicien AssureMe pose et teste le kit. Compter 5 jours.</p>
    <Etiquette>Jour d'installation</Etiquette>
    <div class="radios" role="radiogroup" aria-label="Jour d'installation">
      {#each slots as s (s.jour)}<button type="button" role="radio" aria-checked={creneau === s.jour} class:on={creneau === s.jour} onclick={() => (creneau = s.jour)}><b>{s.label}</b><small>{s.sous}</small></button>{/each}
    </div>
    <div class="recap"><span>Prélevé sur salaire dès le {premier ? jourCourt(premier) : '—'}</span><b class="mono">{ev ? fcfa(ev.mensualite) : '—'}</b></div>
    {#if erreur}<p class="danger" role="alert">{erreur}</p>{/if}
    <Bouton onclick={confirmer}>Confirmer la commande</Bouton>
  {/if}
</Feuille>

<style>
  .slogan { color: var(--doux); font-size: 14px; margin-top: -4px; }
  .bloc { display: flex; flex-direction: column; gap: 8px; } .entete { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .plan { display: flex; flex-direction: column; gap: 8px; } small { font-size: 12.5px; line-height: 1.4; } .bon { color: var(--bon); } .alerte { color: var(--alerte); } .danger { color: var(--danger); font-size: 13px; }
  .kits { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .kits button { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px; min-height: 96px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); text-align: left; }
  .kits button.on { background: rgba(255, 122, 47, 0.14); border-color: var(--alerte); color: var(--texte); } .kits button.on :global(svg) { color: var(--alerte); } .kits button.off { opacity: 0.6; }
  .kits b { font-size: 14px; } .kits .mono { font-size: 12px; color: var(--muted); }
  .hero { border-radius: 24px; padding: 18px; display: flex; flex-direction: column; gap: 8px; background: linear-gradient(150deg, rgba(255, 122, 47, 0.28), rgba(255, 122, 47, 0) 70%), var(--carte); border: 1px solid rgba(255, 122, 47, 0.4); }
  .ligne { font-size: 10.5px; letter-spacing: 0.1em; color: #ffd2ba; } .prix { display: flex; align-items: baseline; gap: 6px; } .prix b { font-size: 40px; font-weight: 500; letter-spacing: -0.03em; line-height: 1; } .prix span { color: var(--doux); }
  .ecart { font-size: 14px; color: #ffd2ba; } .ecart.eco { color: var(--bon); }
  .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; border-top: 1px solid var(--ligne-forte); padding-top: 10px; } .specs div { display: flex; flex-direction: column; } .specs b { font-size: 16px; font-weight: 500; } .specs small { color: var(--muted); font-size: 11.5px; }
  .part { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); font-size: 13.5px; } .part.trop { border-color: rgba(255, 114, 114, 0.5); }
  .info { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; color: var(--muted); line-height: 1.4; } .info :global(svg) { flex: none; color: var(--primaire-clair); margin-top: 1px; }
  .radios { display: flex; flex-direction: column; gap: 8px; } .radios button { display: flex; flex-direction: column; text-align: left; padding: 12px 14px; min-height: 56px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne); } .radios button.on { background: var(--primaire-fond); border-color: var(--primaire); } .radios small { color: var(--muted); }
  .recap { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; padding: 8px 0; align-items: baseline; }
  .ctl { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--ligne); color: var(--bon); } .ctl.ko { color: var(--danger); } .ctl span { display: flex; flex-direction: column; color: var(--texte); } .ctl small { color: var(--muted); } .petit { font-size: 12.5px; }
  .fin { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; } .coche { width: 60px; height: 60px; border-radius: 30px; background: var(--bon); color: #07090f; display: grid; place-items: center; }
</style>
