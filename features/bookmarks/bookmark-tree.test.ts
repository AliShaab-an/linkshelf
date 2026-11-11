import { describe, expect, it } from 'vitest';
import {
  findBookmarkDuplicates,
  flattenBookmarks,
  flattenBookmarkFolders,
  searchBookmarkTree,
  type BookmarkTreeNodeLike,
} from './bookmark-tree';

const tree: BookmarkTreeNodeLike[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks bar',
        children: [
          {
            id: '10',
            parentId: '1',
            title: 'Development',
            children: [
              {
                id: '100',
                parentId: '10',
                title: 'React Guide',
                url: 'https://react.dev/learn?utm_source=email#start',
              },
            ],
          },
        ],
      },
      { id: '2', parentId: '0', title: 'Other bookmarks', children: [] },
    ],
  },
];

describe('bookmark tree utilities', () => {
  it('lists nested destination folders with readable paths', () => {
    expect(flattenBookmarkFolders(tree).map((folder) => folder.path)).toEqual([
      'Bookmarks bar',
      'Bookmarks bar / Development',
      'Other bookmarks',
    ]);
  });

  it('searches bookmark titles and URLs using every query token', () => {
    expect(searchBookmarkTree(tree, 'react learn').map((item) => item.id)).toEqual([
      '100',
    ]);
    expect(searchBookmarkTree(tree, 'react missing')).toEqual([]);
  });

  it('detects duplicates after LinkShelf URL normalization', () => {
    expect(
      findBookmarkDuplicates(
        tree,
        'https://REACT.dev/learn/',
        ['utm_source'],
      ).map((item) => item.id),
    ).toEqual(['100']);
  });

  it('matches the old flatten-and-filter order with duplicates, fallback titles, and ineligible URLs', () => {
    const url = 'https://example.test/%C3%A9?x=1';
    let nested: BookmarkTreeNodeLike = { id: 'second', parentId: 'deep-0', title: '', url };
    for (let i = 0; i < 100; i++) nested = { id: `deep-${i}`, title: '', children: [nested] };
    const sample = [
      { id: 'first', parentId: 'folder', title: 'Éxample', url },
      { id: 'ignored', title: 'Éxample', url: 'chrome://settings' },
      nested,
    ];
    for (const query of ['example.test', 'ÉXAMPLE ?x=1', '%c3%a9', '  ', 'absent']) {
      const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const expected = tokens.length ? flattenBookmarks(sample).filter(bookmark =>
        tokens.every(token => `${bookmark.title}\n${bookmark.url}`.toLocaleLowerCase().includes(token))) : [];
      expect(searchBookmarkTree(sample, query)).toEqual(expected);
    }
    expect(searchBookmarkTree(sample, 'example.test').map(item => item.id)).toEqual(['first', 'second']);
    expect(searchBookmarkTree([], 'example')).toEqual([]);
  });
});
