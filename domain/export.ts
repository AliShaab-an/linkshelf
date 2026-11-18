import { isEligibleUrl } from './url';
import type { LinkShelfDatabase, ParkingSession, Project, SavedLink } from './schemas';

/** Hard bound on generated output so a very large library cannot freeze the side panel. */
export const MAX_EXPORT_LINKS = 20_000;

export type ExportFormat = 'markdown' | 'html';

export interface ExportOptions {
  /** Export only this project. Omit to export every project. */
  projectId?: string;
  format: ExportFormat;
  exportedAt: string;
}

export interface ExportResult {
  content: string;
  linkCount: number;
  projectCount: number;
  /** True when links were left out because the library exceeded MAX_EXPORT_LINKS. */
  truncated: boolean;
}

interface ProjectSection {
  project: Project;
  sessions: Array<{ session: ParkingSession | undefined; links: SavedLink[] }>;
  archived: SavedLink[];
}

/** Read-only, human-readable export. It is not a restore format; JSON backups remain the only one. */
export function buildExport(database: LinkShelfDatabase, options: ExportOptions): ExportResult {
  const { sections, linkCount, truncated } = collect(database, options.projectId);
  const content = options.format === 'html'
    ? renderHtml(sections, options.exportedAt, truncated)
    : renderMarkdown(sections, options.exportedAt, truncated);
  return { content, linkCount, projectCount: sections.length, truncated };
}

function collect(database: LinkShelfDatabase, projectId: string | undefined) {
  const projects = database.projects
    .filter((project) => !projectId || project.id === projectId)
    .sort((first, second) => first.isInbox !== second.isInbox
      ? (first.isInbox ? -1 : 1)
      : first.name.localeCompare(second.name));
  const sessions = new Map(database.sessions.map((session) => [session.id, session]));
  let remaining = MAX_EXPORT_LINKS;
  let truncated = false;
  let linkCount = 0;
  const sections: ProjectSection[] = [];

  for (const project of projects) {
    let candidates = database.links.filter((link) => link.projectId === project.id &&
      (link.status === 'parked' || link.status === 'archived'));
    if (candidates.length > remaining) {
      candidates = candidates.slice(0, remaining);
      truncated = true;
    }
    remaining -= candidates.length;
    linkCount += candidates.length;

    const bySession = new Map<string, SavedLink[]>();
    for (const link of candidates.filter((item) => item.status === 'parked')) {
      const group = bySession.get(link.sessionId);
      if (group) group.push(link);
      else bySession.set(link.sessionId, [link]);
    }
    sections.push({
      project,
      sessions: [...bySession].map(([id, links]) => ({
        session: sessions.get(id),
        links: links.sort((first, second) => first.originalIndex !== second.originalIndex
          ? (first.originalIndex ?? 0) - (second.originalIndex ?? 0)
          : first.createdAt.localeCompare(second.createdAt)),
      })).sort((first, second) => (second.session?.createdAt ?? '').localeCompare(first.session?.createdAt ?? '')),
      archived: candidates.filter((item) => item.status === 'archived')
        .sort((first, second) => (second.archivedAt ?? second.updatedAt).localeCompare(first.archivedAt ?? first.updatedAt)),
    });
  }
  return { sections, linkCount, truncated };
}

function formatDate(value: string | undefined): string {
  return value ? `${value.slice(0, 10)} ${value.slice(11, 16)} UTC` : 'Unknown date';
}

// ---------------------------------------------------------------- Markdown

const MARKDOWN_SPECIAL = /[\\`*_{}[\]()<>#+!|~&]/g;

function inline(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(MARKDOWN_SPECIAL, '\\$&');
}

function markdownLink(title: string, url: string): string {
  const text = inline(title) || 'Untitled';
  if (!isEligibleUrl(url)) return text;
  const href = new URL(url).href.replace(/[()<>\s\\]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  return `[${text}](${href})`;
}

function quote(value: string, indent: string): string {
  return value.split(/\r?\n/).map((line) => `${indent}> ${line.trim().replace(MARKDOWN_SPECIAL, '\\$&')}`).join('\n');
}

function markdownLinkItem(link: SavedLink): string {
  const lines = [`- ${markdownLink(link.title, link.url)} — ${inline(link.domain)}`];
  if (link.tags?.length) lines.push(`  - Tags: ${link.tags.map(inline).join(', ')}`);
  if (link.note?.trim()) lines.push(quote(link.note.trim(), '  '));
  return lines.join('\n');
}

function renderMarkdown(sections: ProjectSection[], exportedAt: string, truncated: boolean): string {
  const out = ['# LinkShelf export', '', `Exported ${formatDate(exportedAt)}.`];
  if (truncated) out.push('', `> Only the first ${MAX_EXPORT_LINKS} links are included. Use a project export for the rest.`);
  if (sections.length === 0) out.push('', 'No projects to export.');
  for (const { project, sessions, archived } of sections) {
    out.push('', `## ${inline(project.name)}`);
    if (project.description?.trim()) out.push('', inline(project.description));
    if (sessions.length === 0 && archived.length === 0) out.push('', '_No saved links._');
    for (const { session, links } of sessions) {
      out.push('', `### Saved ${formatDate(session?.createdAt ?? links[0]?.createdAt)}`);
      if (session?.note?.trim()) out.push('', quote(session.note.trim(), ''));
      out.push('', ...links.map(markdownLinkItem));
    }
    if (archived.length > 0) out.push('', '### Archived', '', ...archived.map(markdownLinkItem));
  }
  return `${out.join('\n')}\n`;
}

// -------------------------------------------------------------------- HTML

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!
  ));
}

function htmlLinkItem(link: SavedLink): string {
  const title = escapeHtml(link.title.replace(/\s+/g, ' ').trim() || 'Untitled');
  const heading = isEligibleUrl(link.url)
    ? `<a href="${escapeHtml(new URL(link.url).href)}" rel="noopener noreferrer" dir="auto">${title}</a>`
    : `<span dir="auto">${title}</span>`;
  const tags = link.tags?.length
    ? `<p class="meta">Tags: ${link.tags.map((tag) => `<span class="tag" dir="auto">${escapeHtml(tag)}</span>`).join(' ')}</p>`
    : '';
  const note = link.note?.trim() ? `<blockquote dir="auto">${escapeHtml(link.note.trim())}</blockquote>` : '';
  return `<li>${heading} <span class="meta">— ${escapeHtml(link.domain)}</span>${tags}${note}</li>`;
}

function renderHtml(sections: ProjectSection[], exportedAt: string, truncated: boolean): string {
  const body: string[] = [
    '<h1>LinkShelf export</h1>',
    `<p class="meta">Exported ${escapeHtml(formatDate(exportedAt))}.</p>`,
  ];
  if (truncated) body.push(`<p class="meta">Only the first ${MAX_EXPORT_LINKS} links are included. Use a project export for the rest.</p>`);
  if (sections.length === 0) body.push('<p>No projects to export.</p>');
  for (const { project, sessions, archived } of sections) {
    body.push(`<section><h2 dir="auto">${escapeHtml(project.name)}</h2>`);
    if (project.description?.trim()) body.push(`<p dir="auto">${escapeHtml(project.description.trim())}</p>`);
    if (sessions.length === 0 && archived.length === 0) body.push('<p class="meta">No saved links.</p>');
    for (const { session, links } of sessions) {
      body.push(`<h3>Saved ${escapeHtml(formatDate(session?.createdAt ?? links[0]?.createdAt))}</h3>`);
      if (session?.note?.trim()) body.push(`<blockquote dir="auto">${escapeHtml(session.note.trim())}</blockquote>`);
      body.push(`<ul>${links.map(htmlLinkItem).join('')}</ul>`);
    }
    if (archived.length > 0) body.push(`<h3>Archived</h3><ul>${archived.map(htmlLinkItem).join('')}</ul>`);
    body.push('</section>');
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LinkShelf export</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#0f172a}
h2{margin-top:2.5rem;border-bottom:1px solid #cbd5e1;padding-bottom:.25rem}
li{margin:.5rem 0;overflow-wrap:anywhere}
blockquote{margin:.25rem 0 .25rem 0;padding-left:.75rem;border-inline-start:3px solid #cbd5e1;color:#475569;white-space:pre-wrap}
.meta{color:#475569;font-size:.875rem;margin:.1rem 0}
.tag{background:#f1f5f9;border-radius:999px;padding:.05rem .5rem}
</style>
</head>
<body>
${body.join('\n')}
</body>
</html>
`;
}
