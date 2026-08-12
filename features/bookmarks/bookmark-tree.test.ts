import { describe, expect, it } from 'vitest';
import {
  findBookmarkDuplicates,
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
});
