/**
 * Règles d'architecture (docs/architecture.md, docs/adr/0002-ports-adaptateurs.md). Vérifiées par `npm run lint:deps`.
 * Portée : le NOUVEAU code (src/). Le code legacy (www/js) n'est pas soumis aux règles de couches pendant la migration ;
 * ses cycles existants sont listés dans docs/MIGRATION.md et doivent disparaître à la migration de chaque fichier.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Aucune dépendance circulaire dans src/ (spec §3).',
      from: { path: '^src/' },
      to: { circular: true },
    },
    {
      name: 'domains-not-ui',
      severity: 'error',
      comment: "Un domaine n'importe jamais l'interface.",
      from: { path: '^src/domains/' },
      to: { path: '^src/ui/' },
    },
    {
      name: 'domains-not-platform',
      severity: 'error',
      comment:
        "Les domaines dépendent de core, vision et des ports de services ; l'appareil passe par des ports injectés.",
      from: { path: '^src/domains/' },
      to: { path: '^src/platform/' },
    },
    {
      name: 'domains-only-service-ports',
      severity: 'error',
      comment: 'Les domaines importent les ports (services/<x>/port.ts, services/index.ts), jamais un adaptateur.',
      from: { path: '^src/domains/' },
      to: { path: '^src/services/[^/]+/(?!port\\.ts$)' },
    },
    {
      name: 'domains-internal-private',
      severity: 'error',
      comment:
        "API publique d'un domaine = ses fichiers hors de internal/. Un autre domaine (ou l'interface) n'importe jamais domains/<x>/internal/.",
      from: { path: '^src/(domains/([^/]+)|ui|vision|services|platform|core)/' },
      to: { path: '^src/domains/([^/]+)/internal/', pathNot: '^src/domains/$2/internal/' },
    },
    {
      name: 'core-is-pure',
      severity: 'error',
      comment: "core n'importe aucune autre couche ni bibliothèque d'exécution.",
      from: { path: '^src/core/', pathNot: '\\.test\\.ts$' },
      to: { path: ['^src/(platform|services|vision|domains|ui)/', '^www/', 'node_modules'] },
    },
    {
      name: 'lower-layers-not-up',
      severity: 'error',
      comment: 'platform, services et vision ne dépendent ni des domaines ni de l’interface.',
      from: { path: '^src/(platform|services|vision)/' },
      to: { path: '^src/(domains|ui)/' },
    },
    {
      name: 'firebase-only-in-adapters',
      severity: 'error',
      comment: 'Firebase uniquement dans src/services/*/firebase/ (remplaçable). Inclut la copie vendor/firebase.js.',
      from: { path: '^src/', pathNot: '^src/services/[^/]+/firebase/' },
      to: { path: ['node_modules/(firebase|@firebase)/', '^www/vendor/firebase'] },
    },
    {
      name: 'capacitor-only-in-platform',
      severity: 'error',
      comment: 'Capacitor (appareil) uniquement dans src/platform/.',
      from: { path: '^src/', pathNot: '^src/platform/' },
      to: { path: ['node_modules/@capacitor(-community)?/', '^www/vendor/capacitor'] },
    },
    {
      name: 'new-code-not-legacy',
      severity: 'warn',
      comment:
        'Le nouveau code ne devrait pas importer www/js (legacy) : migrer la dépendance d’abord (docs/MIGRATION.md).',
      from: { path: '^src/' },
      to: { path: '^www/js/' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: { path: '^src/' },
      to: { couldNotResolve: true },
    },
    {
      name: 'no-test-imports-in-prod',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.test\\.ts$' },
      to: { path: '\\.test\\.ts$' },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules', '^www/vendor/'] },
    exclude: { path: ['^dist/', '^android/', '^docs/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.mjs'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
