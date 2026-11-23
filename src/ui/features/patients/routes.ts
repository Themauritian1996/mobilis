// Routes et navigation du volet « dossier patient » (drapeau `gait`).
//   #/patients            liste des dossiers du clinicien
//   #/patient/<id>        fiche (clinicien) ; pour un patient : « Mon dossier »
//   #/dossier             « Mon dossier » du patient connecté
// Effet d'import : installe la base persistante des dossiers (locale + Firestore) pour tous les volets.
import { installRecordsDb } from '../../../services/db/records-install.ts';
import { registerNav, registerRoute } from '../registry.ts';
import { tp } from './strings.ts';
import { viewMyRecord, viewPatientList, viewPatientRecord } from './views.ts';

installRecordsDb();

registerRoute({ name: 'patients', flag: 'gait', roles: ['clinician'], render: (ctx) => viewPatientList(ctx) });
registerRoute({ name: 'patient', flag: 'gait', render: (ctx) => viewPatientRecord(ctx) });
registerRoute({ name: 'dossier', flag: 'gait', roles: ['patient'], render: (ctx) => viewMyRecord(ctx) });

registerNav({
  id: 'patients',
  labelKey: 'patients.navPatients',
  label: () => tp('navPatients'),
  href: '#/patients',
  flag: 'gait',
  roles: ['clinician'],
  place: 'clinic',
  order: 10,
});
registerNav({
  id: 'patients',
  labelKey: 'patients.navPatients',
  label: () => tp('navPatients'),
  href: '#/patients',
  flag: 'gait',
  roles: ['clinician'],
  place: 'profile',
  order: 10,
});
for (const place of ['home', 'profile'] as const)
  registerNav({
    id: 'my-record',
    labelKey: 'patients.navMine',
    label: () => tp('navMine'),
    href: '#/dossier',
    flag: 'gait',
    roles: ['patient'],
    place,
    order: 10,
  });

export { mountAnnotations } from './annotations-ui.ts';
export { ensureSelfPatient } from '../../../domains/clinic/patients.ts';
