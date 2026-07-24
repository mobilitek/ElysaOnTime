import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root is missing');
}

// StrictMode détecte en développement les effets React qui ne sont pas
// reproductibles ou qui oublient leur nettoyage.
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
