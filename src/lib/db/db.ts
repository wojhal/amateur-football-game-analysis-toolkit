import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MatchEvent, Project } from '../types';

export type StoredEvent = MatchEvent & { projectId: string };

interface HandleRow {
  projectId: string;
  videoId: string;
  handle: FileSystemFileHandle;
}

interface AnalyzerDB extends DBSchema {
  projects: { key: string; value: Project };
  events: {
    key: [string, string];
    value: StoredEvent;
    indexes: { byProject: string };
  };
  handles: { key: [string, string]; value: HandleRow };
}

let dbPromise: Promise<IDBPDatabase<AnalyzerDB>> | null = null;

function db(): Promise<IDBPDatabase<AnalyzerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AnalyzerDB>('tartak-analizato-inator', 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        const events = db.createObjectStore('events', { keyPath: ['projectId', 'id'] });
        events.createIndex('byProject', 'projectId');
        db.createObjectStore('handles', { keyPath: ['projectId', 'videoId'] });
      },
    });
  }
  return dbPromise;
}

export async function listProjects(): Promise<Project[]> {
  const all = await (await db()).getAll('projects');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await db()).get('projects', id);
}

export async function saveProject(project: Project): Promise<void> {
  await (await db()).put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'events', 'handles'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  for (const key of await tx.objectStore('events').getAllKeys()) {
    if (key[0] === id) await tx.objectStore('events').delete(key);
  }
  for (const key of await tx.objectStore('handles').getAllKeys()) {
    if (key[0] === id) await tx.objectStore('handles').delete(key);
  }
  await tx.done;
}

export async function getEvents(projectId: string): Promise<MatchEvent[]> {
  const rows = await (await db()).getAllFromIndex('events', 'byProject', projectId);
  return rows.map(({ projectId: _p, ...e }) => e);
}

export async function putEvent(projectId: string, event: MatchEvent): Promise<void> {
  await (await db()).put('events', { ...event, projectId });
}

export async function deleteEvent(projectId: string, eventId: string): Promise<void> {
  await (await db()).delete('events', [projectId, eventId]);
}

export async function replaceEvents(projectId: string, events: MatchEvent[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('events', 'readwrite');
  for (const key of await tx.store.getAllKeys()) {
    if (key[0] === projectId) await tx.store.delete(key);
  }
  for (const e of events) {
    await tx.store.put({ ...e, projectId });
  }
  await tx.done;
}

export async function saveHandle(
  projectId: string,
  videoId: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  await (await db()).put('handles', { projectId, videoId, handle });
}

export async function getHandle(
  projectId: string,
  videoId: string,
): Promise<FileSystemFileHandle | undefined> {
  const row = await (await db()).get('handles', [projectId, videoId]);
  return row?.handle;
}
