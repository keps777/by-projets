<script lang="ts">
  import { departParId, ligneDe, personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { fcfa } from '../../core/money.ts';
  import { jourCourt } from '../../core/dates.ts';
  import { formaterSaisie, formaterTel } from '../../core/telephone.ts';
  import { ajouterProche, bilanProche, ErreurProche, mouvementsProches, proches, retirerProche, totalPayePourEux, voyagesPasses } from './actions.ts';
  import { nav } from './lien.ts';

  /** Mes proches : qui j'ai payé, qui a payé pour moi, derniers mouvements, historique de mes voyages passés, ajout d'un proche. */
  const moi = $derived(personneCourante());
  const liste = $derived(moi ? proches(moi.id) : []);
  const bilans = $derived(liste.map((p) => ({ p, ...bilanProche(moi!.id, p.id) })));
  const totalPaye = $derived(moi ? totalPayePourEux(moi.id) : 0);
  const totalRecu = $derived(bilans.reduce((s, b) => s + b.recu, 0));
  const payeurs = $derived(bilans.filter((b) => b.recu > 0).map((b) => b.p.prenom).join(', '));
  const mouvements = $derived(moi ? mouvementsProches(moi.id) : []);
  const passes = $derived(moi ? voyagesPasses(moi.id) : []);
  let ajout = $state(false), nom = $state(''), tel = $state(''), erreur = $state('');
  const initiales = (p: { prenom: string; nom: string }) => `${p.prenom[0] ?? ''}${p.nom[0] ?? ''}`.toUpperCase();

  function ajouter() {
    if (!moi) return;
    try { const p = ajouterProche(moi.id, nom, tel); montrer(`${p.prenom} ajouté à tes proches`); ajout = false; nom = ''; tel = ''; erreur = ''; }
    catch (e) {
      if (!(e instanceof ErreurProche)) throw e;
      erreur = ({ tel_invalide: 'Numéro camerounais invalide : 9 chiffres, qui commencent par 6.', nom_invalide: 'Écris son prénom (2 lettres au moins).', soi_meme: 'C’est ton propre numéro.', deja: 'Cette personne est déjà dans tes proches.' })[e.code];
    }
  }
  function retirer(id: string, prenom: string) { if (moi) { retirerProche(moi.id, id); montrer(`${prenom} retiré de tes proches`, 'wa'); } }
  const trajet = (departId: string) => { const d = departParId(departId), l = d && ligneDe(d); return l && d ? { texte: `${l.de} → ${l.vers}`, date: jourCourt(d.jour) } : { texte: 'Billet', date: '' }; };
</script>

<Mobile titre="Mes proches" retourVers="/moi" dock={dockVoyageur('moi')}>
  {#snippet droite()}<button type="button" class="ib" aria-label="Ajouter un proche" onclick={() => (ajout = true)}><Icone nom="plus" /></button>{/snippet}
  <div class="row g8">
    <div class="gl kp"><span class="k">Payé pour eux</span><span class="v" data-testid="paye-eux">{fcfa(totalPaye)} F</span><span class="t12 mut">au total</span></div>
    <div class="gl kp"><span class="k">Payé pour moi</span><span class="v">{fcfa(totalRecu)} F</span><span class="t12 mut">{payeurs ? `par ${payeurs}` : 'par personne pour l’instant'}</span></div>
  </div>

  {#if liste.length === 0}
    <div class="gl col" style="gap: 8px"><span class="t16 b7">Pas encore de proche</span><span class="t13 mut">Ajoute Maman, un ami ou un collègue : tu pourras payer son billet en 2 touches.</span><button class="b p" type="button" onclick={() => (ajout = true)}>Ajouter un proche</button></div>
  {:else}
    <ul class="gl col" style="gap: 0; list-style: none" aria-label="Mes proches">
      {#each bilans as b, i (b.p.id)}
        <li class="li">
          <a class="rowlink" href="/proche?proche={b.p.id}" use:nav>
            <span class="av" class:hot={i === 0} aria-hidden="true">{initiales(b.p)}</span>
            <span class="col grow"><span class="t14 b7 ell">{b.p.prenom} {b.p.nom}</span><span class="t12 mut ell">{formaterTel(b.p.tel)}</span></span>
            <span class="col" style="align-items: flex-end; gap: 4px"><span class="mono t14 b7">{fcfa(b.paye)} F</span><span class="pl" class:ac={b.voyages > 0 && i === 0} class:ok={b.recu > 0}>{b.recu > 0 ? 'il paie pour moi' : b.voyages > 0 ? `${b.voyages} voyage${b.voyages > 1 ? 's' : ''}` : 'aucun voyage'}</span></span>
          </a>
          <button type="button" class="ib retire" aria-label="Retirer {b.p.prenom}" onclick={() => retirer(b.p.id, b.p.prenom)}><Icone nom="fermer" taille={16} /></button>
        </li>
      {/each}
    </ul>
  {/if}

  <span class="lab">Derniers mouvements</span>
  <ul class="gl col" style="gap: 0; list-style: none">
    {#each mouvements as m (m.id)}
      <li class="li"><span class="av sm" aria-hidden="true">{m.ini}</span><span class="col grow"><span class="t14 b7">{m.titre}</span><span class="t12 mut">{m.sous}</span></span><span class="mono b7 {m.montant > 0 ? 'okc' : ''}">{m.montant > 0 ? '+' : '−'}{fcfa(Math.abs(m.montant))} F</span></li>
    {:else}
      <li class="li"><span class="t13 mut">Rien pour l’instant : un billet payé pour un proche (ou par lui) apparaîtra ici.</span></li>
    {/each}
  </ul>

  <span class="lab">Mes voyages passés</span>
  <ul class="gl col" style="gap: 0; list-style: none" aria-label="Historique des voyages passés">
    {#each passes as b (b.id)}
      {@const v = trajet(b.departId)}
      <li class="li"><span class="bub" aria-hidden="true"><Icone nom="bus" taille={18} /></span><span class="col grow"><span class="t14 b7">{v.texte}</span><span class="t12 mut">{v.date} · {b.passager.nom}{b.siege ? ` · place ${b.siege}` : ''}</span></span><span class="mono t14 b7">{fcfa(b.prix)} F</span></li>
    {:else}
      <li class="li"><span class="t13 mut">Aucun voyage passé pour l’instant.</span></li>
    {/each}
  </ul>
  <a class="b p" href="/proche" use:nav>Payer pour un proche</a>
</Mobile>

{#if ajout}
  <div class="voile" role="presentation" onclick={() => (ajout = false)}></div>
  <div class="sheet feuille" role="dialog" aria-modal="true" aria-labelledby="t-ajout" tabindex="-1">
    <span class="grab"></span>
    <form class="col" style="gap: 12px" onsubmit={(e) => { e.preventDefault(); ajouter(); }}>
    <h2 class="ttl t18 c" id="t-ajout" style="margin: 0">Ajouter un proche</h2>
    <label class="fld"><span class="lab">Prénom et nom</span><span class="inp on"><input class="champ" type="text" autocomplete="off" placeholder="Maman, Tonton Sa’a…" bind:value={nom} /></span></label>
    <label class="fld"><span class="lab">Numéro</span><span class="inp"><span class="mono mut3">+237</span><input class="champ" type="tel" inputmode="tel" placeholder="6 77 10 22 33" value={tel} oninput={(e) => { tel = formaterSaisie(e.currentTarget.value); e.currentTarget.value = tel; }} /></span></label>
    <span class="t13 erc" role="alert">{erreur}</span>
    <button class="b p" type="submit">Ajouter</button>
    <button class="b s" type="button" onclick={() => { ajout = false; erreur = ''; }}>Annuler</button>
    </form>
  </div>
{/if}

<style>
  .gl { flex: none; }
  .row > .kp { flex: 1 1 0; min-width: 0; }
  .kp .v { font-size: 20px; }
  .li { position: relative; padding: 0; }
  .rowlink { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; padding: 12px 40px 12px 0; color: inherit; min-height: 56px; }
  .retire { position: absolute; right: -4px; top: 6px; width: 32px; height: 32px; border-radius: 10px; }
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 40; }
  .feuille { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); z-index: 41; margin: 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
  .champ { flex: 1; min-width: 0; background: transparent; border: 0; outline: 0; font: 500 16px 'Sora Variable', 'Sora', sans-serif; color: inherit; min-height: 48px; }
</style>
