/** Actions de navigation transmises par le tableau aux panneaux. */
export interface Nav { ouvrirFiche: (id: string) => void; importer: () => void; inviter: () => void; allerVue: (v: string) => void; voirAttestation: (id: string) => void }
