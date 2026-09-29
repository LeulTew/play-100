import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { popoverSupported } from './popover-support';

function focusItem(popup: HTMLElement, last: boolean) {
  const items = popup.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
  items[last ? items.length - 1 : 0]?.focus({ preventScroll: true });
}

/**
 * A friend row's More actions: Remove friend (for friends) and Block player. With the Popover API the menu is a popover
 * placed below its button. Without it (before Chrome 114, Firefox 125 and Safari 17) the menu is an ordinary disclosure
 * that opens in place below the row's actions. It has the same keys and closes on Escape, Tab, a choice or a click
 * outside it.
 */
export function FriendMoreActions({
  name,
  accepted,
  disabled,
  onChoose,
}: {
  name: string;
  accepted: boolean;
  disabled: boolean;
  onChoose: (action: 'remove' | 'block') => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popover] = useState(popoverSupported);
  // The disclosure commits at once, so its items can take focus, and a Tab that closes it moves on from its button.
  const setShown = (shown: boolean) => flushSync(() => setOpen(shown));
  const close = () => {
    if (popover) menu.current?.hidePopover();
    else setShown(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const place = useCallback(() => {
    const button = trigger.current;
    const popup = menu.current;
    if (!popover || !button || !popup?.matches(':popover-open')) return;
    const rect = button.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) {
      popup.hidePopover();
      return;
    }
    popup.style.left = `${Math.max(8, Math.min(rect.right - popup.offsetWidth, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - popup.offsetHeight - 8))}px`;
  }, [popover]);
  const show = (last = false) => {
    const button = trigger.current;
    const popup = menu.current;
    if (!button || !popup) return;
    if (popover ? popup.matches(':popover-open') : open) {
      close();
      return;
    }
    if (popover) {
      popup.showPopover();
      place();
    } else setShown(true);
    focusItem(popup, last);
  };
  useEffect(() => {
    if (!open || !popover) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, [open, popover, place]);
  // The disclosure closes as the popover does: Escape anywhere returns focus to its button, and a click outside it and
  // its button closes it and leaves focus where the click lands. It closes on the click, not the press: it opens in
  // place, so closing moves the content below it, and closing on the press would move a click's target away from the
  // pointer before its release.
  useEffect(() => {
    if (!open || popover) return;
    const outside = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (menu.current?.contains(target) || trigger.current?.contains(target))) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [open, popover]);
  return (
    <>
      <button
        ref={trigger}
        className="text-button"
        disabled={disabled}
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => show()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show(event.key === 'ArrowUp');
          }
        }}
      >
        More
      </button>
      <div
        ref={menu}
        id={id}
        popover={popover ? 'auto' : undefined}
        hidden={popover ? undefined : !open}
        role="menu"
        aria-label={`Actions for ${name}`}
        className="friend-more-menu"
        onToggle={(event) => setOpen(event.newState === 'open')}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault();
            close();
            return;
          }
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
          const index = items.findIndex((item) => item === document.activeElement);
          const next =
            event.key === 'ArrowDown'
              ? (index + 1) % items.length
              : event.key === 'ArrowUp'
                ? (index + items.length - 1) % items.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : -1;
          if (next >= 0) {
            event.preventDefault();
            items[next]?.focus();
          }
        }}
      >
        {accepted && (
          <button
            role="menuitem"
            className="text-button"
            onClick={() => {
              close();
              onChoose('remove');
            }}
          >
            Remove friend
          </button>
        )}
        <button
          role="menuitem"
          className="text-button danger-text"
          onClick={() => {
            close();
            onChoose('block');
          }}
        >
          Block player
        </button>
      </div>
    </>
  );
}
