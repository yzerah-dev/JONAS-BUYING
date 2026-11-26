/** Types de fiches qualité : valeur enregistrée (française, lue par JONAS) et libellé traduit */
export const QUALITY: { value: string; key: 'pd.q.msds' | 'pd.q.compo' | 'pd.q.cert' | 'pd.q.test' | 'pd.q.tech' | 'pd.q.other' }[] = [
  { value: 'MSDS (fiche de sécurité)', key: 'pd.q.msds' },
  { value: 'Fiche composition', key: 'pd.q.compo' },
  { value: 'Certificat de conformité', key: 'pd.q.cert' },
  { value: 'Rapport de test', key: 'pd.q.test' },
  { value: 'Fiche technique', key: 'pd.q.tech' },
  { value: 'Autre', key: 'pd.q.other' },
];
