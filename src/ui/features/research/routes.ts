// Routes et navigation du volet « research » : constructeur de protocole (#/recherche), résultats et exports d'une étude
// (#/etude/<studyId>), suivi post-intervention (#/suivi/<patientId> ; patient : #/suivi = son propre dossier).
// Toutes derrière le drapeau 'gait' (outil d'évaluation clinique — non homologué Santé Canada).
import { registerNav, registerRoute } from '../registry.ts';
import { viewStudies, viewStudyEditor } from './builder.ts';
import { viewFollowUp } from './followup.ts';
import { patientReminder } from '../../../domains/research/index.ts';
import { render, state } from '../../app-state.ts';
import { db, t, today, uid } from './shared.ts';
import { viewStudy } from './study.ts';

registerRoute({
  name: 'recherche',
  flag: 'gait',
  roles: ['clinician'],
  render: ({ root, arg, arg2 }) =>
    arg === 'new'
      ? viewStudyEditor(root, 'new', arg2)
      : arg === 'edit'
        ? viewStudyEditor(root, 'edit', arg2)
        : viewStudies(root),
});

registerRoute({
  name: 'etude',
  flag: 'gait',
  roles: ['clinician'],
  render: ({ root, arg }) => viewStudy(root, arg),
});

registerRoute({
  name: 'suivi',
  flag: 'gait',
  roles: ['clinician', 'patient'],
  render: ({ root, arg }) => viewFollowUp(root, arg),
});

registerNav({
  id: 'research',
  labelKey: 'rs_navResearch',
  label: () => t('rs_navResearch'),
  href: '#/recherche',
  flag: 'gait',
  roles: ['clinician'],
  place: 'clinic',
  order: 40,
});

registerNav({
  id: 'research-followup-clinic',
  labelKey: 'rs_navFollowClin',
  label: () => t('rs_navFollowClin'),
  href: '#/suivi',
  flag: 'gait',
  roles: ['clinician'],
  place: 'clinic',
  order: 41,
});

// Rappel sur l'accueil du patient : libellé « N mesure(s) de suivi à faire » d'après `patientReminder` (calculé en
// arrière-plan, au plus une fois par minute ; l'accueil est redessiné si le nombre change pendant qu'il est affiché).
let due = 0;
let checkedAt = 0;
function refreshReminder(): void {
  if (Date.now() - checkedAt < 60_000 || !state.user) return;
  checkedAt = Date.now();
  void patientReminder(db(), uid(), today())
    .then((r) => {
      const n = r.due + r.overdue;
      if (n !== due) {
        due = n;
        if (/^#?\/?(home)?$/.test(location.hash)) render();
      }
    })
    .catch(() => undefined);
}
registerNav({
  id: 'research-followup',
  labelKey: 'rs_navFollow',
  label: () => {
    refreshReminder();
    return due > 0 ? t('rs_reminder', { n: due }) : t('rs_navFollow');
  },
  href: '#/suivi',
  flag: 'gait',
  roles: ['patient'],
  place: 'home',
  order: 40,
});
