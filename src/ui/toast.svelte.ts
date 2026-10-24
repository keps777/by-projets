export const toast = $state({ message: '', ton: 'ok' as 'ok' | 'er' | 'wa' });
let t: ReturnType<typeof setTimeout> | undefined;
export function montrer(message: string, ton: 'ok' | 'er' | 'wa' = 'ok') { toast.message = message; toast.ton = ton; clearTimeout(t); t = setTimeout(() => (toast.message = ''), 2600); }
