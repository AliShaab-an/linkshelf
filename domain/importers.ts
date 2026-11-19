// Converts exports from other tab and bookmark managers into a LinkShelf backup,
// so they flow through the existing validated merge preview and import.
import { readBackupFile } from './backup';
import { MAX_BACKUP_BYTES } from './constants';
import { createDefaultSettings, createInboxProject } from './defaults';
import { CURRENT_SCHEMA_VERSION, type LinkShelfBackup, type SavedLink } from './schemas';
import { parseTags } from './tags';
import { getDomain, isEligibleUrl, normalizeUrl } from './url';

export type ExternalSource = 'OneTab' | 'Session Buddy' | 'Toby' | 'Pocket' | 'Browser bookmarks';

export const MAX_IMPORT_LINKS = 20000;
const MAX_TITLE = 500;
const MAX_URL = 2048;

interface ImportedLink { url: string; title?: string; addedAt?: string; tags?: string[] }
interface ImportedGroup { title?: string; links: ImportedLink[] }

export interface ExternalImport {
  source: ExternalSource;
  backup: LinkShelfBackup;
  linkCount: number;
  groupCount: number;
  skipped: number;
  truncated: boolean;
}

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFormatError';
  }
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function toIso(value: unknown): string | undefined {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof number === 'number' && Number.isFinite(number) && number > 0) {
    const date = new Date(number < 1e11 ? number * 1000 : number);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseOneTab(text: string): ImportedGroup[] | undefined {
  const groups: ImportedGroup[] = [];
  let current: ImportedGroup | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { current = undefined; continue; }
    const match = /^([a-z][a-z0-9+.-]*:\/\/\S+)(?:\s+\|\s*(.*))?$/i.exec(line);
    if (!match) return undefined;
    if (!current) { current = { links: [] }; groups.push(current); }
    current.links.push({ url: match[1], title: match[2]?.trim() || undefined });
  }
  return groups.length ? groups : undefined;
}

function tabsOf(session: Record<string, unknown>): ImportedLink[] {
  const windows = Array.isArray(session.windows) ? session.windows : [];
  const tabs = windows.flatMap((window) => (window && typeof window === 'object' && Array.isArray((window as { tabs?: unknown }).tabs)
    ? (window as { tabs: unknown[] }).tabs : []));
  return tabs.flatMap((tab) => {
    if (!tab || typeof tab !== 'object') return [];
    const record = tab as Record<string, unknown>;
    const url = asText(record.url);
    return url ? [{ url, title: asText(record.title) }] : [];
  });
}

function parseSessionBuddy(value: unknown): ImportedGroup[] | undefined {
  const lists: unknown[] = [];
  if (Array.isArray(value)) lists.push(value);
  else if (value && typeof value === 'object') {
    for (const key of ['collections', 'sessions', 'previousSessions']) {
      const item = (value as Record<string, unknown>)[key];
      if (Array.isArray(item)) lists.push(item);
    }
  }
  const sessions = lists.flat().filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && Array.isArray((item as { windows?: unknown }).windows));
  if (!sessions.length) return undefined;
  return sessions.map((session) => ({
    title: asText(session.name) ?? asText(session.title),
    links: tabsOf(session).map((link) => ({ ...link, addedAt: toIso(session.date ?? session.created ?? session.modified) })),
  }));
}

function parseToby(value: unknown): ImportedGroup[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const lists = (value as { lists?: unknown }).lists;
  if (!Array.isArray(lists)) return undefined;
  const groups: ImportedGroup[] = [];
  for (const list of lists) {
    if (!list || typeof list !== 'object' || !Array.isArray((list as { cards?: unknown }).cards)) continue;
    const record = list as Record<string, unknown>;
    groups.push({
      title: asText(record.title) ?? asText(record.name),
      links: (record.cards as unknown[]).flatMap((card) => {
        if (!card || typeof card !== 'object') return [];
        const item = card as Record<string, unknown>;
        const url = asText(item.url);
        return url ? [{ url, title: asText(item.customTitle) ?? asText(item.title) }] : [];
      }),
    });
  }
  return groups.length ? groups : undefined;
}

/** Handles Pocket exports (h1 + list items) and Netscape bookmark files (h3 folders). */
function parseHtml(text: string): { groups: ImportedGroup[]; pocket: boolean } | undefined {
  const groups: ImportedGroup[] = [];
  let current: ImportedGroup | undefined;
  let found = false;
  const token = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of text.matchAll(token)) {
    if (match[1] !== undefined) {
      current = { title: decodeEntities(match[1].replace(/<[^>]*>/g, '')).trim() || undefined, links: [] };
      groups.push(current);
      continue;
    }
    const attributes = match[2] ?? '';
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    if (!href) continue;
    found = true;
    if (!current) { current = { links: [] }; groups.push(current); }
    const attr = (name: string) => {
      const found = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attributes);
      return found ? decodeEntities(found[1] ?? found[2] ?? '') : undefined;
    };
    const tags = attr('tags')?.split(',').map((tag) => tag.trim()).filter(Boolean);
    current.links.push({
      url: decodeEntities(href[1] ?? href[2] ?? ''),
      title: decodeEntities(match[3].replace(/<[^>]*>/g, '')).trim() || undefined,
      addedAt: toIso(attr('time_added') ?? attr('add_date')),
      tags,
    });
  }
  return found ? { groups, pocket: /\btime_added\s*=/i.test(text) } : undefined;
}

function detect(text: string): { source: ExternalSource; groups: ImportedGroup[] } | undefined {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) return undefined;
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    let json: unknown;
    try { json = JSON.parse(trimmed); } catch { return undefined; }
    const toby = parseToby(json);
    if (toby) return { source: 'Toby', groups: toby };
    const buddy = parseSessionBuddy(json);
    if (buddy) return { source: 'Session Buddy', groups: buddy };
    return undefined;
  }
  if (trimmed[0] === '<') {
    const html = parseHtml(trimmed);
    return html ? { source: html.pocket ? 'Pocket' : 'Browser bookmarks', groups: html.groups } : undefined;
  }
  const oneTab = parseOneTab(trimmed);
  return oneTab ? { source: 'OneTab', groups: oneTab } : undefined;
}

export function convertExternalExport(
  text: string,
  options: { now?: string; createId?: () => string } = {},
): ExternalImport {
  const detected = detect(text);
  if (!detected) {
    throw new ImportFormatError('This file is not a LinkShelf backup or a supported export (OneTab, Session Buddy, Toby, Pocket, or browser bookmarks).');
  }
  const now = options.now ?? new Date().toISOString();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const trackingParams = createDefaultSettings().trackingParamsToRemove;
  const projectId = createId();
  const sessions: LinkShelfBackup['database']['sessions'] = [];
  const links: SavedLink[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let truncated = false;

  for (const group of detected.groups) {
    const sessionId = createId();
    let groupCreated: string | undefined;
    let added = 0;
    for (const item of group.links) {
      const url = item.url.trim();
      if (!isEligibleUrl(url) || url.length > MAX_URL) { skipped += 1; continue; }
      let normalizedUrl: string;
      try { normalizedUrl = normalizeUrl(url, trackingParams); } catch { skipped += 1; continue; }
      if (seen.has(normalizedUrl)) { skipped += 1; continue; }
      if (links.length >= MAX_IMPORT_LINKS) { truncated = true; skipped += 1; continue; }
      seen.add(normalizedUrl);
      const createdAt = item.addedAt ?? now;
      groupCreated ??= createdAt;
      const parsedTags = item.tags?.length ? parseTags(item.tags.slice(0, 10)) : undefined;
      const domain = getDomain(url);
      links.push({
        id: createId(), sessionId, projectId,
        title: (item.title?.slice(0, MAX_TITLE) || domain || url),
        url, normalizedUrl, domain,
        ...(parsedTags?.ok && parsedTags.tags.length ? { tags: parsedTags.tags } : {}),
        status: 'parked', pinnedBeforeParking: false,
        originalIndex: added, createdAt, updatedAt: createdAt,
      });
      added += 1;
    }
    if (!added) continue;
    sessions.push({
      id: sessionId, projectId,
      ...(group.title ? { note: group.title.slice(0, 500) } : {}),
      createdAt: groupCreated ?? now, updatedAt: groupCreated ?? now,
    });
  }

  if (!links.length) throw new ImportFormatError(`This ${detected.source} file contains no saved web addresses that LinkShelf can import.`);

  const backup: LinkShelfBackup = {
    format: 'linkshelf-backup',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now,
    database: {
      projects: [
        createInboxProject(now),
        { id: projectId, name: `Imported from ${detected.source} · ${now.slice(0, 10)}`, isInbox: false, createdAt: now, updatedAt: now },
      ],
      sessions,
      links,
      settings: createDefaultSettings(),
    },
  };
  return { source: detected.source, backup, linkCount: links.length, groupCount: sessions.length, skipped, truncated };
}

export async function readExternalFile(file: Pick<File, 'size' | 'text'>): Promise<ExternalImport> {
  if (file.size > MAX_BACKUP_BYTES) throw new ImportFormatError('This file is too large to import.');
  return convertExternalExport(await file.text());
}

export interface ImportFile {
  source: ExternalSource | 'LinkShelf';
  backup: LinkShelfBackup;
  /** Present for files from other tools. */
  external?: ExternalImport;
}

/** Reads a LinkShelf backup or an export from another tool. */
export async function readImportFile(file: Pick<File, 'size' | 'text'>): Promise<ImportFile> {
  // Oversized files get the standard backup size message.
  if (file.size > MAX_BACKUP_BYTES) return { source: 'LinkShelf', backup: await readBackupFile(file) };
  const text = await file.text();
  const first = text.replace(/^﻿/, '').trimStart()[0];
  let value: unknown;
  let invalidJson = false;
  if (first === '{' || first === '[') {
    try { value = JSON.parse(text) as unknown; } catch { invalidJson = true; }
  }
  const looksLikeBackup = value !== null && typeof value === 'object' && !Array.isArray(value) &&
    ['format', 'schemaVersion', 'database'].some((key) => key in (value as object));
  // Anything that is, or tries to be, a LinkShelf backup keeps its precise backup errors.
  if (invalidJson || looksLikeBackup) {
    return { source: 'LinkShelf', backup: await readBackupFile({ size: file.size, text: async () => text }) };
  }
  const external = convertExternalExport(text);
  return { source: external.source, backup: external.backup, external };
}
