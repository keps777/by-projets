<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import { aller } from '../../router.svelte.ts';
  import { ecartJours, jourCourt } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { masquerNumero } from '../../core/sante-carte.ts';
  import { PRIX_PASS } from '../../core/sante.ts';
  import { app } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { appelerAmbulance } from './actions.ts';
  import { aujourdhui, beneficiaires, initSante, couvertureDe, enRetard, facturesARegler, facturesReglees, utilisation } from './etat.ts';
  import CodeCarte from './CodeCarte.svelte';
  import FeuilleCouverture from './FeuilleCouverture.svelte';
  import FeuilleTele from './FeuilleTele.svelte';
  import Ordonnances from './Ordonnances.svelte';
  import Reseau from './Reseau.svelte';
  initSante();

  let couverture = $state(false); let qr = $state(false); let tele = $state(false); let ordo = $state(false); let urgence = $state(false); let ouvert = $state('');
  const c = $derived(couvertureDe());
  const u = $derived(utilisation());
  const noms = $derived(beneficiaires());
  const aRegler = $derived(facturesARegler());
  const reglees = $derived(facturesReglees());
  const auj = $derived(aujourdhui());
  const plafondAtteint = $derived(u.plafond > 0 && u.restant <= 0);
  const echeance = (j: string) => { const n = ecartJours(auj, j); return n < 0 ? 'EN RETARD' : n === 0 ? "AUJOURD'HUI" : `J-${n}`; };
  const nomPass = $derived(app.compte ? app.compte.pass.toUpperCase() : '');
  function ambulance() { const r = appelerAmbulance(); if (r.ok) { montrer('Ambulance prévenue'); urgence = false; } else montrer(r.erreur, 'danger'); }
</script>

<Ecran titre="Santé" retourVers="/">
  {#snippet droite()}<button class="rond" onclick={() => (couverture = true)} aria-label="Voir ma couverture"><Icone nom="info" taille={18} /></button>{/snippet}

  {#if c && app.compte}
    <Carte accent="var(--bon)" rayon={26}>
      <div class="haut"><span class="et mono">CARTE SANTÉ {nomPass}</span>{#if plafondAtteint}<Pastille ton="alerte">Plafond atteint</Pastille>{:else}<Pastille ton="bon">Couvert</Pastille>{/if}</div>
      <p class="qui">{noms.join(', ')}</p>
      <button class="carte-code" onclick={() => (qr = true)} aria-label="Afficher ma carte en grand à l'accueil"><CodeCarte numero={app.compte.numeroMembre} taille={96} compact /></button>
      <div class="plaf"><span>Plafond annuel utilisé</span><b class="mono">{fcfa(u.utilise)} / {fcfa(u.plafond)}</b></div>
      <Jauge pct={u.pct} couleur="var(--bon)" />
      <div class="bas"><span>{fcfa(PRIX_PASS[app.compte.pass])} FCFA / mois · {Math.round(c.taux * 100)} % pris en charge</span><span class="mono num">{masquerNumero(app.compte.numeroMembre)}</span></div>
    </Carte>

    <nav class="actions" aria-label="Actions rapides">
      <a href="/pay/scan" onclick={(e) => { e.preventDefault(); aller('/pay/scan'); }}><Icone nom="carte" taille={22} /><b>Payer à l'accueil</b><small>scanner</small></a>
      <button onclick={() => (tele = true)}><Icone nom="telephone" taille={22} /><b>Téléconsult.</b><small>dès 2 000</small></button>
      <button onclick={() => (ordo = true)}><Icone nom="pharmacie" taille={22} /><b>Ordonnance</b><small>livrée 2 h</small></button>
      <button onclick={() => (urgence = true)}><Icone nom="attention" taille={22} /><b>Urgence</b><small>ambulance</small></button>
    </nav>

    <section aria-labelledby="t-regler">
      <h2 id="t-regler">À régler</h2>
      {#if aRegler.length === 0}
        <Carte><p class="muted vide">Aucune facture à régler. Quand une clinique du réseau vous facture, elle apparaît ici et vous ne payez que votre part.</p></Carte>
      {:else}
        <div class="pile">
          {#each aRegler as f (f.id)}
            <Carte href="/sante/facture/{f.id}" accent={enRetard(f) ? 'var(--alerte)' : ''}>
              <div class="fac"><div class="fm"><b>{f.etablissement}</b><small>{f.patient} · {f.acte} · {jourCourt(f.date)}</small><small>Échéance {jourCourt(f.echeance)}</small></div>
                <div class="fd"><b class="mono">{fcfa(f.partPatient)}</b><small>FCFA à votre charge</small><Pastille ton={enRetard(f) ? 'alerte' : 'primaire'}>{echeance(f.echeance)}</Pastille></div></div>
              <span class="cta">Régler ma part <Icone nom="fleche" taille={16} /></span>
            </Carte>
          {/each}
        </div>
      {/if}
    </section>

    <section aria-labelledby="t-reseau"><h2 id="t-reseau">Réseau autour de vous</h2><Reseau /></section>
    <section aria-labelledby="t-ordo"><div class="ent"><h2 id="t-ordo">Ordonnances</h2><button class="lien" onclick={() => (ordo = true)}>Envoyer</button></div><Ordonnances bind:ouverte={ordo} /></section>

    <section aria-labelledby="t-soins">
      <h2 id="t-soins">Soins récents</h2>
      {#if reglees.length === 0}
        <Carte><p class="muted vide">Aucun soin pour le moment.</p></Carte>
      {:else}
        <Carte rayon={20}>
          <ul class="soins">
            {#each reglees.slice(0, 8) as f (f.id)}
              <li>
                <button aria-expanded={ouvert === f.id} onclick={() => (ouvert = ouvert === f.id ? '' : f.id)}>
                  <span class="sm"><b>{f.acte} · {f.patient.split(' ')[0]}</b><small>{f.etablissement}, {jourCourt(f.date)}</small></span>
                  <span class="mono sv">{fcfa(f.partPatient)} <small>/ {fcfa(f.total)}</small></span>
                </button>
                {#if ouvert === f.id}<p class="sd">{f.etablissement}{f.medecin ? `, ${f.medecin}` : ''}. {f.numero}. Prise en charge AssureMe : {fcfa(f.assureMe)} FCFA ({Math.round((f.assureMe / f.total) * 100)} %). {f.paiement?.mode === 'etale' ? `Part étalée sur ${f.paiement.mois} mois.` : 'Part réglée.'}</p>{/if}
              </li>
            {/each}
          </ul>
        </Carte>
      {/if}
    </section>
  {:else}
    <Carte><p class="muted vide">Créez votre compte pour activer votre carte santé.</p></Carte>
  {/if}
  <div class="espace" aria-hidden="true"></div>
</Ecran>

<FeuilleCouverture bind:ouverte={couverture} />
<FeuilleTele bind:ouverte={tele} />
<Feuille bind:ouverte={qr} titre="Ma carte à l'accueil" sous="Pass {app.compte?.pass ?? ''}">
  {#if app.compte}
    <p class="muted">Montrez ce code ou dites-le à l'accueil d'un établissement du réseau. Il change toutes les 30 secondes : aucun papier, aucune avance.</p>
    <CodeCarte numero={app.compte.numeroMembre} taille={220} />
    <dl><div><dt>Carte</dt><dd class="mono">{masquerNumero(app.compte.numeroMembre)}</dd></div><div><dt>Bénéficiaires</dt><dd class="mono">{noms.length}</dd></div></dl>
  {/if}
  <Bouton variante="discret" onclick={() => (qr = false)}>Fermer</Bouton>
</Feuille>
<Feuille bind:ouverte={urgence} titre="Urgence">
  <p class="muted">Une ambulance du réseau est envoyée à votre position. Le transport est pris en charge à 100 %.</p>
  <dl><div><dt>Position</dt><dd>{app.compte?.quartier}, {app.compte?.ville}</dd></div></dl>
  <Bouton variante="danger" onclick={ambulance}>Appeler l'ambulance</Bouton>
  <Bouton variante="discret" onclick={() => (urgence = false)}>Fermer</Bouton>
</Feuille>

<style>
  .rond { width: 40px; height: 40px; border-radius: 20px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; }
  .espace { height: 76px; flex: none; }
  .haut { display: flex; justify-content: space-between; align-items: center; } .et { font-size: 10.5px; letter-spacing: 0.12em; color: var(--bon); }
  .qui { margin: 6px 0 12px; font-size: 18px; font-weight: 650; }
  .carte-code { display: block; width: 100%; padding: 12px; margin-bottom: 14px; border-radius: 18px; background: color-mix(in srgb, var(--fond) 55%, transparent); border: 1px solid var(--ligne); text-align: left; }
  .plaf { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; font-size: 13px; color: var(--doux); } .plaf b { font-size: 14px; color: var(--texte); }
  .bas { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-top: 10px; font-size: 12.5px; color: var(--muted); } .num { color: var(--doux); white-space: nowrap; }
  .actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .actions a, .actions button { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 4px; min-height: 84px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); text-align: center; }
  .actions b { font-size: 12px; font-weight: 600; } .actions small { font-size: 11px; color: var(--muted); }
  h2 { font-size: 16px; margin-bottom: 8px; } section { display: flex; flex-direction: column; } .ent { display: flex; justify-content: space-between; align-items: center; } .ent h2 { margin: 0; }
  .lien { min-height: 44px; padding: 0 6px; color: var(--primaire-clair); font-weight: 600; } .vide { font-size: 13.5px; } .pile { display: flex; flex-direction: column; gap: 10px; }
  .fac { display: flex; justify-content: space-between; gap: 12px; } .fm, .fd { display: flex; flex-direction: column; gap: 2px; } .fd { align-items: flex-end; text-align: right; } .fm b { font-size: 15.5px; }
  small { color: var(--muted); font-size: 12.5px; } .fd b { font-size: 20px; } .cta { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; color: var(--primaire-clair); font-weight: 650; font-size: 14px; }
  .soins { list-style: none; } .soins li { border-bottom: 1px solid var(--ligne); } .soins li:last-child { border: 0; }
  .soins button { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; text-align: left; min-height: 56px; } .sm { display: flex; flex-direction: column; min-width: 0; } .sv { text-align: right; font-size: 14px; white-space: nowrap; }
  .sd { padding: 0 0 12px; font-size: 13px; color: var(--doux); }
  dl div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--ligne); } dt { color: var(--muted); } dd { font-weight: 550; }
</style>
