import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InlineConfirmation } from './InlineConfirmation';
import { Modal } from './Modal';
import { OperationFeedback } from './OperationFeedback';

describe('interaction semantics', () => {
  it('renders a named native dialog and leaves opening to the browser lifecycle', () => {
    const html = renderToStaticMarkup(<Modal titleId="title" onClose={() => undefined}>
      <h3 id="title" tabIndex={-1}>Remove link</h3>
    </Modal>);
    expect(html).toMatch(/^<dialog /);
    expect(html).toContain('aria-labelledby="title"');
    expect(html).not.toMatch(/<dialog [^>]*\bopen=/);
  });

  it('renders a named inline confirmation without modal semantics', () => {
    const html = renderToStaticMarkup(<InlineConfirmation title="Confirm merge" titleId="preview"
      returnFocus={() => null}><button>Cancel</button></InlineConfirmation>);
    expect(html).toContain('<section aria-labelledby="preview">');
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain('dialog');
  });

  it('replaces a stale completion message with pending feedback', () => {
    const html = renderToStaticMarkup(<OperationFeedback pending="Updating link…" message="Previous result" />);
    expect(html).toContain('Updating link…');
    expect(html).not.toContain('Previous result');
  });

  it('places a partial outcome and its warnings in one polite region', () => {
    const html = renderToStaticMarkup(<OperationFeedback partial message="Opened two links. One stayed parked."
      warnings={['Refresh failed.']} />);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('Opened two links. One stayed parked.');
    expect(html).toContain('Refresh failed.');
    expect(html).toContain('bg-amber-50');
  });

  it('distinguishes successful completion from an assertive error', () => {
    const success = renderToStaticMarkup(<OperationFeedback message="Link removed." />);
    const failure = renderToStaticMarkup(<OperationFeedback error="Could not confirm removal." />);
    expect(success).toMatch(/role="status"[^>]*>.*Link removed\./);
    expect(failure).toMatch(/role="alert"[^>]*>.*Could not confirm removal\./);
    expect(failure).not.toContain('bg-emerald-50');
  });
});
