// Routes et navigation du volet « treatment » (drapeau 'gait') : #/plan/<patientId> et #/aides/<patientId>.
// Sans identifiant, le clinicien choisit un patient ; le patient voit son propre dossier.
import { registerNav, registerRoute } from '../registry.ts';
import { makeT } from '../i18n.ts';
import { STRINGS } from './strings.ts';

const t = makeT(STRINGS);

registerRoute({
  name: 'plan',
  flag: 'gait',
  render: async (ctx) => {
    const m = await import('./plan-view.ts');
    return m.renderPlan(ctx);
  },
});

registerRoute({
  name: 'aides',
  flag: 'gait',
  render: async (ctx) => {
    const m = await import('./devices-view.ts');
    return m.renderDevices(ctx);
  },
});

registerNav({
  id: 'treatment-plan',
  labelKey: 'nav_plan',
  label: () => t('nav_plan'),
  href: '#/plan',
  flag: 'gait',
  roles: ['clinician'],
  place: 'clinic',
  order: 30,
});

registerNav({
  id: 'treatment-aides',
  labelKey: 'nav_aides',
  label: () => t('nav_aides'),
  href: '#/aides',
  flag: 'gait',
  place: 'clinic',
  order: 31,
});
