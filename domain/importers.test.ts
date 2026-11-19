import { describe, expect, it } from 'vitest';
import { LinkShelfBackupSchema } from './schemas';
import { ImportFormatError, convertExternalExport } from './importers';

let counter = 0;
const options = { now: '2026-11-19T10:00:00.000Z', createId: () => `id-${++counter}` };
const convert = (text: string) => convertExternalExport(text, options);

describe('external importers', () => {
  it('imports OneTab text, grouping by blank lines and skipping unsupported addresses', () => {
    const result = convert('https://a.example/one | First page\nhttps://b.example/two\n\nhttps://c.example/ | Third\nchrome://settings | Nope\nhttps://a.example/one | Duplicate');
    expect(result).toMatchObject({ source: 'OneTab', linkCount: 3, groupCount: 2, skipped: 2 });
    expect(result.backup.database.links.map((link) => link.title)).toEqual(['First page', 'b.example', 'Third']);
    expect(LinkShelfBackupSchema.safeParse(result.backup).success).toBe(true);
  });

  it('imports Session Buddy sessions and collections', () => {
    const result = convert(JSON.stringify({ collections: [{ name: 'Research', windows: [{ tabs: [{ url: 'https://a.example/', title: 'A' }, { url: 'about:blank' }] }] }], previousSessions: [{ windows: [{ tabs: [{ url: 'https://b.example/' }] }] }] }));
    expect(result).toMatchObject({ source: 'Session Buddy', linkCount: 2, groupCount: 2, skipped: 1 });
    expect(result.backup.database.sessions[0].note).toBe('Research');
    expect(LinkShelfBackupSchema.safeParse(result.backup).success).toBe(true);
  });

  it('imports Toby lists and prefers custom titles', () => {
    const result = convert(JSON.stringify({ lists: [{ title: 'Reading', cards: [{ url: 'https://a.example/', title: 'A', customTitle: 'Mine' }, { url: 'https://b.example/', title: 'B' }] }] }));
    expect(result).toMatchObject({ source: 'Toby', linkCount: 2, groupCount: 1 });
    expect(result.backup.database.links[0].title).toBe('Mine');
  });

  it('imports Pocket HTML with dates, tags and entities', () => {
    const result = convert('<html><body><h1>Unread</h1><ul><li><a href="https://a.example/?a=1&amp;b=2" time_added="1700000000" tags="Read Later,dev">Fish &amp; Chips</a></li></ul><h1>Read Archive</h1><ul><li><a href="https://b.example/" time_added="1700000100" tags="">B</a></li></ul></body></html>');
    expect(result).toMatchObject({ source: 'Pocket', linkCount: 2, groupCount: 2 });
    const [first] = result.backup.database.links;
    expect(first).toMatchObject({ url: 'https://a.example/?a=1&b=2', title: 'Fish & Chips', tags: ['read later', 'dev'], createdAt: '2023-11-14T22:13:20.000Z' });
    expect(LinkShelfBackupSchema.safeParse(result.backup).success).toBe(true);
  });

  it('imports browser bookmark files by folder', () => {
    const result = convert('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Work</H3><DL><p><DT><A HREF="https://a.example/" ADD_DATE="1700000000">A</A><DT><A HREF="javascript:alert(1)">Bad</A></DL><p></DL>');
    expect(result).toMatchObject({ source: 'Browser bookmarks', linkCount: 1, groupCount: 1, skipped: 1 });
    expect(result.backup.database.sessions[0].note).toBe('Work');
  });

  it('rejects unknown formats and files with nothing importable', () => {
    expect(() => convert('hello world')).toThrow(ImportFormatError);
    expect(() => convert('{"a":1}')).toThrow(ImportFormatError);
    expect(() => convert('https://a.example/\nnot a link')).toThrow(ImportFormatError);
    expect(() => convert('<ul><li><a href="javascript:x">x</a></li></ul>')).toThrow(/no saved web addresses/);
  });
});
