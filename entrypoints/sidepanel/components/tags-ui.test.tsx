import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SavedLink } from '@/domain/schemas';
import { SavedLinkCard } from './SavedLinkCard';
import { parseTagInput, TagLinkDialog } from './TagLinkDialog';
import { TAG_FILTER_INITIAL, TagFilterBar } from './ui/TagFilterBar';

const link: SavedLink = {
  id: 'link-1', sessionId: 's', projectId: 'inbox', title: 'Guide', url: 'https://example.com/', normalizedUrl: 'https://example.com/',
  domain: 'example.com', status: 'parked', pinnedBeforeParking: false,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};
const tags = (count: number) => Array.from({ length: count }, (_, index) => ({ tag: `tag${index}`, count: count - index }));

describe('tag filter bar', () => {
  it('renders nothing without tags or selection', () => {
    expect(renderToStaticMarkup(<TagFilterBar tags={[]} selected={[]} onToggle={() => undefined} />)).toBe('');
  });

  it('exposes pressed state and a named group', () => {
    const html = renderToStaticMarkup(<TagFilterBar tags={tags(2)} selected={['tag1']} onToggle={() => undefined} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Filter by tag"');
    expect(html).toMatch(/aria-pressed="true"[^>]*title="tag1"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*title="tag0"/);
  });

  it('bounds the initial chips but keeps a selected hidden tag visible', () => {
    const many = tags(30);
    const html = renderToStaticMarkup(<TagFilterBar tags={many} selected={['tag25']} onToggle={() => undefined} />);
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(TAG_FILTER_INITIAL + 1);
    expect(html).toContain('title="tag25"');
    expect(html).toContain('Show 21 more');
  });

  it('shows a selected tag that no longer has links', () => {
    const html = renderToStaticMarkup(<TagFilterBar tags={tags(1)} selected={['gone']} onToggle={() => undefined} />);
    expect(html).toContain('title="gone"');
  });
});

describe('saved link card tags', () => {
  const card = (value: SavedLink) => renderToStaticMarkup(<SavedLinkCard link={value} isRestoring={false} onRestore={() => undefined} onEditTags={() => undefined} />);

  it('shows no tag list for untagged links', () => {
    expect(card(link)).not.toContain('aria-label="Tags"');
  });

  it('shows up to three tags and names the rest', () => {
    const html = card({ ...link, tags: ['a', 'b', 'c', 'd', 'e'] });
    expect(html).toContain('aria-label="Tags"');
    expect(html).toContain('>a<');
    expect(html).toContain('>c<');
    expect(html).not.toContain('>d<');
    expect(html).toContain('+2');
    expect(html).toContain('and 2 more: d, e');
  });

  it('offers tag editing from the overflow menu', () => {
    expect(card(link)).toContain('aria-label="More link actions"');
  });
});

describe('tag dialog', () => {
  it('splits comma-separated input and ignores blank entries', () => {
    expect(parseTagInput(' a, b ,, c ,')).toEqual(['a', 'b', 'c']);
    expect(parseTagInput('')).toEqual([]);
  });

  it('renders a named dialog with a labelled field and help text', () => {
    const html = renderToStaticMarkup(<TagLinkDialog link={{ ...link, tags: ['work'] }} suggestions={['work', 'ideas']}
      returnFocus={() => null} onSaved={() => undefined} onCancel={() => undefined} />);
    expect(html).toContain('aria-labelledby="tag-link-title"');
    expect(html).toContain('value="work"');
    expect(html).toMatch(/<label[^>]*>Tags<\/label>/);
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('Add tag ideas');
    expect(html).not.toContain('Add tag work');
  });

  it('disables saving until the tags change', () => {
    const html = renderToStaticMarkup(<TagLinkDialog link={{ ...link, tags: ['work'] }} suggestions={[]}
      returnFocus={() => null} onSaved={() => undefined} onCancel={() => undefined} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save tags<\/button>/);
  });
});
