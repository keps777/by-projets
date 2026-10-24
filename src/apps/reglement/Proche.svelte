<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { billetParId, personne, personneCourante } from '../../domain/actions.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { formaterTel, messageProche, telValide, type ModeProche } from '../../core/reglement.ts';
  import { etat, type Proche as ProcheT } from './etat.ts';
  import { envoyerDemande, infosMessage, lancerPaiement, montantBrouillon, partagerBillet, purgerBrouillonTermine, texteBilletPartage } from './actions.ts';

  /** Pour un proche : je paie son voyage, il paie le mien, ou je lui partage mon billet. Aperçu du message WhatsApp, puis règlement avec le moyen « proche ». */
  const e = etat(), moi = personneCourante();
  purgerBrouillonTermine();
  const billet = $derived((() => { const id = param('billet'); return id ? billetParId(id) : undefined; })());
  const partage = $derived(!!param('billet'));
  const b = $derived(e.brouillon?.nature === 'billet' && e.brouillon.departId ? e.brouillon : null);
  let mode = $state<'paie' | 'demande'>(e.brouillon?.qui === 'demande' ? 'demande' : 'paie');
  let choix = $state<string>(moi?.prochesIds?.[0] ?? 'nouveau'), nomNouveau = $state(''), telNouveau = $state(''), erreur = $state(''), envoye = $state('');
  const proches = $derived((moi?.prochesIds ?? []).flatMap((id) => { const p = personne(id); return p ? [p] : []; }));
  const nouveau = $derived(choix === 'nouveau');
  const destinataire = $derived<ProcheT | null>(nouveau ? { nom: nomNouveau.trim() || 'ton proche', tel: telNouveau } : (() => { const p = personne(choix); return p ? { id: p.id, nom: p.prenom, tel: p.tel } : null; })());
  const total = $derived(b ? montantBrouillon(b) : billet?.prix ?? 0);
  const m: ModeProche = $derived(partage ? 'partage' : mode);
  const apercu = $derived.by(() => {
    const nom = destinataire?.nom ?? 'ton proche';
    if (partage) return billet ? texteBilletPartage(billet, nom) : '';
    const i = b ? infosMessage(b) : null; return i ? messageProche(m, i, nom) : '';
  });
  const nomComplet = (p: ProcheT) => { const x = p.id ? personne(p.id) : undefined; return x ? `${x.prenom} ${x.nom}` : p.nom; };
  const cta = $derived(partage ? `Envoyer le billet à ${destinataire?.nom ?? 'ton proche'}` : mode === 'paie' ? `Payer ${fmtF(total)} pour ${destinataire?.nom ?? 'ton proche'}` : `Envoyer la demande à ${destinataire?.nom ?? 'ton proche'}`);
  const retour = $derived(partage && billet ? `/pass?billet=${billet.id}` : b?.departId ? `/siege?depart=${b.departId}` : '/');

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
    if (partage) {
      if (!billet) return; envoye = partagerBillet(billet.id, p, canal); montrer(`Billet envoyé à ${p.nom} (${canal === 'sms' ? 'SMS' : 'WhatsApp'} simulé)`); return;
    }
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

<Mobile titre="Pour un proche" sous={partage ? 'Partager mon billet' : mode === 'paie' ? 'Tu paies, il voyage' : 'Un proche paie ton billet'} retourVers={retour}>
  {#snippet droite()}<a class="pl ac" href="/moi/proches" onclick={(ev) => nav(ev, '/moi/proches')} style="text-decoration: none; min-height: 44px">historique</a>{/snippet}

  {#if partage ? !billet : !b}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="groupe" taille={56} /></span>
      <span class="ttl t20">{partage ? 'Billet introuvable' : 'Choisis d’abord une place'}</span>
      <span class="t14 mut" style="max-width: 30ch">{partage ? 'Ouvre un de tes billets pour le partager à un proche.' : 'Pour payer ou faire payer un voyage, il faut d’abord choisir ton départ et ta place.'}</span>
      <a class="b p" href={partage ? '/pass' : param('depart') ? `/siege?depart=${param('depart')}` : '/'} onclick={(ev) => nav(ev, partage ? '/pass' : param('depart') ? `/siege?depart=${param('depart')}` : '/')}>{partage ? 'Mes billets' : param('depart') ? 'Choisir ma place' : 'Voir les départs'}</a></div>
  {:else}
    {#if !partage}
      <div class="seg2" role="group" aria-label="Sens du paiement">
        <button type="button" class:on={mode === 'paie'} aria-pressed={mode === 'paie'} onclick={() => (mode = 'paie')}>Je paie pour</button>
        <button type="button" class:on={mode === 'demande'} aria-pressed={mode === 'demande'} onclick={() => (mode = 'demande')}>On paie pour moi</button>
      </div>
    {/if}
    <span class="lab" id="lab-qui">{partage ? 'À qui l’envoyer ?' : mode === 'paie' ? 'Qui voyage ?' : 'Qui paie ?'}</span>
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
    {#if !partage && b}
      <div class="gl" style="padding: 10px 14px"><span class="t13">{mode === 'paie' ? `Place${b.sieges.length > 1 ? 's' : ''} ${b.sieges.join(', ')} · ${destinataire?.nom} voyage, c’est toi qui règles ${fmtF(total)}.` : `Place${b.sieges.length > 1 ? 's' : ''} ${b.sieges.join(', ')} gardée${b.sieges.length > 1 ? 's' : ''} 10 min pour toi pendant que ${destinataire?.nom} règle ${fmtF(total)}.`}</span></div>
    {/if}

    <span class="lab">Aperçu WhatsApp</span>
    <div class="msg" aria-live="polite">{apercu}</div>
    {#if !partage && mode === 'paie'}<span class="t12 mut3">Le code du billet est ajouté au message dès que le paiement est confirmé.</span>{/if}
    {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    {#if envoye}<div class="toast" role="status"><span class="bub" style="color: #4ADE80"><Icone nom="ok" /></span><span class="t13 grow">Message envoyé à {destinataire?.nom}. Le billet reste à ton nom : seul le code est partagé.</span></div>{/if}

    {#if messages.length}
      <span class="lab">Derniers messages</span>
      <div class="gl col" style="gap: 0">{#each messages as x (x.ts + x.versNom)}<div class="li"><span class="bub aq"><Icone nom="info" /></span><span class="col grow"><span class="t14 b7">{x.versNom} · {x.canal === 'sms' ? 'SMS' : 'WhatsApp'}</span><span class="t12 mut ell">{x.texte}</span></span></div>{/each}</div>
    {/if}

    <div class="col g8" style="margin-top: auto">
      {#if envoye}
        <a class="b p" href={retour} onclick={(ev) => nav(ev, retour)}>Retour à mon billet</a>
      {:else}
        <button type="button" class="b p" onclick={() => envoyer('whatsapp')}>{cta}</button>
        {#if partage || mode === 'demande'}<button type="button" class="b s" onclick={() => envoyer('sms')}>Envoyer plutôt par SMS</button>
        {:else}<a class="b s" href="/ussd" onclick={(ev) => nav(ev, '/ussd')}>Il n’a pas l’app ? Voir le *123#</a>{/if}
      {/if}
    </div>
  {/if}
</Mobile>

<style>
  .ct { flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 60px; }
  .ct.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .ct:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .msg { padding: 12px 14px; border-radius: 18px 18px 18px 4px; background: rgba(37, 211, 102, 0.14); border: 1px solid rgba(37, 211, 102, 0.35); font-size: 14px; }
  .t15 { font-size: 15px; }
</style>
