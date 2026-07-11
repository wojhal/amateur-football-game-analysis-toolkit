import type { MatchEvent, Project } from '../types';
import {
  emptyDraft,
  reduceDraft,
  type DraftInput,
  type DraftState,
} from '../recorder/draft-machine';
import { buildKeymap, DEFAULT_ACTION_BINDINGS, type KeyTarget } from '../input/keymap';
import * as db from '../db/db';
import { migrateInterceptions } from '../migrate';
import { videoCtl } from './videoctl.svelte';

export type Screen = 'projects' | 'setup' | 'record';

/** Which events the timeline and the pitch overlay display. */
export type EventFilter = 'all' | 'home' | 'away' | 'last';

type UndoOp =
  | { type: 'add'; event: MatchEvent }
  | { type: 'delete'; event: MatchEvent }
  | { type: 'update'; before: MatchEvent; after: MatchEvent };

class Session {
  screen = $state<Screen>('projects');
  /** Where the setup wizard should return to when done. */
  setupReturn = $state<'projects' | 'record'>('projects');
  project = $state<Project | null>(null);
  events = $state<MatchEvent[]>([]);
  /** videoId -> object URL for videos that resolved to a readable file. */
  videoUrls = $state<Record<string, string>>({});
  currentVideoId = $state<string | null>(null);
  view = $state<'record' | 'stats'>('record');

  draft = $state<DraftState>(emptyDraft());
  draftError = $state('');
  eventFilter = $state<EventFilter>('all');
  eventsBrowserOpen = $state(false);
  lastEventId = $state<string | null>(null);
  editingEvent = $state<MatchEvent | null>(null);

  undoStack = $state<UndoOp[]>([]);
  redoStack = $state<UndoOp[]>([]);

  toastMsg = $state('');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private errorTimer: ReturnType<typeof setTimeout> | undefined;

  keymap: Map<string, KeyTarget> = $derived(
    this.project ? buildKeymap(this.project) : new Map(),
  );

  toast(msg: string): void {
    this.toastMsg = msg;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastMsg = ''), 3500);
  }

  private flashError(msg: string): void {
    this.draftError = msg;
    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => (this.draftError = ''), 2500);
  }

  /** Route an input through the draft state machine; commit if it completes. */
  dispatch(input: DraftInput): void {
    const result = reduceDraft(this.draft, input);
    this.draft = result.state;
    if (result.error) this.flashError(result.error);
    else this.draftError = '';
    if (result.commit) {
      const event: MatchEvent = { id: crypto.randomUUID(), ...result.commit };
      this.events.push(event);
      this.lastEventId = event.id;
      this.pushUndo({ type: 'add', event });
      this.persistEvent(event);
    }
  }

  cancelDraft(): void {
    this.draft = emptyDraft();
    this.draftError = '';
  }

  private pushUndo(op: UndoOp): void {
    this.undoStack.push(op);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  private persistEvent(event: MatchEvent): void {
    if (!this.project) return;
    db.putEvent(this.project.id, $state.snapshot(event) as MatchEvent).catch((err) => {
      console.error(err);
      this.toast('Failed to save event to browser storage');
    });
  }

  private unpersistEvent(eventId: string): void {
    if (!this.project) return;
    db.deleteEvent(this.project.id, eventId).catch((err) => {
      console.error(err);
      this.toast('Failed to update browser storage');
    });
  }

  deleteEvent(event: MatchEvent): void {
    const snapshot = $state.snapshot(event) as MatchEvent;
    this.events = this.events.filter((e) => e.id !== event.id);
    this.pushUndo({ type: 'delete', event: snapshot });
    this.unpersistEvent(event.id);
    if (this.editingEvent?.id === event.id) this.editingEvent = null;
  }

  updateEvent(before: MatchEvent, after: MatchEvent): void {
    const i = this.events.findIndex((e) => e.id === before.id);
    if (i === -1) return;
    this.events[i] = after;
    this.pushUndo({
      type: 'update',
      before: $state.snapshot(before) as MatchEvent,
      after: $state.snapshot(after) as MatchEvent,
    });
    this.persistEvent(after);
  }

  undo(): void {
    const op = this.undoStack.pop();
    if (!op) return;
    this.redoStack.push(op);
    this.applyInverse(op);
  }

  redo(): void {
    const op = this.redoStack.pop();
    if (!op) return;
    this.undoStack.push(op);
    this.applyForward(op);
  }

  private applyInverse(op: UndoOp): void {
    switch (op.type) {
      case 'add':
        this.events = this.events.filter((e) => e.id !== op.event.id);
        this.unpersistEvent(op.event.id);
        break;
      case 'delete':
        this.events.push(op.event);
        this.persistEvent(op.event);
        break;
      case 'update': {
        const i = this.events.findIndex((e) => e.id === op.before.id);
        if (i !== -1) this.events[i] = op.before;
        this.persistEvent(op.before);
        break;
      }
    }
  }

  private applyForward(op: UndoOp): void {
    switch (op.type) {
      case 'add':
        this.events.push(op.event);
        this.persistEvent(op.event);
        break;
      case 'delete':
        this.events = this.events.filter((e) => e.id !== op.event.id);
        this.unpersistEvent(op.event.id);
        break;
      case 'update': {
        const i = this.events.findIndex((e) => e.id === op.after.id);
        if (i !== -1) this.events[i] = op.after;
        this.persistEvent(op.after);
        break;
      }
    }
  }

  saveProjectMeta(): void {
    if (!this.project) return;
    db.saveProject($state.snapshot(this.project) as Project).catch((err) => {
      console.error(err);
      this.toast('Failed to save project to browser storage');
    });
  }

  /** Enter a project: load events + resolve video files. Returns missing videoIds. */
  async enterProject(project: Project): Promise<string[]> {
    this.closeProject();
    // Projects saved before newer actions existed get default keys for them.
    project.actionBindings = { ...DEFAULT_ACTION_BINDINGS, ...project.actionBindings };
    this.project = project;
    const raw = await db.getEvents(project.id);
    const mig = migrateInterceptions(raw, project.videos);
    this.events = mig.events;
    if (mig.changed.length > 0 || mig.removedIds.length > 0) {
      try {
        for (const e of mig.changed) await db.putEvent(project.id, e);
        for (const id of mig.removedIds) await db.deleteEvent(project.id, id);
        this.toast(
          `Migrated: ${mig.removedIds.length} interception event(s) merged into failed passes`,
        );
      } catch (err) {
        console.error('migration persist failed', err);
      }
    }
    const missing: string[] = [];
    for (const video of project.videos) {
      if (video.sourceType === 'youtube') continue; // streamed, nothing to resolve
      const ok = await this.resolveVideo(video.id);
      if (!ok) missing.push(video.id);
    }
    const first = [...project.videos].sort((a, b) => a.order - b.order)[0];
    this.currentVideoId = first ? first.id : null;
    this.undoStack = [];
    this.redoStack = [];
    this.draft = emptyDraft();
    this.view = 'record';
    return missing;
  }

  /** Try to produce an object URL for a stored video handle. */
  async resolveVideo(videoId: string): Promise<boolean> {
    if (!this.project) return false;
    const video = this.project.videos.find((v) => v.id === videoId);
    if (!video) return false;
    if (video.sourceType === 'youtube') return true;
    try {
      const handle = await db.getHandle(this.project.id, videoId);
      if (!handle) return false;
      let perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'prompt') perm = await handle.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return false;
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      const old = this.videoUrls[videoId];
      if (old) URL.revokeObjectURL(old);
      this.videoUrls[videoId] = url;
      if (video.duration === 0) {
        const duration = await probeDuration(url);
        if (duration > 0) {
          video.duration = duration;
          this.saveProjectMeta();
        }
      }
      return true;
    } catch (err) {
      console.error('resolveVideo failed', err);
      return false;
    }
  }

  /** Ask the user to locate a video file again; verifies name/size. */
  async relinkVideo(videoId: string): Promise<boolean> {
    if (!this.project) return false;
    const video = this.project.videos.find((v) => v.id === videoId);
    if (!video || video.sourceType === 'youtube') return false;
    const picked = await window
      .showOpenFilePicker({
        types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.m4v', '.webm', '.mov'] } }],
      })
      .catch(() => null);
    if (!picked || !picked[0]) return false;
    const handle = picked[0];
    const file = await handle.getFile();
    if (file.name !== video.fileName || file.size !== video.fileSize) {
      const ok = window.confirm(
        `Selected file "${file.name}" (${file.size} B) does not match the original ` +
          `"${video.fileName}" (${video.fileSize} B). Use it anyway?`,
      );
      if (!ok) return false;
      video.fileName = file.name;
      video.fileSize = file.size;
      video.duration = 0;
      this.saveProjectMeta();
    }
    await db.saveHandle(this.project.id, videoId, handle);
    return this.resolveVideo(videoId);
  }

  closeProject(): void {
    for (const url of Object.values(this.videoUrls)) URL.revokeObjectURL(url);
    this.videoUrls = {};
    this.project = null;
    this.events = [];
    this.currentVideoId = null;
    this.draft = emptyDraft();
    this.undoStack = [];
    this.redoStack = [];
    this.editingEvent = null;
    this.lastEventId = null;
    videoCtl.videoId = null;
    videoCtl.el = null;
    videoCtl.adapter = null;
  }
}

export async function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = el.duration;
      el.src = '';
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.onerror = () => resolve(0);
    el.src = url;
  });
}

export const session = new Session();
