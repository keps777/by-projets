<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { formaterTel, messageProche, telValide, type ModeProche } from '../../core/reglement.ts';
  import PartageContenu from './PartageContenu.svelte';
  import { etat, type Proche as ProcheT } from './etat.ts';
  import { envoyerDemande, infosMessage, lancerPaiement, montantBrouillon, purgerBrouillonTermine } from './actions.ts';

  /** Pour un proche : je paie son voyage, il paie le mien (aperçu du message WhatsApp, puis règlement avec le moyen « proche »), ou je lui partage mon billet (`?billet=`,
   *  même contenu que la fenêtre « Partager » de la page Billets : `PartageContenu`). */
  const e = etat(), moi = personneCourante();
  purgerBrouillonTermine();
  const billetPartage = $derived(param('billet'));
  const b = $derived(e.brouillon?.nature === 'billet' && e.brouillon.departId ? e.brouillon : null);
  let mode = $state<'paie' | 'demande'>(e.brouillon?.qui === 'demande' ? 'demande' : 'paie');
  let choix = $state<string>(moi?.prochesIds?.[0] ?? 'nouveau'), nomNouveau = $state(''), telNouveau = $state(''), erreur = $state('');
  const proches = $derived((moi?.prochesIds ?? []).flatMap((id) => { const p = personne(id); return p ? [p] : []; }));
  const nouveau = $derived(choix === 'nouveau');
  const destinataire = $derived<ProcheT | null>(nouveau ? { nom: nomNouveau.trim() || 'ton proche', tel: telNouveau } : (() => { const p = personne(choix); return p ? { id: p.id, nom: p.prenom, tel: p.tel } : null; })());
  const total = $derived(b ? montantBrouillon(b) : 0);
  const m: ModeProche = $derived(mode);
  const apercu = $derived.by(() => { const i = b ? infosMessage(b) : null; return i ? messageProche(m, i, destinataire?.nom ?? 'ton proche') : ''; });
  const nomComplet = (p: ProcheT) => { const x = p.id ? personne(p.id) : undefined; return x ? `${x.prenom} ${x.nom}` : p.nom; };
  const cta = $derived(mode === 'paie' ? `Payer ${fmtF(total)} pour ${destinataire?.nom ?? 'ton proche'}` : `Envoyer la demande à ${destinataire?.nom ?? 'ton proche'}`);
  const retour = $derived(b?.departId ? `/siege?depart=${b.departId}` : '/');

  function valider(): ProcheT | null {
    if (!destinataire) { erreur = 'Choisis un proche.'; return null; }
    if (nouveau) {
      if (nomNouveau.trim().length < 2) { erreur = 'Écris le prénom de ton proche.'; return null; }
      if (!telValide(telNouveau)) { erreur = 'Numéro camerounais à 9 chiffres, il commence par 6.'; return null; }
    }
    erreur = ''; return { ...destinataire, nom: nouveau ? nomNouveau.trim() : destinataire.nom };
  }
  function envoyer(canal: 'whatsapp' | 'sms' = 'whatsapp') {
    const p = valider(); if (!p || !moi) return;
    if (!b) return;
    try {
      if (mode === 'paie') {
        // la voyageuse règle avec son MoMo ; le voyageur de la première place est le proche
        b.qui = 'paie_pour'; b.proche = p; b.passagers[0] = { nom: nomComplet(p), tel: p.tel }; b.moyen = 'momo'; b.tel = moi.tel; b.refus = null;
        lancerPaiement(b, moi.id);
      } else {
        // le proche règle depuis son téléphone ; la voyageuse garde la place à son nom
        b.qui = 'demande'; b.proche = p; b.passagers[0] = { nom: `${moi.prenom} ${moi.nom}`, tel: moi.tel }; b.moyen = 'momo'; b.tel = p.tel; b.refus = null;
        lancerPaiement(b, p.id ?? moi.id); envoyerDemande(b, canal);
      }
      aller('/paiement/attente');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      erreur = code === 'siege_pris' || code === 'complet' ? 'Une des places vient d’être prise. Reviens choisir une autre place.' : 'Impossible de réserver pour le moment.';
    }
  }
  const nav = (ev: Event, v: string) => { ev.preventDefault(); aller(v); };
  const messages = $derived(e.partages.slice(0, 3));
</script>

{#if billetPartage}
<Mobile titre="Pour un proche" sous="Partager mon billet" retourVers="/pass?billet={billetPartage}">
  {#snippet droite()}<a class="pl ac" href="/moi/proches" onclick={(ev) => nav(ev, '/moi/proches')} style="text-decoration: none; min-height: 44px">historique</a>{/snippet}
  <PartageContenu billetId={billetPartage} />
</Mobile>
{:else}
<Mobile titre="Pour un proche" sous={mode === 'paie' ? 'Tu paies, il voyage' : 'Un proche paie ton billet'} retourVers={retour}>
  {#snippet droite()}<a class="pl ac" href="/moi/proches" onclick={(ev) => nav(ev, '/moi/proches')} style="text-decoration: none; min-height: 44px">historique</a>{/snippet}

  {#if !b}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="groupe" taille={56} /></span>
      <span class="ttl t20">Choisis d’abord une place</span>
      <span class="t14 mut" style="max-width: 30ch">Pour payer ou faire payer un voyage, il faut d’abord choisir ton départ et ta place.</span>
      <a class="b p" href={param('depart') ? `/siege?depart=${param('depart')}` : '/'} onclick={(ev) => nav(ev, param('depart') ? `/siege?depart=${param('depart')}` : '/')}>{param('depart') ? 'Choisir ma place' : 'Voir les départs'}</a></div>
  {:else}
    <div class="seg2" role="group" aria-label="Sens du paiement">
      <button type="button" class:on={mode === 'paie'} aria-pressed={mode === 'paie'} onclick={() => (mode = 'paie')}>Je paie pour</button>
      <button type="button" class:on={mode === 'demande'} aria-pressed={mode === 'demande'} onclick={() => (mode = 'demande')}>On paie pour moi</button>
    </div>
    <span class="lab" id="lab-qui">{mode === 'paie' ? 'Qui voyage ?' : 'Qui paie ?'}</span>
    <div class="col g8" role="radiogroup" aria-labelledby="lab-qui">
      {#each proches as p (p.id)}
        <button type="button" class="ct" class:on={choix === p.id} role="radio" aria-checked={choix === p.id} onclick={() => (choix = p.id)}>
          <span class="av" class:hot={p.id === 'p-maman'}>{p.prenom[0]}</span>
          <span class="col grow"><span class="t15 b7">{p.prenom}</span><span class="t12 mut">{formaterTel(p.tel)} · {p.ville ?? 'Cameroun'}</span></span>
          <span class="pl ok">WhatsApp</span>
        </button>
      {/each}
      <button type="button" class="ct" class:on={nouveau} role="radio" aria-checked={nouveau} onclick={() => (choix = 'nouveau')}>
        <span class="av">+</span><span class="col grow"><span class="t15 b7">Nouveau numéro</span><span class="t12 mut">tape un numéro camerounais</span></span>
      </button>
    </div>
    {#if nouveau}
      <div class="gl col g8">
        <div class="fld"><label class="t13 mut" for="pr-nom">Prénom</label><input id="pr-nom" class="inp" autocomplete="off" bind:value={nomNouveau} placeholder="Ex. Tonton Sa’a" /></div>
        <div class="fld"><label class="t13 mut" for="pr-tel">Téléphone</label><input id="pr-tel" class="inp" inputmode="tel" autocomplete="off" bind:value={telNouveau} placeholder="6 55 32 98 10" /></div>
      </div>
    {/if}
    {#if b}
      <div class="gl" style="padding: 10px 14px"><span class="t13">{mode === 'paie' ? `Place${b.sieges.length > 1 ? 's' : ''} ${b.sieges.join(', ')} · ${destinataire?.nom} voyage, c’est toi qui règles ${fmtF(total)}.` : `Place${b.sieges.length > 1 ? 's' : ''} ${b.sieges.join(', ')} gardée${b.sieges.length > 1 ? 's' : ''} 10 min pour toi pendant que ${destinataire?.nom} règle ${fmtF(total)}.`}</span></div>
    {/if}

    <span class="lab">Aperçu WhatsApp</span>
    <div class="msg" aria-live="polite">{apercu}</div>
    {#if mode === 'paie'}<span class="t12 mut3">Le code du billet est ajouté au message dès que le paiement est confirmé.</span>{/if}
    {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}

    {#if messages.length}
      <span class="lab">Derniers messages</span>
      <div class="gl col" style="gap: 0">{#each messages as x (x.ts + x.versNom)}<div class="li"><span class="bub aq"><Icone nom="info" /></span><span class="col grow"><span class="t14 b7">{x.versNom} · {x.canal === 'sms' ? 'SMS' : 'WhatsApp'}</span><span class="t12 mut ell">{x.texte}</span></span></div>{/each}</div>
    {/if}

    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b p" onclick={() => envoyer('whatsapp')}>{cta}</button>
      {#if mode === 'demande'}<button type="button" class="b s" onclick={() => envoyer('sms')}>Envoyer plutôt par SMS</button>
      {:else}<a class="b s" href="/ussd" onclick={(ev) => nav(ev, '/ussd')}>Il n’a pas l’app ? Voir le *123#</a>{/if}
    </div>
  {/if}
</Mobile>
{/if}

<style>
  .ct { flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 60px; }
  .ct.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .ct:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .msg { padding: 12px 14px; border-radius: 18px 18px 18px 4px; background: rgba(37, 211, 102, 0.14); border: 1px solid rgba(37, 211, 102, 0.35); font-size: 14px; }
  .t15 { font-size: 15px; }
</style>
