class Toasts {
  message = $state('');
  #t: ReturnType<typeof setTimeout> | null = null;
  dire(m: string, ms = 2800): void {
    this.message = m;
    if (this.#t) clearTimeout(this.#t);
    this.#t = setTimeout(() => { this.message = ''; }, ms);
  }
}
export const toasts = new Toasts();
export const dire = (m: string) => toasts.dire(m);
