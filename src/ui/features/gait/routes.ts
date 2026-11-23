// Routes et navigation du volet « gait » (capture, résultats, comparaison A/B). Drapeau `gait` ; la capture est
// réservée au clinicien ; un patient connecté peut consulter ses résultats et comparaisons (lecture).
// #/marche/<patientId>[/<évaluationDeRéférence>] · #/marche-res/<assessmentId> · #/marche-ab/<idA>/<idB>
import { registerNav, registerRoute } from '../registry.ts';
import { renderCapture } from './capture.ts';
import { renderCompare } from './compare.ts';
import { renderResults } from './results.ts';
import { t } from './ui.ts';

registerRoute({ name: 'marche', flag: 'gait', roles: ['clinician'], render: (ctx) => renderCapture(ctx) });
registerRoute({ name: 'marche-res', flag: 'gait', roles: ['clinician', 'patient'], render: (ctx) => renderResults(ctx) });
registerRoute({ name: 'marche-ab', flag: 'gait', roles: ['clinician', 'patient'], render: (ctx) => renderCompare(ctx) });

// L'entrée ouvre la liste des patients : la capture se lance depuis le dossier d'un patient (#/marche/<patientId>).
registerNav({
  id: 'gait',
  labelKey: 'gait.nav',
  label: () => t('nav_gait'),
  href: '#/patients',
  flag: 'gait',
  roles: ['clinician'],
  place: 'clinic',
  order: 30,
});
