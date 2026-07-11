<script lang="ts">
  import type { Project } from '../lib/types';
  import * as db from '../lib/db/db';
  import { session } from '../lib/state/session.svelte';
  import { createProject } from '../lib/project';
  import { downloadProjectJson, parseProjectDump } from '../lib/export/json';

  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let missingVideos = $state<string[]>([]);
  let relinkOpen = $state(false);

  async function refresh() {
    loading = true;
    projects = await db.listProjects();
    loading = false;
  }

  void refresh();

  function newProject() {
    session.closeProject();
    session.project = createProject();
    session.events = [];
    session.screen = 'setup';
  }

  async function openProject(p: Project) {
    const missing = await session.enterProject(p);
    if (missing.length > 0) {
      missingVideos = missing;
      relinkOpen = true;
    } else {
      session.screen = 'record';
    }
  }

  async function relink(videoId: string) {
    const ok = await session.relinkVideo(videoId);
    if (ok) missingVideos = missingVideos.filter((id) => id !== videoId);
    if (missingVideos.length === 0) {
      relinkOpen = false;
      session.screen = 'record';
    }
  }

  function continueAnyway() {
    relinkOpen = false;
    session.screen = 'record';
  }

  async function removeProject(p: Project) {
    if (!window.confirm(`Delete project "${p.name}" and all its recorded events?`)) return;
    await db.deleteProject(p.id);
    await refresh();
  }

  async function exportProject(p: Project) {
    const events = await db.getEvents(p.id);
    downloadProjectJson(p, events);
  }

  let importInput: HTMLInputElement;

  async function importProject(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const dump = parseProjectDump(await file.text());
      let project = dump.project;
      const existing = await db.getProject(project.id);
      if (existing) {
        const overwrite = window.confirm(
          `A project "${existing.name}" already exists (same origin as this file).\n\n` +
            'OK — overwrite it with the imported version.\n' +
            'Cancel — keep both (import as a separate copy).',
        );
        if (!overwrite) {
          project = { ...project, id: crypto.randomUUID(), name: `${project.name} (imported)` };
        }
      }
      await db.saveProject(project);
      await db.replaceEvents(project.id, dump.events);
      await refresh();
      session.toast(
        'Project imported — open it and locate the video files (YouTube clips work right away)',
      );
    } catch (err) {
      console.error(err);
      session.toast('Import failed: not a valid project file');
    }
  }

  function videoName(id: string): string {
    return session.project?.videos.find((v) => v.id === id)?.fileName ?? id;
  }
</script>

<div class="wrap">
  <header>
    <h1>⚽ Tartak Analizato-inator</h1>
    <p class="dim">Manual match analysis — everything stays on your machine.</p>
  </header>

  <div class="row actions">
    <button class="primary" onclick={newProject}>+ New project</button>
    <button onclick={() => importInput.click()}>Import project (.json)</button>
    <input
      type="file"
      accept="application/json"
      bind:this={importInput}
      onchange={importProject}
      style="display:none"
    />
  </div>

  {#if loading}
    <p class="dim">Loading…</p>
  {:else if projects.length === 0}
    <p class="dim">No projects yet. Create one to get started.</p>
  {:else}
    <ul class="projects">
      {#each projects as p (p.id)}
        <li>
          <button class="open" onclick={() => openProject(p)}>
            <span class="name">{p.name}</span>
            <span class="dim">
              {p.teams[0].name} vs {p.teams[1].name} · {p.videos.length}
              video{p.videos.length === 1 ? '' : 's'} · {new Date(p.createdAt).toLocaleDateString()}
            </span>
          </button>
          <button
            onclick={() => exportProject(p)}
            title="Export as a .json file — share it with anyone; they use “Import project” to load it"
          >
            Export
          </button>
          <button class="danger" onclick={() => removeProject(p)} title="Delete project">✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if relinkOpen}
  <div class="modal-backdrop">
    <div class="modal">
      <h2>Locate video files</h2>
      <p class="dim">
        Some video files could not be opened (moved, renamed, or imported from another machine).
        Point the app at them again:
      </p>
      {#each missingVideos as id (id)}
        <div class="row relink-row">
          <span class="grow">{videoName(id)}</span>
          <button class="primary" onclick={() => relink(id)}>Locate…</button>
        </div>
      {/each}
      <div class="row" style="justify-content: flex-end; margin-top: 12px">
        <button onclick={continueAnyway}>Continue without video</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .wrap {
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 24px;
    height: 100%;
    overflow: auto;
  }

  header {
    margin-bottom: 24px;
  }

  .actions {
    margin-bottom: 20px;
  }

  .projects {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .projects li {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .open {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    padding: 10px 14px;
    background: var(--bg-panel);
  }

  .name {
    font-weight: 600;
    font-size: 15px;
  }

  .grow {
    flex: 1;
  }

  .relink-row {
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
</style>
