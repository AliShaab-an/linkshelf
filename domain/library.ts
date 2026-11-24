import type { ParkingSession, Project, SavedLink } from './schemas';

export interface LibraryCard {
  project: Project;
  /** Parked links, newest session first, in the order they were parked. */
  links: LibraryLink[];
}

export interface LibraryLink {
  link: SavedLink;
  /** The session's name, when it has one, so the board can show where a link came from. */
  sessionName?: string;
}

/** One card per project, the Inbox first, then by name. Projects with no parked links stay: they are drop targets. */
export function buildLibrary(
  projects: readonly Project[],
  groups: ReadonlyArray<{ session: Pick<ParkingSession, 'projectId' | 'createdAt' | 'name'>; links: readonly SavedLink[] }>,
): LibraryCard[] {
  const byProject = new Map<string, LibraryLink[]>();
  const newestFirst = [...groups].sort((a, b) => b.session.createdAt.localeCompare(a.session.createdAt));
  for (const { session, links } of newestFirst) {
    const list = byProject.get(session.projectId) ?? [];
    for (const link of links) list.push({ link, ...(session.name ? { sessionName: session.name } : {}) });
    byProject.set(session.projectId, list);
  }
  return [...projects]
    .sort((a, b) => Number(b.isInbox) - Number(a.isInbox) || a.name.localeCompare(b.name))
    .map(project => ({ project, links: byProject.get(project.id) ?? [] }));
}

/** Moves a link between cards in memory, so the board can answer a drop before the worker has replied. */
export function moveInLibrary(cards: readonly LibraryCard[], linkId: string, projectId: string): LibraryCard[] {
  const moving = cards.flatMap(card => card.links).find(entry => entry.link.id === linkId);
  if (!moving || moving.link.projectId === projectId) return [...cards];
  return cards.map(card => {
    const without = card.links.filter(entry => entry.link.id !== linkId);
    return card.project.id === projectId
      ? { ...card, links: [{ link: { ...moving.link, projectId }, ...(moving.sessionName ? { sessionName: moving.sessionName } : {}) }, ...without] }
      : { ...card, links: without };
  });
}

/** Narrows each card to the links whose title, address, session name or tags contain every word of the query. */
export function filterLibrary(cards: readonly LibraryCard[], query: string): LibraryCard[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...cards];
  return cards.map(card => ({
    ...card,
    links: card.links.filter(({ link, sessionName }) => {
      const text = [link.title, link.url, link.domain, sessionName, ...(link.tags ?? []), card.project.name].join(' ').toLocaleLowerCase();
      return words.every(word => text.includes(word));
    }),
  }));
}
