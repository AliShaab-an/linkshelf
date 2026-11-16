import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '../../entrypoints/sidepanel/components/ui/Modal';

function Fixture() {
  const [open, setOpen] = useState(false);
  const [controls, setControls] = useState(false);
  const [attemptAnother, setAttemptAnother] = useState(false);
  const [backgroundClicks, setBackgroundClicks] = useState(0);
  const [effectRuns, setEffectRuns] = useState(0);
  useEffect(() => { setEffectRuns(count => count + 1); }, []);

  return <>
    <button onClick={() => setOpen(true)}>Open fixture</button>
    <button onClick={() => setBackgroundClicks(count => count + 1)}>Background {backgroundClicks}</button>
    <output id="effect-runs">{effectRuns}</output>
    {open && <Modal titleId="fixture-title" onClose={() => { setOpen(false); setAttemptAnother(false); }}>
      <h2 id="fixture-title" tabIndex={-1}>Fixture dialog</h2>
      <button data-modal-initial disabled>Disabled initial</button>
      <div hidden><button>Hidden control</button></div>
      <div inert><button>Inert control</button></div>
      {controls && <button id="dynamic-control">Loaded control</button>}
    </Modal>}
    {attemptAnother && <Modal titleId="another-title" onClose={() => setAttemptAnother(false)}>
      <h2 id="another-title" tabIndex={-1}>Second dialog</h2>
    </Modal>}
    <div id="fixture-actions" hidden onClick={(event) => {
      const action = (event.target as HTMLElement).dataset.action;
      if (action === 'add') setControls(true);
      if (action === 'remove') setControls(false);
      if (action === 'overlap') setAttemptAnother(true);
      if (action === 'unmount') { setOpen(false); setAttemptAnother(false); }
    }}>
      <button data-action="add">Add</button><button data-action="remove">Remove</button>
      <button data-action="overlap">Overlap</button><button data-action="unmount">Unmount</button>
    </div>
  </>;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Fixture /></StrictMode>);
