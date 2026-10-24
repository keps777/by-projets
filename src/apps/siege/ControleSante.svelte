<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { sante, type Service } from '../../core/sante.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { heureLocale, personneCourante } from '../../domain/actions.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { relancerOrangeMoney } from './actions.ts';
  import { injecterDemo } from './demo.ts';
  import { lireSiege } from './etat.ts';
  import Jauge from './Jauge.svelte';
  import Lien from './Lien.svelte';
  import Siege from './Siege.svelte';

  injecterDemo();
  const moi = personneCourante();
  let tick = $state(0);
  $effect(() => { const t = setInterval(() => tick++, 10_000); return () => clearInterval(t); });
  const now = $derived.by(() => { void tick; return maintenant(); });
  const etat = $derived(lireSiege());
  const enAttente = $derived(app.monde.paiements.filter((p) => p.statut === 'attente' && (p.expireLe ?? 0) > now).length);
  const s = $derived(sante({ minute: Math.floor(now / 60_000), omRelancee: etat.omRelancee, paiementsAttente: enAttente, horsLigneLocal: app.session.hors_ligne }));
  const prochain = $derived(heureLocale(Math.ceil((now + 60_000) / 900_000) * 900_000));
  const ouvert = $state<Record<string, boolean>>({});
  function relancer() { relancerOrangeMoney(moi?.id); montrer('Passerelle Orange Money relancée'); }
  const lat = (x: Service) => (x.latenceMs === null ? '—' : x.latenceMs >= 1000 ? `${(x.latenceMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : `${x.latenceMs} ms`);
</script>

<Siege actif="controle">
  <div class="top">
    <div class="row g12"><Lien href="/siege/controle" class="ib" aria-label="Retour à la salle de contrôle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Lien>
      <div class="col"><h1 class="ttl">Santé du système</h1><span class="t13 mut">disponibilité 30 jours : {s.disponibilite30j.toLocaleString('fr-FR')} % · 1 incident</span></div></div>
    <div class="row g8 wrapf"><span class="pl {s.incident ? 'wa' : 'ok'}" role="status"><span class="dot"></span>{s.incident ? '1 service dégradé' : 'tout est ok'}</span><Lien href="/maintenance" class="b s sm">Page maintenance</Lien></div>
  </div>
  <p class="tag-demo" role="note">Mesures simulées de démonstration (aucune sonde réelle). Seuls les paiements en attente sont comptés dans le monde simulé.</p>

  <div class="kpis">
    <div class="gl"><span class="lab">Latence app</span><span class="ttl t24">{s.latenceP95} ms</span><span class="t12 okc">p95 · Cameroun</span></div>
    <div class="gl"><span class="lab">Ventes hors ligne en attente</span><span class="ttl t24">{s.horsLigne}</span><span class="t12 mut">se synchronisent au réseau</span></div>
    <div class="gl"><span class="lab">USSD *123#</span><span class="ttl t24">{s.ussdSec.toLocaleString('fr-FR')} s</span><span class="t12 okc">MTN et Orange ok</span></div>
    <div class="gl"><span class="lab">Erreurs 1 h</span><span class="ttl t24">{s.erreurs1h}</span><span class="t12 mut">sur {fcfa(s.requetes1h)} requêtes</span></div>
  </div>

  <div class="gl"><span class="t15 b7">Jauges</span>
    <div class="jauges" style="margin-top: 8px">
      <Jauge titre="Latence p95" valeur={s.latenceP95} max={1000} seuilBas={300} seuilHaut={600} texte="{s.latenceP95} ms" sous="seuil d’alerte 600 ms" />
      <Jauge titre="File hors ligne" valeur={s.horsLigne} max={20} seuilBas={3} seuilHaut={10} texte="{s.horsLigne} vente{s.horsLigne > 1 ? 's' : ''}" sous="alerte au-delà de 10" />
      <Jauge titre="Paiements en attente" valeur={s.paiementsAttente} max={30} seuilBas={5} seuilHaut={15} texte={String(s.paiementsAttente)} sous="alerte au-delà de 15" />
      <Jauge titre="Erreurs sur 1 h" valeur={s.erreurs1h} max={40} seuilBas={5} seuilHaut={20} texte={String(s.erreurs1h)} sous="alerte au-delà de 20" />
    </div>
  </div>

  <div class="c21">
    <div class="gl">
      <span class="t15 b7">Services</span>
      <div class="col" style="gap: 0; margin-top: 6px">
        {#each s.services as v (v.id)}
          <div class="svc"><span class="pl {v.statut === 'ok' ? 'ok' : 'wa'}">{v.statut === 'ok' ? 'ok' : 'lent'}</span><span class="col grow" style="min-width: 150px"><span class="t14 b6">{v.nom}</span><span class="t12 mut">{v.detail}</span></span>
            <span class="mini" role="img" aria-label="Latence des 40 dernières minutes, dernier relevé {lat(v)}">{#each v.historique as h, i (i)}<i class={v.statut === 'lent' && i === 7 ? 'hi' : ''} style="height: {h}%"></i>{/each}</span><span class="mono t12" style="min-width: 60px; text-align: right">{lat(v)}</span>
            {#if v.id === 'om'}<button type="button" class="b g sm xs" disabled={etat.omRelancee} onclick={relancer}>{etat.omRelancee ? 'relancée' : 'Relancer'}</button>
            {:else}<button type="button" class="b g sm xs" aria-expanded={!!ouvert[v.id]} onclick={() => (ouvert[v.id] = !ouvert[v.id])}>détails</button>{/if}
          </div>
          {#if ouvert[v.id]}<p class="t12 mut" style="padding: 0 0 10px">{v.nom} : {v.detail}. Latence actuelle {lat(v)} ; normale {v.latenceMs === null ? 'sans objet' : 'sous 5 s'}. Aucune action à mener.</p>{/if}
        {/each}
      </div>
    </div>
    <div class="col g12">
      <div class="gl"><span class="t15 b7">Incident en cours</span>
        {#if s.incident}<div class="col g6" style="margin-top: 6px"><div class="row sp wrapf"><span class="t14 b7">Passerelle Orange Money lente</span><span class="pl wa">dégradé</span></div><span class="t13 mut">Depuis {heureLocale(etat.incidentDepuis || now - 22 * 60_000)} · paiements OM en 9 s au lieu de 2 s · bascule automatique sur MoMo proposée aux clients.</span><span class="t12 mut3">Prochain point : {prochain}</span></div>
        {:else}<div class="col g6" style="margin-top: 6px"><div class="row sp wrapf"><span class="t14 b7">Aucun incident en cours</span><span class="pl ok">ok</span></div><span class="t13 mut">Passerelle Orange Money relancée à {heureLocale(etat.relanceeA)} : paiements OM revenus à 2 s.</span></div>{/if}
      </div>
      <div class="gl"><span class="t15 b7">30 derniers jours</span>
        <div class="col" style="gap: 0; margin-top: 6px"><div class="li"><span class="grow t13">Disponibilité</span><span class="mono b7 okc">{s.disponibilite30j.toLocaleString('fr-FR')} %</span></div><div class="li"><span class="grow t13">Incidents</span><span class="mono b7">1 · 22 min</span></div><div class="li"><span class="grow t13">Sauvegardes</span><span class="mono b7 okc">{s.sauvegardes} / 30</span></div><div class="li"><span class="grow t13">Billets signés hors ligne vérifiés</span><span class="mono b7">{fcfa(s.billetsVerifies)}</span></div></div></div>
    </div>
  </div>
</Siege>
