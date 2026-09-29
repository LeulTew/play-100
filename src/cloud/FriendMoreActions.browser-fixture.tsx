import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../lib/browser-fixture';
import { FriendMoreActions } from './FriendMoreActions';
import '../styles.css';
import './friends-ui.css';

const chosen: string[] = [];
window.friendMoreActionsFixture = { chosen };

/** Two friend rows' More actions, laid out as on the Friends page, and a control after them for Tab to reach. */
export function FriendRows() {
  return (
    <main>
      <h1>Friends</h1>
      <ul className="friend-list">
        {['Ada', 'Grace'].map((name) => (
          <li key={name} className="friend-manager-row">
            <strong>{name}</strong>
            <div className="button-row friend-row-actions">
              <FriendMoreActions
                name={name}
                accepted
                disabled={false}
                onChoose={(action) => chosen.push(`${action} ${name}`)}
              />
            </div>
          </li>
        ))}
      </ul>
      <button type="button">After the list</button>
    </main>
  );
}

createRoot(fixtureElement('mount')).render(<FriendRows />);
