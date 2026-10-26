<script lang="ts">
  import './compte.css';
  import Ecran from '../../ui/Ecran.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Pic from './Pic.svelte';
  import { reseau } from './reseau.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { dateLongue } from '../solde/actions.ts';
  import { AVANTAGES, COMPARAISON, NIVEAUX, niveauPour, numeroMembre, pct, prixPass, resilier, souscrire, transactionsAnnee } from './pass.ts';
  import { nomCourt } from './proches.ts';
  import { TAUX_COMMISSION } from '../../core/regles.ts';

  /** Pass NexG (abonnement simulé). Public : un visiteur la consulte ; l'achat exige un compte. */
  const compte = $derived(compteCourant());
  const membre = $derived(!!compte?.pass.actif);
  const niveau = $derived(compte && membre ? niveauPour(transactionsAnnee(app.monde, compte.id, maintenant())) : undefined);
  let erreur = $state(''), confirmation = $state(false), fait = $state('');
  const NB = ' ';
  const icones: Record<string, string> = { drops: 'eclair', cloche: 'cloche', piece: 'portefeuille', calendrier: 'horloge' };

  function activer() {
    erreur = ''; fait = '';
    if (!compte) { aller('/inscription'); return; }
    if (!reseau.enLigne) return;
    const r = souscrire(compte.id);
    if (!r.ok) { erreur = r.message; return; }
    fait = r.mode === 'solde' ? `Pass activé : ${prixPass()} prélevés sur votre solde NexG (démo).` : 'Pass activé avec la carte de démonstration. Aucun paiement réel.';
    montrer('Le Pass NexG est actif.');
  }
  function resilierPass() { if (compte && resilier(compte.id)) { confirmation = false; fait = 'Pass résilié. La commission de revente repasse à ' + pct(TAUX_COMMISSION) + '.'; erreur = ''; montrer('Pass résilié.'); } }
  const va = (e: MouseEvent, c: string) => { if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); aller(c); };
</script>

<Ecran titre="Pass NexG" face="nuit" retour={compte ? '/compte' : '/explorer'}>
  <div class="cp page">
    <figure class="fig">
      <div class="carte-pass" role="img" aria-label={`Carte de membre Pass NexG${compte ? ` au nom de ${nomCourt(compte)}` : ''}`}>
        <div class="corps">
          <div class="ligne"><span class="logo"><span>NEXG</span><span class="j">·TT</span></span><span class="mb">Membre</span></div>
          <div class="mots"><span class="rang"><span class="l j">P</span><span class="l j">A</span><span class="l j">S</span><span class="l j">S</span></span><span class="rang"><span class="l">N</span><span class="l">E</span><span class="l">X</span><span class="l">G</span></span></div>
          <div class="ligne base"><span class="nom">{compte ? nomCourt(compte) : 'Votre nom'}</span><span class="mono num">N°{NB}{compte ? numeroMembre(compte.id) : '000 000'}</span></div>
        </div>
        <div class="talon"><Pic nom="eclair" taille={24} /><span>Accès drops</span></div>
        <span class="coche haut"></span><span class="coche bas"></span>
      </div>
      <figcaption class="cp-note">« Pass NexG » est un nom provisoire.</figcaption>
    </figure>

    <section class="prix" aria-labelledby="price-title">
      <div class="col g4"><h2 id="price-title" class="cp-sur">Abonnement mensuel</h2><p><span class="mono montant">{prixPass()}</span><span class="mois">/ mois</span></p></div>
      <span class="cp-puce ind">Indicatif</span>
    </section>

    <p class="avert"><Icone nom="info" taille={22} /><span>Les drops sont limités{NB}: le Pass donne l’accès, pas la garantie d’une place.</span></p>

    {#if membre && compte}<p class="statut" role="status"><Pic nom="ok" taille={18} trait={2} /><span>Pass actif{compte.pass.depuis ? ` depuis le ${dateLongue(compte.pass.depuis)}` : ''}{niveau ? ` · ${niveau.nom} (exemple)` : ''}</span></p>{/if}
    {#if fait}<p class="statut" role="status"><Pic nom="ok" taille={18} trait={2} /><span>{fait}</span></p>{/if}
    {#if erreur}<p class="cp-err" role="alert"><Icone nom="alerte" taille={16} />{erreur}</p>{/if}

    <section class="cp-groupe g12" aria-labelledby="perks-title">
      <h2 id="perks-title" class="cp-h2">Ce que le Pass ouvre</h2>
      <ul class="avantages">
        {#each AVANTAGES as a (a.titre)}
          <li><span class="cp-ico carre"><Pic nom={icones[a.icone] ?? 'eclair'} taille={20} /></span><span class="cp-txt"><span class="cp-t t16">{a.titre}</span><span class="cp-s clair">{a.texte}</span></span></li>
        {/each}
      </ul>
    </section>

    <section class="cp-groupe g10" aria-labelledby="cmp-title">
      <h2 id="cmp-title" class="cp-h2">Gratuit ou Pass</h2>
      <div class="tableau">
        <table aria-labelledby="cmp-title">
          <thead><tr><th scope="col" class="gauche">Fonction</th><th scope="col">Gratuit</th><th scope="col" class="jn">Pass</th></tr></thead>
          <tbody>
            {#each COMPARAISON as r (r.fonction)}
              <tr><th scope="row" class:gras={r.gras}>{r.fonction}</th>
                {#each [r.gratuit, r.pass] as c, i (i)}
                  <td class:mono={c !== 'inclus' && c !== 'non'} class:ok={c === 'inclus'} class:non={c === 'non'} class:jn={i === 1 && c !== 'inclus' && c !== 'non'}>
                    {#if c === 'inclus'}<Pic nom="ok" taille={18} trait={2} /><span class="sr">Inclus</span>{:else if c === 'non'}<span aria-hidden="true">—</span><span class="sr">Non inclus</span>{:else}{c}{/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="cp-note">* Taux hypothétiques, à valider. Prix indicatif, par mois.</p>
    </section>

    <section class="cp-groupe g10" aria-labelledby="tiers-title">
      <h2 id="tiers-title" class="cp-h2">Niveaux du Pass</h2>
      <p class="t-sec">Le niveau monte selon le volume de transactions — hypothèse. Noms d’exemple, à valider.</p>
      <ol class="niveaux">
        {#each NIVEAUX as n (n.n)}
          {@const mien = niveau?.n === n.n}
          <li class:mien><span class="num-n">{n.n}</span><span class="cp-txt"><span class="cp-t nom-n">{n.nom}{#if mien}<span class="cp-puce jaune p20">Votre niveau</span>{/if}</span><span class="cp-s">{n.sous}</span></span><span class="mono taux" class:jn={mien}>{n.commission}</span></li>
        {/each}
      </ol>
      <p class="cp-note">Taux de commission de revente par niveau — hypothèse. Sans Pass{NB}: {pct(TAUX_COMMISSION)}.</p>
    </section>
  </div>

  {#snippet pied()}
   <div class="cp-barre">
    <p class="t-sec centre">Résiliable à tout moment. Démo — aucun paiement réel.</p>
    {#if !compte}
      <a class="btn" href="/inscription" onclick={(e) => va(e, '/inscription')}><Pic nom="eclair" taille={20} />Créer un compte pour activer le Pass</a>
      <p class="t-aide centre">Vous pouvez consulter le Pass sans compte ; l’achat en demande un.</p>
    {:else if membre}
      <button type="button" class="btn sec" onclick={() => (confirmation = true)}>Résilier le Pass</button>
    {:else}
      <button type="button" class="btn" aria-disabled={!reseau.enLigne ? 'true' : undefined} aria-describedby={!reseau.enLigne ? 'pass-hl' : undefined} onclick={activer}><Pic nom="eclair" taille={20} />Activer le Pass (démo)</button>
      {#if !reseau.enLigne}<p id="pass-hl" class="cp-err" role="alert"><Icone nom="hors_ligne" taille={16} />Hors ligne : l’activation demande une connexion.</p>{/if}
    {/if}
   </div>
  {/snippet}
</Ecran>

<Feuille bind:ouvert={confirmation} titre="Résilier le Pass ?" sous="Vous perdez l’accès aux drops membres et aux alertes de drops.">
  <p class="t-sec">La commission de revente repasse à {pct(TAUX_COMMISSION)}. Vous pourrez le réactiver quand vous voulez. Démo : aucun remboursement réel.</p>
  {#snippet pied()}
    <button type="button" class="btn danger" onclick={resilierPass}>Résilier le Pass</button>
    <button type="button" class="btn sec" onclick={() => (confirmation = false)}>Garder le Pass</button>
  {/snippet}
</Feuille>

<style>
  .page { display: flex; flex-direction: column; gap: 24px; } .g12 { gap: 12px; } .g10 { gap: 10px; } .fig { margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .carte-pass { position: relative; min-height: 214px; display: flex; border-radius: 20px; background: #060708; border: 1px solid var(--line); }
  .corps { flex: 1; min-width: 0; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; } .ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .ligne.base { align-items: baseline; }
  .logo { display: flex; align-items: baseline; font: 700 18px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.06em; } .j { color: var(--accent); } .mb { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink3); }
  .mots { display: flex; flex-direction: column; gap: 4px; } .rang { display: flex; gap: 4px; } .l { width: 30px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 5px; background: #1C1F25; box-shadow: inset 0 -20px 0 #15171B; font: 600 22px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink); } .l.j { color: var(--accent); }
  .nom { font: 600 18px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; overflow-wrap: anywhere; } .num { font-size: 12px; color: var(--ink3); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .talon { width: 76px; flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-radius: 0 19px 19px 0; border-left: 2px dashed rgba(13, 14, 17, 0.35); background: var(--signal); color: #0D0E11; }
  .talon span { writing-mode: vertical-rl; transform: rotate(180deg); font: 700 18px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.2em; text-transform: uppercase; }
  .coche { position: absolute; right: 65px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .haut { top: -12px; } .bas { bottom: -12px; }
  .prix { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; } .prix p { margin: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; } .montant { font-weight: 600; font-size: 40px; line-height: 44px; font-variant-numeric: tabular-nums; } .mois { font-size: 16px; font-weight: 500; color: var(--ink2); } .ind { margin-bottom: 8px; }
  .avert { margin: 0; display: flex; align-items: flex-start; gap: 12px; padding: 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line-strong); font-size: 16px; line-height: 23px; font-weight: 600; } .avert :global(svg) { color: var(--up); margin-top: 1px; }
  .statut { margin: 0; display: flex; align-items: flex-start; gap: 10px; padding: 12px; border-radius: 12px; background: var(--ok-soft); border: 1px solid rgba(124, 227, 181, 0.35); color: var(--ok); font-size: 14px; line-height: 20px; font-weight: 600; }
  .avantages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; } .avantages li { display: flex; align-items: flex-start; gap: 14px; } .t16 { font-size: 16px; } .clair { color: var(--ink2); }
  .tableau { padding: 4px 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 12px 0; text-align: center; border-top: 1px solid var(--line); } thead th { border-top: 0; padding: 12px 0 10px; width: 68px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); } thead th.gauche { text-align: left; width: auto; } thead th.jn { color: var(--accent); }
  tbody th { text-align: left; font-weight: 500; padding-right: 8px; } tbody th.gras { font-weight: 600; } td.ok { color: var(--ok); } td.non { color: var(--ink3); } td.mono { font-size: 13px; font-weight: 600; color: var(--ink2); } td.jn { color: var(--accent); } td.mono:last-child { color: var(--ink); } td.jn:last-child { color: var(--accent); }
  td :global(svg) { vertical-align: middle; }
  .niveaux { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; } .niveaux li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); } .niveaux li.mien { border-color: var(--accent); }
  .num-n { width: 36px; height: 36px; flex: none; border-radius: 10px; background: var(--surface3); color: var(--ink2); display: flex; align-items: center; justify-content: center; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; } .mien .num-n { background: var(--signal); color: #0D0E11; }
  .nom-n { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; } .p20 { height: 20px; font-size: 11px; padding: 0 8px; letter-spacing: 0.08em; } .niveaux .cp-s { font-size: 12px; line-height: 16px; } .taux { flex: none; font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; } .taux.jn { color: var(--accent); }
</style>
