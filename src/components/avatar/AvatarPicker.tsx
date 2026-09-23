import { useEffect, useId, useRef, useState } from 'react';
import {
  AVATAR_PALETTES, createAvatarCandidates, createAvatarDescriptor, isAvatarPalette, parseAvatarDescriptor,
} from '../../lib/avatar';
import type { AvatarDescriptor, AvatarPalette } from '../../lib/avatar';
import { Icon } from '../Icon';
import { Avatar } from './Avatar';
import './avatar.css';

export interface AvatarPickerProps {
  value: AvatarDescriptor;
  identityKey: string;
  onSave: (next: AvatarDescriptor) => Promise<void>;
  onCancel: () => void;
  /** Connects the existing Dialog's titleId to this panel's heading. */
  titleId?: string;
}

interface Draft {
  selected: AvatarDescriptor;
  candidates: AvatarDescriptor[];
}

function initialDraft(value: AvatarDescriptor): { draft: Draft; error: string } {
  const selected = parseAvatarDescriptor(value);
  try {
    return { draft: { selected, candidates: createAvatarCandidates(selected) }, error: '' };
  } catch (error) {
    return {
      draft: { selected, candidates: [selected] },
      error: `Could not generate new faces. ${error instanceof Error ? error.message : 'Try Shuffle again.'} Your current avatar is still available.`,
    };
  }
}

function AvatarPickerDraft({ value, onSave, onCancel, titleId }: AvatarPickerProps) {
  const id = useId();
  const [initial] = useState(() => initialDraft(value));
  const [draft, setDraft] = useState(initial.draft);
  const [generationError, setGenerationError] = useState(initial.error);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'editing' | 'saving' | 'saved'>('editing');
  const active = useRef(false);
  const submitting = useRef(false);
  const pending = status === 'saving';

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function edit(next: Draft) {
    if (submitting.current || !active.current) return;
    setDraft(next);
    setError('');
    if (next.candidates.length === 6) setGenerationError('');
    setStatus('editing');
  }

  function changePalette(palette: AvatarPalette) {
    edit({
      selected: { ...draft.selected, palette },
      candidates: draft.candidates.map((candidate) => ({ ...candidate, palette })),
    });
  }

  function shuffle() {
    if (submitting.current || !active.current) return;
    try {
      const selected = createAvatarDescriptor(draft.selected.palette);
      edit({ selected, candidates: createAvatarCandidates(selected) });
    } catch (error) {
      setGenerationError(`Could not shuffle avatars. ${error instanceof Error ? error.message : 'Try again.'} Your choice is unchanged.`);
    }
  }

  async function save() {
    if (submitting.current || !active.current || status === 'saved') return;
    submitting.current = true;
    setStatus('saving');
    setError('');
    try {
      await onSave(parseAvatarDescriptor(draft.selected));
      if (active.current) setStatus('saved');
    } catch (error) {
      if (active.current) {
        setError(`Could not save avatar. ${error instanceof Error ? error.message : 'Please try again.'} Your choice is still here. Try saving again.`);
        setStatus('editing');
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <section className="avatar-picker" aria-labelledby={titleId ?? `${id}-title`} aria-busy={pending}>
      <h2 className="avatar-picker__title" id={titleId ?? `${id}-title`}>Pick your avatar.</h2>
      <p className="avatar-picker__intro">Choose a face and a color. Nothing changes until you save.</p>
      <div className="avatar-picker__choice-heading">
        <h3 id={`${id}-faces`}>Choose a face</h3>
        <button type="button" className="button button-quiet avatar-picker__shuffle" disabled={pending} onClick={shuffle}>
          <Icon name="shuffle" width="18" height="18" />Shuffle
        </button>
      </div>
      <div className="avatar-picker__grid" role="radiogroup" aria-labelledby={`${id}-faces`}>
        {draft.candidates.map((candidate, index) => {
          const selected = candidate.seed === draft.selected.seed;
          return (
            <label className={`avatar-picker__candidate ${selected ? 'is-selected' : ''}`} key={candidate.seed}>
              <input
                type="radio" name={`${id}-face`} value={candidate.seed} checked={selected}
                aria-label={`Avatar option ${index + 1}`} disabled={pending}
                onChange={() => edit({ ...draft, selected: candidate })}
              />
              <Avatar descriptor={candidate} size={96} className="avatar-picker__preview" />
              <span className="avatar-picker__choice-label" aria-hidden="true">
                {selected && <Icon name="check" width="14" height="14" />}{selected ? 'Selected' : `Option ${index + 1}`}
              </span>
            </label>
          );
        })}
      </div>
      <h3 className="avatar-picker__color-heading" id={`${id}-colors`}>Color</h3>
      <div className="avatar-picker__palettes" role="radiogroup" aria-labelledby={`${id}-colors`}>
        {Object.entries(AVATAR_PALETTES).map(([palette, colors]) => {
          if (!isAvatarPalette(palette)) throw new Error('Unsupported avatar palette in the picker.');
          const selected = palette === draft.selected.palette;
          return (
            <label className={`avatar-picker__palette ${selected ? 'is-selected' : ''}`} key={palette}>
              <input
                type="radio" name={`${id}-palette`} value={palette} checked={selected}
                aria-label={colors.label} disabled={pending} onChange={() => changePalette(palette)}
              />
              <span className="avatar-picker__swatch" style={{ backgroundColor: `#${colors.body}` }} aria-hidden="true">
                {selected && <Icon name="check" width="13" height="13" />}
              </span>
              <span aria-hidden="true">{colors.label}</span>
            </label>
          );
        })}
      </div>
      {(error || generationError) && <p className="avatar-picker__error" role="alert">{error || generationError}</p>}
      <p className="avatar-picker__status" role="status">{pending ? 'Saving your avatar…' : status === 'saved' ? 'Avatar saved.' : ''}</p>
      <div className="avatar-picker__actions">
        <button type="button" className="button button-outline" disabled={pending} onClick={onCancel}>Cancel</button>
        <button type="button" className="button button-dark" disabled={pending || status === 'saved'} onClick={() => { void save(); }}>
          {pending ? 'Saving…' : 'Save avatar'}
        </button>
      </div>
    </section>
  );
}

/** Local draft only. A new identity remounts the draft; ordinary value updates do not. */
export function AvatarPicker(props: AvatarPickerProps) {
  const value = parseAvatarDescriptor(props.value);
  return <AvatarPickerDraft key={props.identityKey} {...props} value={value} />;
}
