import { useEffect, useId, useRef, useState } from 'react';
import { flushPendingEdits } from '../../hooks/useExitSave';
import { useLibraryMode } from '../../lib/library-mode';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import { Dialog } from '../Dialog';
import { Icon } from '../Icon';

export function RemoveRankingDialog({
  record,
  state,
  busy,
  onAction,
  onClose,
}: {
  record: LibraryRecord;
  state: PersonalLibraryState;
  busy: boolean;
  onAction: (action: PersonalAction) => Promise<boolean>;
  onClose: () => void;
}) {
  const { scope } = useLibraryMode();
  const reviewedScope = useRef(scope);
  const current = useRef({ scope, state, busy, onClose });
  current.current = { scope, state, busy, onClose };
  const active = useRef(true);
  const submitting = useRef<'checking' | 'removing' | null>(null);
  const [stage, setStage] = useState<'checking' | 'removing' | null>(null);
  const [error, setError] = useState('');
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    active.current = true;
    const invalidate = () => {
      active.current = false;
      current.current.onClose();
    };
    window.addEventListener('popstate', invalidate);
    window.addEventListener('play100:navigate', invalidate);
    return () => {
      active.current = false;
      window.removeEventListener('popstate', invalidate);
      window.removeEventListener('play100:navigate', invalidate);
    };
  }, []);

  const ownsReview = () => active.current && current.current.scope === reviewedScope.current;
  const targetExists = () =>
    current.current.state.records[record.id]?.title === record.title &&
    current.current.state.ranking.some((entry) => entry.id === record.id);
  const close = () => {
    if (submitting.current === 'removing') return;
    active.current = false;
    onClose();
  };
  const submit = async () => {
    if (submitting.current || current.current.busy || !ownsReview()) return;
    submitting.current = 'checking';
    setStage('checking');
    setError('');
    try {
      // Retained tab/detail editors must settle before deletion can unmount them.
      const saved = await flushPendingEdits();
      if (!ownsReview()) return;
      if (!targetExists()) {
        setError('This ranking is no longer available. Close this dialog and review your current ranking.');
        return;
      }
      if (!saved) {
        setError(
          'Your edit has not saved. Keep this ranking, then correct the highlighted field or retry the edit before removing it.',
        );
        return;
      }
      submitting.current = 'removing';
      setStage('removing');
      const success = await onAction({ type: 'remove-ranking', ids: [record.id] });
      if (!ownsReview()) return;
      if (success) {
        active.current = false;
        onClose();
      } else {
        setError('This ranking was not removed. Check the storage warning and try again, or keep it.');
      }
    } catch (cause) {
      console.error('The ranking removal could not finish.', cause);
      if (ownsReview())
        setError('This ranking could not be removed. Keep it and retry after checking the storage warning.');
    } finally {
      submitting.current = null;
      if (ownsReview()) setStage(null);
    }
  };

  return (
    <Dialog
      open
      titleId={titleId}
      descriptionId={descriptionId}
      className="info-dialog ranking-removal-dialog"
      onClose={close}
    >
      <h2 id={titleId}>Remove {record.title} from ranking?</h2>
      <p id={descriptionId}>
        This removes its rating, note and ranking position. The game stays in your Library. Played, Completed and Queue
        stay unchanged.
      </p>
      <p className="removal-warning">
        This cannot be undone. To keep a copy, choose Keep ranking and export a backup from Settings first.
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="button button-outline" data-autofocus disabled={stage === 'removing'} onClick={close}>
          Keep ranking
        </button>
        <button
          className="button button-danger"
          disabled={busy || stage !== null}
          onClick={() => {
            void submit();
          }}
        >
          <Icon name="trash" width="18" height="18" />
          {stage === 'checking' ? 'Checking edits…' : stage === 'removing' ? 'Removing…' : 'Remove from ranking'}
        </button>
      </div>
    </Dialog>
  );
}
