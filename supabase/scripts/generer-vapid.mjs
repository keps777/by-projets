#!/usr/bin/env node
// Génère une paire de clés VAPID (courbe P-256) pour le Web Push, au format attendu par web-push et par l'app
// (base64url : clé publique = point non compressé de 65 octets, clé privée = scalaire de 32 octets).
// Usage : node supabase/scripts/generer-vapid.mjs
// La clé PRIVÉE ne doit jamais être écrite dans le dépôt ni collée dans un chat : seulement dans les secrets Supabase.
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const octets = (b64url) => Buffer.from(b64url, 'base64url');
const publique = Buffer.concat([Buffer.from([0x04]), octets(pub.x), octets(pub.y)]).toString('base64url');
const privee = octets(priv.d).toString('base64url');

console.log('VAPID_PUBLIC_KEY=' + publique);
console.log('VAPID_PRIVATE_KEY=' + privee);
console.log('\nLa clé publique va aussi dans l’app (variable publique Vercel). La clé privée : secrets Supabase uniquement.');
