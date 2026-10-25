<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Qr from '../../ui/Qr.svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { billetParId, billetsDe, compagnieDe, departEnMs, departParId, gare, heureLocale, ligneDe, personneCourante } from '../../domain/actions.ts';
  import { contenuQr, sceauValide } from '../../core/sceau.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { codeAffiche, frequencesCode } from '../../core/reglement.ts';

  /** Le billet reste affichable et vérifiable sans réseau : le sceau est recalculé sur ce téléphone, le code se tape ou s'écoute.
   *  Contenu partagé par la page `/pass/hors-ligne` et par la fenêtre « Sans réseau » de la page Billets. */
  let { billetId = null, onfermer, hors = $bindable(false) }: { billetId?: string | null; onfermer?: () => void; hors?: boolean } = $props();
  const moi = personneCourante();
  const utiles = $derived((moi ? billetsDe(moi.id) : []).filter((b) => b.statut === 'valide' || b.statut === 'scanne'));
  const choisi = $derived(utiles.find((b) => b.id === billetId) ?? (billetId ? billetParId(billetId) : undefined) ?? utiles.filter((b) => departParId(b.departId)?.statut !== 'arrive').sort((a, c) => departEnMs(departParId(a.departId)!) - departEnMs(departParId(c.departId)!))[0] ?? utiles[0]);
  const depart = $derived(choisi ? departParId(choisi.departId) : undefined);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const verifie = $derived(choisi ? sceauValide({ code: choisi.code, departId: choisi.departId, siege: choisi.siege, nom: choisi.passager.nom, sceau: choisi.sceau }) : false);

  let enLigne = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  let simule = $state(false), coupureLe = $state<number | null>(null), tic = $state(maintenant()), joue = $state(false);
  const horsReseau = $derived(!enLigne || simule || app.session.hors_ligne);
  $effect(() => { hors = horsReseau; });
  const minutes = $derived(coupureLe ? Math.max(1, Math.round((tic - coupureLe) / 60_000)) : 0);
  onMount(() => {
    const coupe = () => { enLigne = false; coupureLe = maintenant(); }, revient = () => { enLigne = true; coupureLe = null; };
    window.addEventListener('offline', coupe); window.addEventListener('online', revient);
    const t = setInterval(() => (tic = maintenant()), 15_000);
    return () => { window.removeEventListener('offline', coupe); window.removeEventListener('online', revient); clearInterval(t); };
  });
  function basculerSimulation() { simule = !simule; coupureLe = simule ? maintenant() : null; }

  /** Signal sonore : une note par caractère du code (600 à 1 800 Hz), lisible par le téléphone de l'agent sans réseau. */
  function jouer() {
    if (!choisi || joue) return; joue = true;
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC(); let t = ctx.currentTime + 0.05;
        for (const f of frequencesCode(choisi.code)) {
          const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
          o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.22); t += 0.25;
        }
        setTimeout(() => { ctx.close().catch(() => {}); }, 2400);
      }
    } catch { /* pas de son sur cet appareil : le code reste lisible */ }
    setTimeout(() => (joue = false), 2100);
  }
  const nav = (ev: Event, vers: string) => { ev.preventDefault(); aller(vers); };
</script>

  {#if !choisi || !depart || !ligne}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="billet" taille={56} /></span>
      <span class="ttl t20">Aucun billet à vérifier</span>
      <span class="t14 mut" style="max-width: 30ch">Réserve un départ : ton billet sera signé sur ton téléphone et restera valable sans internet.</span>
      <a class="b p" href="/" onclick={(ev) => nav(ev, '/')}>Chercher un départ</a></div>
  {:else}
    <div class="toast" role="status" data-testid="etat-reseau"><span class="bub" style="color: {horsReseau ? '#FFC24B' : '#7FEBFF'}"><Icone nom={horsReseau ? 'alerte' : 'info'} /></span>
      <span class="t13 grow">{#if horsReseau}{coupureLe ? `Aucune connexion depuis ${minutes} min. ` : 'Aucune connexion détectée. '}Ton billet reste valable : il est signé sur ton téléphone.{:else}Tu es en ligne, mais ce billet fonctionnerait aussi sans réseau : il est signé sur ton téléphone.{/if}</span></div>
    <div class="card">
      <div class="col"><span class="lab">{compagnieDe(depart).nom} · {ligne.classe} · {jourSemaineCourt(depart.jour)}</span><span class="ttl t24">{ligne.de} → {ligne.vers}</span><span class="t13 mut">{heureLocale(departEnMs(depart))} · {gare(ligne.gareDe)?.nom} · place {choisi.siege ?? 'libre'} · {choisi.passager.nom}</span></div>
      <div class="code" aria-label="Code du billet {codeAffiche(choisi.code)}">{codeAffiche(choisi.code)}</div>
      <div class="row g8" style="justify-content: center">
        {#if verifie}<span class="pl ok">sceau vérifié sur ce téléphone</span>{:else}<span class="pl er">sceau invalide</span>{/if}
      </div>
      <span class="t13 mut c">{verifie ? 'Billet signé, valable sans internet.' : 'Ce billet ne passerait pas au contrôle : contacte la compagnie.'} L’agent tape ce code, scanne le QR ou écoute le signal sonore : pas besoin de réseau des deux côtés.</span>
      <div class="qr"><Qr texte={contenuQr(choisi.code, choisi.sceau)} taille={132} fond="#F2F4FF" libelle="Code QR du billet {codeAffiche(choisi.code)}" /></div>
      <button class="b s" type="button" onclick={jouer} aria-pressed={joue}><span class="chirp" class:on={joue} aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>{joue ? 'Signal en cours · 2 s' : 'Jouer le signal sonore'}</button>
    </div>
    <span class="lab">Autres preuves</span>
    <a class="bn" href="/ussd" onclick={(ev) => nav(ev, '/ussd')}><span class="bub"><Icone nom="info" /></span><span class="col grow"><span class="t15 b7">SMS reçu à {heureLocale(choisi.creeLe)}</span><span class="t12 mut">« AfriMove · {codeAffiche(choisi.code)} · {choisi.siege ?? 'libre'} · {depart.heure} »</span></span></a>
    <a class="bn" href="/ussd" onclick={(ev) => nav(ev, '/ussd')}><span class="bub"><Icone nom="scan" /></span><span class="col grow"><span class="t15 b7">*123# · 3 · vérifier</span><span class="t12 mut">Fonctionne sur n’importe quel téléphone</span></span></a>
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b g" onclick={basculerSimulation}>{simule ? 'Rétablir le réseau (démo)' : 'Simuler une coupure de réseau (démo)'}</button>
      {#if onfermer}<button type="button" class="b p" onclick={onfermer}>Revenir au billet holographique</button>
      {:else}<a class="b p" href="/pass?billet={choisi.id}" onclick={(ev) => nav(ev, `/pass?billet=${choisi.id}`)}>Revenir au billet holographique</a>{/if}
    </div>
  {/if}

<style>
  .card { position: relative; border-radius: 28px; padding: 18px; display: flex; flex-direction: column; gap: 12px; background: linear-gradient(150deg, #141a33, #0a0e1c 60%, #1a1030); border: 1px dashed rgba(255, 194, 75, 0.6); }
  .code { font: 700 28px 'Geist Mono', monospace; letter-spacing: 0.08em; text-align: center; padding: 14px; border-radius: 18px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.14); }
  .qr { flex: none; align-self: center; width: 148px; height: 148px; border-radius: 16px; overflow: hidden; background: #f2f4ff; padding: 8px; }
  .qr :global(svg) { display: block; width: 100%; height: 100%; }
  .chirp { display: flex; align-items: center; justify-content: center; gap: 4px; height: 40px; }
  .chirp i { width: 5px; border-radius: 3px; background: #ffc24b; height: 10px; }
  .chirp.on i { animation: onde 1s infinite; } .chirp i:nth-child(2n) { animation-delay: 0.2s; }
  @keyframes onde { 50% { height: 36px; } }
  .t15 { font-size: 15px; }
  .card, .code { flex: none; }
</style>
