// Branchement du coach de v1.15 : le domaine (src/domains/rehab/coach.ts) reçoit l'IA (services/ai/gemini) par injection.
// Couche « ui » = racine de composition pendant la migration ; remplacé par src/main.ts à l'intégration.
import { createCoachComments } from '../../domains/rehab/coach.ts';
import { aiCapped, askCoach } from '../../services/ai/gemini/index.ts';

const coach = createCoachComments({ ask: (kind, d, image) => askCoach(kind, d, image), capped: aiCapped });
export const coachComment = coach.coachComment;
export const coachReply = coach.coachReply;
