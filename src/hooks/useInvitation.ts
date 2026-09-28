import { useEffect, useState } from 'react';
import { captureInviteContinuation } from '../lib/invite-continuation';

/** The invite continuation, re-read when the invite page's URL changes. */
export function useInvitation() {
  const [invitation, setInvitation] = useState(captureInviteContinuation);
  useEffect(() => {
    const update = () => {
      if (location.pathname === '/invite') setInvitation(captureInviteContinuation());
    };
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return invitation;
}
