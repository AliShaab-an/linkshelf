import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../sidepanel/App';
import '../sidepanel/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App isManager />
  </React.StrictMode>,
);
