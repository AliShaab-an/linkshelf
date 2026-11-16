import assert from 'node:assert/strict';
export async function runFault(h, row, { fixture, seed, sample, envelope }) {
  for (const kind of ['before', 'after']) {
    let token, backup;
    await sample(row, 'fault.rollback.' + kind, async () => {
      const response = await h.page.evaluate(async ({ backup, token }) => {
        const before = JSON.stringify((await chrome.storage.local.get('linkshelfDatabase')).linkshelfDatabase);
        const start = performance.now();
        const response = await chrome.runtime.sendMessage({ type: 'IMPORT_DATA', payload: { backup, mode: 'replace', revisionToken: token } });
        const ms = performance.now() - start;
        const after = JSON.stringify((await chrome.storage.local.get('linkshelfDatabase')).linkshelfDatabase);
        return { ms, failedAsExpected: response.success === false, preserved: before === after };
      }, { backup, token });
      assert.ok(response.failedAsExpected && response.preserved);
      return response;
    }, { reset: async () => {
      await seed(); backup = envelope({ ...fixture, settings: { ...fixture.settings, displayDensity: 'comfortable' } });
      token = (await h.ok({ type: 'PREVIEW_IMPORT_DATA', payload: { backup, mode: 'replace' } })).preview.revisionToken;
      await h.worker().evaluate(kind => {
        const original = chrome.storage.local.set.bind(chrome.storage.local);
        chrome.storage.local.set = async (...args) => {
          chrome.storage.local.set = original;
          if (kind === 'after') await original(...args);
          throw new Error('Synthetic benchmark write failure');
        };
      }, kind);
    }, repetitions: 3, warmups: 1 });
  }
}
