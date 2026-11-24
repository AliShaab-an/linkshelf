import { describe, expect, it } from 'vitest';
import { createEmptyDatabase } from './defaults';
import { buildExport, MAX_EXPORT_LINKS } from './export';
import type { LinkShelfDatabase, SavedLink } from './schemas';

const at = '2026-08-09T12:00:00.000Z';

function link(overrides: Partial<SavedLink> & Pick<SavedLink, 'id'>, projectId: string): SavedLink {
  return {
    sessionId: 'session-1', projectId, title: 'Title', url: 'https://example.com/a', normalizedUrl: 'https://example.com/a',
    domain: 'example.com', status: 'parked', pinnedBeforeParking: false, createdAt: at, updatedAt: at, ...overrides,
  };
}

function library(links: Array<Partial<SavedLink> & Pick<SavedLink, 'id'>>, projectName = 'Research'): LinkShelfDatabase {
  const database = createEmptyDatabase(at);
  const inbox = database.projects.find((project) => project.isInbox)!;
  const project = { id: 'p1', name: projectName, isInbox: false, createdAt: at, updatedAt: at };
  return {
    ...database,
    projects: [inbox, project],
    sessions: [{ id: 'session-1', projectId: 'p1', note: 'Shared note', createdAt: at, updatedAt: at }],
    links: links.map((item) => link(item, 'p1')),
  };
}

const run = (database: LinkShelfDatabase, format: 'markdown' | 'html', projectId?: string) =>
  buildExport(database, { format, projectId, exportedAt: at });

describe('Markdown export', () => {
  it('groups links by project and session with tags and notes', () => {
    const { content, linkCount } = run(library([
      { id: 'a', title: 'First', tags: ['work', 'read later'], note: 'Line one\nLine two' },
      { id: 'b', title: 'Old', status: 'archived', archivedAt: at },
    ]), 'markdown', 'p1');
    expect(linkCount).toBe(2);
    expect(content).toContain('## Research');
    expect(content).toContain('### Saved 2026-08-09 12:00 UTC');
    expect(content).toContain('[First](https://example.com/a) — example.com');
    expect(content).toContain('  - Tags: work, read later');
    expect(content).toContain('  > Line one\n  > Line two');
    expect(content).toContain('### Archived');
    expect(content).toContain('> Shared note');
  });

  it('escapes hostile titles, notes and URLs', () => {
    const { content } = run(library([{
      id: 'a', title: '[x](javascript:alert(1)) **bold** <img src=x onerror=alert(1)>\n# heading',
      url: 'https://example.com/a(b)c d', note: '# not a heading\n[link](https://evil.example)',
    }, { id: 'b', title: 'Odd', url: 'javascript:alert(1)' }]), 'markdown', 'p1');
    expect(content).toContain(String.raw`\[x\]\(javascript:alert\(1\)\) \*\*bold\*\* \<img`);
    expect(content).not.toMatch(/^# heading/m);
    expect(content).toContain('(https://example.com/a%28b%29c%20d)');
    expect(content).toContain(String.raw`  > \# not a heading`);
    expect(content).toContain(String.raw`\[link\]\(https://evil.example\)`);
    expect(content).not.toContain('](javascript:');
    expect(content).toContain('- Odd — example.com');
  });

  it('handles empty projects, non-ASCII text and very long titles', () => {
    expect(run(library([]), 'markdown', 'p1').content).toContain('_No saved links._');
    expect(run(createEmptyDatabase(at), 'markdown', 'missing')).toMatchObject({ projectCount: 0, linkCount: 0 });
    const long = 'x'.repeat(5000);
    const { content } = run(library([{ id: 'a', title: `مرحبا ${long} 日本語` }]), 'markdown', 'p1');
    expect(content).toContain('مرحبا');
    expect(content).toContain(long);
  });

  it('excludes removed and restored links and reports other projects only when exporting all', () => {
    const database = library([{ id: 'a' }, { id: 'b', status: 'removed' }, { id: 'c', status: 'restored' }]);
    expect(run(database, 'markdown', 'p1').linkCount).toBe(1);
    expect(run(database, 'markdown').projectCount).toBe(2);
  });

  it('truncates honestly past the link limit', () => {
    const many = Array.from({ length: MAX_EXPORT_LINKS + 5 }, (_, index) => ({ id: `l${index}`, url: `https://example.com/${index}` }));
    const result = run(library(many), 'markdown', 'p1');
    expect(result).toMatchObject({ linkCount: MAX_EXPORT_LINKS, truncated: true });
    expect(result.content).toContain(`Only the first ${MAX_EXPORT_LINKS} links`);
  });
});

describe('HTML export', () => {
  it('escapes all attacker-controlled text and ships no script or remote resource', () => {
    const { content } = run(library([{
      id: 'a', title: '<script>alert(1)</script>"><img src=x onerror=alert(1)>', note: '<b>note</b> & "quotes"',
      tags: ['<i>t</i>'], url: 'https://example.com/?q="><script>',
    }, { id: 'b', title: 'Bad scheme', url: 'javascript:alert(1)' }, { id: 'c', title: 'Data', url: 'data:text/html,<script>1</script>' }], '<Project & co>'), 'html', 'p1');
    expect(content).not.toMatch(/<script/i);
    expect(content).not.toContain('<img');
    const tags = [...content.matchAll(/<\/?([a-z0-9]+)/gi)].map((match) => match[1].toLowerCase());
    expect(new Set(tags)).toEqual(new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'h1', 'p', 'section', 'h2', 'h3', 'blockquote', 'ul', 'li', 'a', 'span']));
    expect(content).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
    expect(content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(content).toContain('&lt;b&gt;note&lt;/b&gt; &amp; &quot;quotes&quot;');
    expect(content).toContain('&lt;Project &amp; co&gt;');
    expect(content).toContain('&lt;i&gt;t&lt;/i&gt;');
    expect(content).not.toContain('href="javascript:');
    expect(content).not.toContain('href="data:');
    expect(content).toContain("default-src 'none'");
    expect(content).toContain('rel="noopener noreferrer"');
    expect([...content.matchAll(/href="([^"]*)"/g)].every((match) => /^https?:\/\//.test(match[1]))).toBe(true);
    expect(content).not.toMatch(/<(script|link|iframe|img|object|embed)\b/i);
  });

  it('renders structure for RTL text, empty and multi-project exports', () => {
    const database = library([{ id: 'a', title: 'مرحبا', note: 'ملاحظة' }]);
    const { content, projectCount } = run(database, 'html');
    expect(projectCount).toBe(2);
    expect(content).toContain('dir="auto">مرحبا</a>');
    expect(content).toContain('<h2 dir="auto">Inbox</h2>');
    expect(content).toContain('No saved links.');
  });
});

describe('session names in exports', () => {
  const named = (name: string) => {
    const database = library([{ id: 'a' }]);
    return { ...database, sessions: [{ ...database.sessions[0], name }] };
  };

  it('puts the name in the session heading in Markdown, escaped', () => {
    const { content } = run(named('Trip *planning* <b>'), 'markdown', 'p1');
    expect(content).toContain('Trip');
    expect(content).toMatch(/### .*planning.* — Saved 2026-08-09 12:00 UTC/);
    expect(content).not.toContain('<b>');
  });

  it('puts the escaped name in the HTML heading', () => {
    const { content } = run(named('Trip <script>alert(1)</script>'), 'html', 'p1');
    expect(content).toContain('Trip &lt;script&gt;alert(1)&lt;/script&gt; — Saved 2026-08-09 12:00 UTC');
    expect(content).not.toContain('<script>alert(1)');
  });

  it('keeps the plain heading for unnamed sessions', () => {
    expect(run(library([{ id: 'a' }]), 'markdown', 'p1').content).toContain('### Saved 2026-08-09 12:00 UTC');
  });
});
