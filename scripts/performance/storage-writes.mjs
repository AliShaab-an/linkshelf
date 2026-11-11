import assert from 'node:assert/strict';

export async function runStorageWrites(h, row, { fixture, seed, sample, rpc, envelope, options }) {
  const repetitions = options.bulkRepetitions;
  const stored = () => h.page.evaluate(async () => (await chrome.storage.local.get('linkshelfDatabase')).linkshelfDatabase);
  const changed = { ...fixture, settings: { ...fixture.settings, displayDensity: 'comfortable' } };
  for (const [name, expected, rpcType, payload] of [
    ['settings.unchanged', fixture, 'UPDATE_SETTINGS', fixture.settings],
    ['settings.changed', changed, 'UPDATE_SETTINGS', changed.settings],
    ['write.verified', changed, 'IMPORT_DATA'],
  ]) {
    const backup = envelope(expected);
    let token;
    await sample(row, name, () => rpc(rpcType, payload ?? { backup, mode: 'replace', revisionToken: token }), {
      repetitions, warmups: 1,
      reset: async () => {
        await seed();
        if (rpcType === 'IMPORT_DATA') token = (await rpc('PREVIEW_IMPORT_DATA', { backup, mode: 'replace' })).token;
      },
      verify: async (item) => {
        assert.equal(item.warnings, 0);
        if (rpcType === 'UPDATE_SETTINGS') assert.deepEqual(item.settings, expected.settings);
        else assert.equal(item.importResult.mode, 'replace');
        assert.deepEqual(await stored(), expected);
        item.stateVerified = true;
      },
    });
  }

  const added = structuredClone(fixture);
  const project = { ...added.projects[1], id: 'bench-added-project' };
  const session = { ...added.sessions[0], id: 'bench-added-session', projectId: project.id };
  const link = { ...added.links[0], id: 'bench-added-link', projectId: project.id, sessionId: session.id };
  added.projects.push(project);
  added.sessions.push(session);
  added.links.push(link);

  for (const [name, source, repeat, expected, additions] of [
    ['merge.identical', fixture, false, fixture, 0],
    ['merge.repeated', added, true, added, 0],
    ['merge.additions', added, false, added, 1],
  ]) {
    const mode = 'merge';
    const backup = envelope(source);
    const preview = () => rpc('PREVIEW_IMPORT_DATA', { backup, mode });
    const merge = (revisionToken) => rpc('IMPORT_DATA', { backup, mode, revisionToken });
    let token;
    await sample(row, name, () => merge(token), {
      repetitions, warmups: 1,
      reset: async () => {
        await seed();
        if (repeat) {
          const first = await merge((await preview()).token);
          assert.equal(first.importResult.linksAdded, 1);
        }
        token = (await preview()).token;
      },
      verify: async (item) => {
        assert.equal(item.warnings, 0);
        assert.deepEqual(item.importResult, {
          mode, projectsAdded: additions, sessionsAdded: additions, linksAdded: additions,
          recordsSkipped: source.projects.length + source.sessions.length + source.links.length - 3 * additions,
        });
        assert.deepEqual(await stored(), expected);
        item.stateVerified = true;
      },
    });
  }
}
