export const toast = $state({ message: '', ton: 'bon' as 'bon' | 'danger' });
let t: ReturnType<typeof setTimeout> | undefined;
export function montrer(message: string, ton: 'bon' | 'danger' = 'bon') { toast.message = message; toast.ton = ton; clearTimeout(t); t = setTimeout(() => (toast.message = ''), 2400); }
