import { isEligibleUrl, normalizeUrl } from '@/domain/url';

export interface BookmarkTreeNodeLike {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  children?: BookmarkTreeNodeLike[];
}

export interface BookmarkRecord {
  id: string;
  parentId?: string;
  title: string;
  url: string;
}

export interface BookmarkFolder {
  id: string;
  title: string;
  path: string;
}

export function flattenBookmarks(tree: BookmarkTreeNodeLike[]): BookmarkRecord[] {
  const records: BookmarkRecord[] = [];

  function visit(node: BookmarkTreeNodeLike) {
    if (node.url && isEligibleUrl(node.url)) {
      records.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title || node.url,
        url: node.url,
      });
    }
    node.children?.forEach(visit);
  }

  tree.forEach(visit);
  return records;
}

export function flattenBookmarkFolders(
  tree: BookmarkTreeNodeLike[],
): BookmarkFolder[] {
  const folders: BookmarkFolder[] = [];

  function visit(node: BookmarkTreeNodeLike, parentPath: string) {
    const isFolder = node.url === undefined;
    const currentPath = node.title
      ? parentPath
        ? `${parentPath} / ${node.title}`
        : node.title
      : parentPath;

    if (isFolder && node.parentId !== undefined) {
      folders.push({
        id: node.id,
        title: node.title || 'Bookmarks',
        path: currentPath || node.title || 'Bookmarks',
      });
    }
    node.children?.forEach((child) => visit(child, currentPath));
  }

  tree.forEach((node) => visit(node, ''));
  return folders;
}

export function searchBookmarkTree(
  tree: BookmarkTreeNodeLike[],
  query: string,
): BookmarkRecord[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const results: BookmarkRecord[] = [];
  // A stack of iterators preserves preorder without recursion or copying siblings.
  const stack = [tree.values()];
  while (stack.length) {
    const next = stack[stack.length - 1].next();
    if (next.done) {
      stack.pop();
      continue;
    }
    const { id, parentId, title, url, children } = next.value;
    if (url && isEligibleUrl(url)) {
      const label = title || url;
      const text = `${label}\n${url}`.toLocaleLowerCase();
      if (tokens.every((token) => text.includes(token))) {
        results.push({ id, parentId, title: label, url });
      }
    }
    if (children?.length) stack.push(children.values());
  }
  return results;
}

export function findBookmarkDuplicates(
  tree: BookmarkTreeNodeLike[],
  url: string,
  trackingParams: readonly string[],
): BookmarkRecord[] {
  const normalizedTarget = normalizeUrl(url, trackingParams);

  return flattenBookmarks(tree).filter((bookmark) => {
    try {
      return normalizeUrl(bookmark.url, trackingParams) === normalizedTarget;
    } catch {
      return false;
    }
  });
}
