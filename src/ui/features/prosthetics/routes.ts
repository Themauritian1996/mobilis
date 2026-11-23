// Routes et navigation du volet « prosthetics » : vue réservée au clinicien et au prothésiste (drapeau `gait`).
// #/prothese/<patientId> · #/prothese-res/<assessmentId> · #/prothese-liste/<assessmentId>
import { registerNav, registerRoute } from '../registry.ts';
import { viewProsthesisPatient } from './patient-view.ts';
import { viewProsthesisChecklist, viewProsthesisReport } from './report-view.ts';

const gate = { flag: 'gait', roles: ['clinician'] } as const;

registerRoute({ name: 'prothese', ...gate, render: (ctx) => viewProsthesisPatient(ctx) });
registerRoute({ name: 'prothese-res', ...gate, render: (ctx) => viewProsthesisReport(ctx) });
registerRoute({ name: 'prothese-liste', ...gate, render: (ctx) => viewProsthesisChecklist(ctx) });

// Le point d'entrée habituel est le dossier patient (lien vers #/prothese/<patientId>) ; l'entrée de navigation
// ouvre la liste des patients pour en choisir un. `labelKey` : clé « prosthetics.nav » (textes dans strings.ts).
registerNav({
  id: 'prosthetics',
  labelKey: 'prosthetics.nav',
  href: '#/patients',
  ...gate,
  place: 'clinic',
  order: 40,
});
