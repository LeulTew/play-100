import type { PersonalAction } from './personal-types';

/** The notice a successful library change announces. */
export function actionMessage(action: PersonalAction): string {
  switch (action.type) {
    case 'add-records':
      return `${action.records.length} ${action.records.length === 1 ? 'game' : 'games'} added to your library.`;
    case 'remove-records':
      return 'Selected games removed from your private library. The original 100 is unchanged.';
    case 'add-ranking':
      return 'Your ranking has been updated. Games are not automatically marked played.';
    case 'remove-ranking':
      return 'Removed from your personal ranking.';
    case 'move-item':
      return `Your ${action.list === 'queue' ? 'play order' : 'ranking order'} is saved.`;
    case 'edit-ranking':
      return 'Your opinion is saved.';
    case 'rate-game':
      return 'Your rating is saved. This game is in your private library.';
    case 'use-rating-order':
      return action.id
        ? 'This game now follows rating order.'
        : 'Automatic rating order restored. Manual positions have been cleared.';
    case 'set-motion':
      return 'Visual preference saved.';
    case 'set-progress':
      return `${action.records.length} ${action.records.length === 1 ? 'game' : 'games'} updated in your ${action.key === 'later' ? 'play queue' : 'play history'}.`;
    default:
      return 'Your library is updated.';
  }
}
