<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { billetParId, compagnieDe, departParId, ligneDe, personne, personneCourante } from '../../domain/actions.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { lienSms, lienWhatsApp, messagePartage } from '../../core/partage.ts';
  import { codeAffiche, formaterTel, telValide } from '../../core/reglement.ts';
  import { etat, type Proche } from './etat.ts';
  import { partagerBillet } from './actions.ts';

  /** Partager un billet à un proche : lien WhatsApp ou SMS prérempli, partage du téléphone (`navigator.share`) ou copie du message.
   *  Le billet reste au nom de son passager : seul le code est envoyé. Contenu de la fenêtre « Partager » (et du lien profond `/proche?billet=`). */
  let { billetId, onfermer }: { billetId: string; onfermer?: () => void } = $props();
  const e = etat(), moi = personneCourante();
  const billet = $derived(billetParId(billetId));
  const depart = $derived(billet ? departParId(billet.departId) : undefined);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const proches = $derived((moi?.prochesIds ?? []).flatMap((id) => { const p = personne(id); return p ? [p] : []; }));
  let choix = $state<string>(moi?.prochesIds?.[0] ?? 'nouveau'), nomNouveau = $state(''), telNouveau = $state(''), erreur = $state(''), envoye = $state<'whatsapp' | 'sms' | 'partage' | 'copie' | ''>('');
  const nouveau = $derived(choix === 'nouveau');
  const destinataire = $derived<Proche | null>(nouveau ? { nom: nomNouveau.trim() || 'ton proche', tel: telNouveau } : (() => { const p = personne(choix); return p ? { id: p.id, nom: p.prenom, tel: p.tel } : null; })());
  const peutPartager = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const texte = $derived(!billet || !depart || !ligne || !moi ? '' : messagePartage({
    de: moi.prenom, passager: billet.passager.nom.split(' ')[0], pourMoi: billet.passager.tel === moi.tel, trajet: `${ligne.de} → ${ligne.vers}`, quand: `${compagnieDe(depart).nom} ${jourSemaineCourt(depart.jour)} ${depart.heure}`,
    place: billet.siege ? `place ${billet.siege}` : 'place libre', code: codeAffiche(billet.code), destinataire: destinataire?.nom ?? 'ton proche'
  }));
  const lienWa = $derived(destinataire && telValide(destinataire.tel) ? lienWhatsApp(destinataire.tel, texte) : '#');
  const lienSmsHref = $derived(destinataire && telValide(destinataire.tel) ? lienSms(destinataire.tel, texte) : '#');

  /** Vérifie le destinataire ; à défaut, explique pourquoi le lien ne s'ouvre pas. */
  function valide(): Proche | null {
    if (!destinataire) { erreur = 'Choisis un proche.'; return null; }
    if (nouveau && nomNouveau.trim().length < 2) { erreur = 'Écris le prénom de ton proche.'; return null; }
    if (!telValide(destinataire.tel)) { erreur = 'Numéro camerounais à 9 chiffres, il commence par 6.'; return null; }
    erreur = ''; return { ...destinataire, nom: nouveau ? nomNouveau.trim() : destinataire.nom };
  }
  function lien(ev: MouseEvent, canal: 'whatsapp' | 'sms') {
    const p = valide(); if (!p || !billet) { ev.preventDefault(); return; }
    partagerBillet(billet.id, p, canal, texte); envoye = canal; montrer(`Message prêt pour ${p.nom} (${canal === 'sms' ? 'SMS' : 'WhatsApp'})`);
  }
  async function partager() {
    try { await navigator.share({ title: 'Mon billet AfriMove', text: texte }); envoye = 'partage'; } catch { /* partage annulé */ }
  }
  async function copier() {
    try { await navigator.clipboard.writeText(texte); } catch {
      const t = document.createElement('textarea'); t.value = texte; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select();
      try { document.execCommand('copy'); } catch { /* copie impossible : le message reste affiché */ } t.remove();
    }
    envoye = 'copie'; montrer('Message copié');
  }
  const nav = (ev: Event, v: string) => { ev.preventDefault(); aller(v); };
  const messages = $derived(e.partages.filter((x) => x.billetId === billetId).slice(0, 3));
</script>

{#if !billet || !depart || !ligne}
  <div class="center"><span class="ill" aria-hidden="true"><Icone nom="groupe" taille={56} /></span>
    <span class="ttl t20">Billet introuvable</span>
    <span class="t14 mut" style="max-width: 30ch">Ouvre un de tes billets pour le partager à un proche.</span>
    {#if onfermer}<button type="button" class="b p" onclick={onfermer}>Fermer</button>{:else}<a class="b p" href="/pass" onclick={(ev) => nav(ev, '/pass')}>Mes billets</a>{/if}</div>
{:else}
  <div class="gl row g12"><span class="bub aq" aria-hidden="true"><Icone nom="billet" /></span>
    <span class="col grow"><span class="t14 b7">{ligne.de} → {ligne.vers} · {billet.passager.nom.split(' ')[0]}</span><span class="t12 mut">{jourSemaineCourt(depart.jour)} · {depart.heure} · {billet.siege ? `place ${billet.siege}` : 'place libre'} · {codeAffiche(billet.code)}</span></span></div>

  <span class="lab" id="lab-qui">À qui l’envoyer ?</span>
  <div class="col g8" role="radiogroup" aria-labelledby="lab-qui">
    {#each proches as p (p.id)}
      <button type="button" class="ct" class:on={choix === p.id} role="radio" aria-checked={choix === p.id} onclick={() => { choix = p.id; erreur = ''; }}>
        <span class="av" class:hot={p.id === 'p-maman'}>{p.prenom[0]}</span>
        <span class="col grow"><span class="t15 b7">{p.prenom}</span><span class="t12 mut">{formaterTel(p.tel)} · {p.ville ?? 'Cameroun'}</span></span>
        <span class="pl ok">WhatsApp</span>
      </button>
    {/each}
    <button type="button" class="ct" class:on={nouveau} role="radio" aria-checked={nouveau} onclick={() => { choix = 'nouveau'; erreur = ''; }}>
      <span class="av">+</span><span class="col grow"><span class="t15 b7">Nouveau numéro</span><span class="t12 mut">tape un numéro camerounais</span></span>
    </button>
  </div>
  {#if nouveau}
    <div class="gl col g8">
      <div class="fld"><label class="t13 mut" for="pt-nom">Prénom</label><input id="pt-nom" class="inp" autocomplete="off" bind:value={nomNouveau} placeholder="Ex. Tonton Sa’a" /></div>
      <div class="fld"><label class="t13 mut" for="pt-tel">Téléphone</label><input id="pt-tel" class="inp" inputmode="tel" autocomplete="off" bind:value={telNouveau} placeholder="6 55 32 98 10" /></div>
    </div>
  {/if}

  <span class="lab">Aperçu du message</span>
  <div class="msg" aria-live="polite" data-testid="apercu-partage">{texte}</div>
  {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
  {#if envoye}<div class="toast" role="status"><span class="bub" style="color: #4ADE80"><Icone nom="ok" /></span><span class="t13 grow">{envoye === 'copie' ? 'Message copié : colle-le dans la conversation de ton choix.' : `Message prêt pour ${destinataire?.nom}.`} Le billet reste à ton nom : seul le code est partagé.</span></div>{/if}

  {#if messages.length}
    <span class="lab">Derniers messages</span>
    <div class="gl col" style="gap: 0">{#each messages as x (x.ts + x.versNom)}<div class="li"><span class="bub aq"><Icone nom="info" /></span><span class="col grow"><span class="t14 b7">{x.versNom} · {x.canal === 'sms' ? 'SMS' : 'WhatsApp'}</span><span class="t12 mut ell">{x.texte}</span></span></div>{/each}</div>
  {/if}

  <div class="col g8" style="margin-top: auto">
    <a class="b p" href={lienWa} target="_blank" rel="noopener noreferrer" onclick={(ev) => lien(ev, 'whatsapp')}>Envoyer sur WhatsApp</a>
    <div class="row g8">
      <a class="b s grow" href={lienSmsHref} onclick={(ev) => lien(ev, 'sms')}>Par SMS</a>
      {#if peutPartager}<button type="button" class="b s grow" onclick={partager}>Partager…</button>{/if}
      <button type="button" class="b s grow" onclick={copier}>Copier le message</button>
    </div>
    {#if onfermer}<button type="button" class="b g" onclick={onfermer}>{envoye ? 'Retour à mon billet' : 'Pas maintenant'}</button>{/if}
  </div>
{/if}

<style>
  .ct { flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 60px; }
  .ct.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .ct:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .msg { flex: none; padding: 12px 14px; border-radius: 18px 18px 18px 4px; background: rgba(37, 211, 102, 0.14); border: 1px solid rgba(37, 211, 102, 0.35); font-size: 14px; }
  .t15 { font-size: 15px; }
</style>
