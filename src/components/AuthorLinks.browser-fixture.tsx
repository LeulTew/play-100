import { createRoot } from 'react-dom/client';
import { AuthorLinks } from './AuthorLinks';
import '../styles.css';
import '../shared-ui.css';

const root = document.getElementById('root');
if (!root) throw new Error('The author link fixture needs its root element.');
createRoot(root).render(<AuthorLinks />);
