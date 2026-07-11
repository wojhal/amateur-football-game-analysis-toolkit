<script lang="ts">
  import type { Team, VideoRef } from '../../lib/types';
  import { session, probeDuration } from '../../lib/state/session.svelte';
  import { createPlayer, createVideoRef, createYouTubeVideoRef } from '../../lib/project';
  import { parseYouTubeId } from '../../lib/video/youtube';
  import { clampPitchLength, clampPitchWidth, IFAB } from '../../lib/geometry/pitch';
  import { findConflicts, bindKey, keyLabel } from '../../lib/input/keymap';
  import { ACTION_DEFS, ACTION_ORDER } from '../../lib/recorder/action-defs';
  import { formatVideoTime } from '../../lib/video/playlist';
  import * as db from '../../lib/db/db';
  import PitchView from '../record/PitchView.svelte';
  import BindButton from './BindButton.svelte';

  const project = $derived(session.project!);
  const conflicts = $derived(project ? findConflicts(project) : new Map<string, string[]>());
  const editing = session.setupReturn === 'record';

  let busy = $state(false);

  async function addVideos() {
    const picked = await window
      .showOpenFilePicker({
        multiple: true,
        types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.m4v', '.webm', '.mov'] } }],
      })
      .catch(() => null);
    if (!picked) return;
    busy = true;
    try {
      for (const handle of picked) {
        const file = await handle.getFile();
        const ref = createVideoRef(file.name, file.size, project.videos.length);
        const url = URL.createObjectURL(file);
        ref.duration = await probeDuration(url);
        URL.revokeObjectURL(url);
        project.videos.push(ref);
        await db.saveHandle(project.id, ref.id, handle);
      }
    } finally {
      busy = false;
    }
  }

  function addYouTube() {
    const input = window.prompt('Paste a YouTube video URL (or the 11-character video id):');
    if (!input) return;
    const id = parseYouTubeId(input);
    if (!id) {
      session.toast('That does not look like a YouTube video URL');
      return;
    }
    project.videos.push(createYouTubeVideoRef(id, project.videos.length));
  }

  function removeVideo(v: VideoRef) {
    project.videos = project.videos.filter((x) => x.id !== v.id);
    project.videos.forEach((x, i) => (x.order = i));
  }

  function moveVideo(v: VideoRef, delta: number) {
    const sorted = [...project.videos].sort((a, b) => a.order - b.order);
    const i = sorted.indexOf(v);
    const j = i + delta;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((x, idx) => (x.order = idx));
  }

  function addPlayer(team: Team) {
    const usedDefaults = team.players.length;
    team.players.push(createPlayer(team.id, usedDefaults));
  }

  function removePlayer(team: Team, id: string) {
    team.players = team.players.filter((p) => p.id !== id);
  }

  const sortedVideos = $derived([...project.videos].sort((a, b) => a.order - b.order));

  function validate(): string | null {
    if (!project.name.trim()) return 'Give the project a name';
    if (project.videos.length === 0) return 'Add at least one video';
    for (const t of project.teams) {
      if (t.players.length === 0) return `Add at least one player to ${t.name}`;
    }
    if (conflicts.size > 0) return 'Resolve the key binding conflicts (marked red)';
    return null;
  }

  async function finish() {
    const err = validate();
    if (err) {
      session.toast(err);
      return;
    }
    session.saveProjectMeta();
    if (editing) {
      // Videos added in settings don't have an object URL yet — resolve them now.
      for (const v of project.videos) {
        if (v.sourceType !== 'youtube' && !session.videoUrls[v.id]) {
          await session.resolveVideo(v.id);
        }
      }
      if (!session.currentVideoId && project.videos.length > 0) {
        session.currentVideoId = sortedVideos[0].id;
      }
      session.screen = 'record';
      return;
    }
    busy = true;
    const missing = await session.enterProject($state.snapshot(project));
    busy = false;
    if (missing.length > 0) session.toast('Some videos could not be opened — use Locate in the player');
    session.screen = 'record';
  }

  async function discard() {
    if (editing) {
      session.screen = 'record';
      return;
    }
    if (window.confirm('Discard this new project?')) {
      await db.deleteProject(project.id);
      session.closeProject();
      session.screen = 'projects';
    }
  }
</script>

<div class="wrap">
  <header class="row">
    <h1>{editing ? 'Project settings' : 'New project'}</h1>
    <div class="grow"></div>
    <button onclick={discard}>{editing ? 'Back' : 'Discard'}</button>
    <button class="primary" onclick={finish} disabled={busy}>
      {editing ? 'Save & return' : 'Start recording →'}
    </button>
  </header>

  <section>
    <h2>1. Match</h2>
    <div class="row">
      <label for="pname">Project name</label>
      <input id="pname" type="text" bind:value={project.name} style="width: 280px" />
    </div>
  </section>

  <section>
    <h2>2. Pitch size</h2>
    <div class="pitch-setup">
      <div class="fields">
        <div class="row">
          <label for="plen">Length (m)</label>
          <input
            id="plen"
            type="number"
            min={IFAB.MIN_LENGTH}
            max={IFAB.MAX_LENGTH}
            bind:value={project.pitch.length}
            onchange={() => (project.pitch.length = clampPitchLength(project.pitch.length || 105))}
          />
        </div>
        <div class="row">
          <label for="pwid">Width (m)</label>
          <input
            id="pwid"
            type="number"
            min={IFAB.MIN_WIDTH}
            max={IFAB.MAX_WIDTH}
            bind:value={project.pitch.width}
            onchange={() => (project.pitch.width = clampPitchWidth(project.pitch.width || 68))}
          />
        </div>
        <p class="dim">
          Penalty box, center circle and goals keep their official IFAB size whatever
          the pitch dimensions.
        </p>
      </div>
      <div class="preview">
        <PitchView length={project.pitch.length || 105} width={project.pitch.width || 68} />
      </div>
    </div>
  </section>

  <section>
    <h2>3. Videos</h2>
    <div class="row">
      <button onclick={addVideos} disabled={busy}>+ Add video file(s)</button>
      <button onclick={addYouTube} disabled={busy}>+ Add YouTube link</button>
      <span class="dim">YouTube clips stream from the internet; the video owner must allow embedding.</span>
    </div>
    {#if sortedVideos.length > 0}
      <table style="margin-top: 10px">
        <thead>
          <tr>
            <th>#</th><th>File</th><th>Label</th><th>Kickoff at (s)</th>
            <th>Duration</th><th>{project.teams[0].name} attacks</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#each sortedVideos as v (v.id)}
            <tr>
              <td>
                <button onclick={() => moveVideo(v, -1)} title="Move up">↑</button>
                <button onclick={() => moveVideo(v, 1)} title="Move down">↓</button>
              </td>
              <td class="dim">
                {#if v.sourceType === 'youtube'}<span title="YouTube">▶</span>{/if}
                {v.fileName}
              </td>
              <td><input type="text" bind:value={v.periodLabel} style="width: 90px" /></td>
              <td>
                <input type="number" min="0" bind:value={v.kickoffOffset} title="Seconds into the file where play starts" />
              </td>
              <td class="dim">{v.duration ? formatVideoTime(v.duration) : '?'}</td>
              <td>
                <button onclick={() => (v.homeAttack = v.homeAttack === 'ltr' ? 'rtl' : 'ltr')}>
                  {v.homeAttack === 'ltr' ? '→ right' : '← left'}
                </button>
              </td>
              <td><button class="danger" onclick={() => removeVideo(v)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section>
    <h2>4. Squads</h2>
    <p class="dim">
      Click a key button, then press the new key. Team 1 defaults to
      <kbd>1</kbd>–<kbd>0</kbd> <kbd>U</kbd> <kbd>I</kbd> <kbd>O</kbd> <kbd>P</kbd>
      <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> <kbd>N</kbd> <kbd>M</kbd>; team 2 uses the
      same keys with <kbd>⇧ Shift</kbd>.
    </p>
    <div class="teams">
      {#each project.teams as team (team.id)}
        <div class="team" style="--team: {team.color}">
          <div class="row team-head">
            <input type="color" bind:value={team.color} title="Team color" />
            <input type="text" bind:value={team.name} style="flex: 1; font-weight: 600" />
          </div>
          {#each team.players as p (p.id)}
            <div class="row player">
              <BindButton
                bind={p.bind}
                conflict={conflicts.has(bindKey(p.bind))}
                onchange={(b) => (p.bind = b)}
              />
              <input
                type="number"
                min="1"
                max="99"
                placeholder="№"
                bind:value={p.number}
                style="width: 3.4em"
              />
              <input type="text" placeholder="Player name" bind:value={p.name} style="flex: 1" />
              <button class="danger" onclick={() => removePlayer(team, p.id)}>✕</button>
            </div>
          {/each}
          <button onclick={() => addPlayer(team)} style="margin-top: 6px">+ Add player</button>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>5. Action keys</h2>
    <div class="actions-grid">
      {#each ACTION_ORDER as action (action)}
        <div class="row">
          <BindButton
            bind={{ code: project.actionBindings[action], shift: false }}
            allowShift={false}
            conflict={conflicts.has(project.actionBindings[action])}
            onchange={(b) => (project.actionBindings[action] = b.code)}
          />
          <span>{ACTION_DEFS[action].label}</span>
        </div>
      {/each}
    </div>
    {#if conflicts.size > 0}
      <div class="conflicts">
        {#each [...conflicts] as [key, owners] (key)}
          <p>⚠ <kbd>{keyLabel(key.replace('S+', '⇧'))}</kbd> is bound to: {owners.join(', ')}</p>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .wrap {
    max-width: 900px;
    margin: 0 auto;
    padding: 28px 24px 80px;
    height: 100%;
    overflow: auto;
  }

  header {
    margin-bottom: 20px;
  }

  .grow {
    flex: 1;
  }

  section {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 16px;
  }

  .pitch-setup {
    display: flex;
    gap: 20px;
    align-items: stretch;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 260px;
  }

  .preview {
    flex: 1;
    min-height: 180px;
  }

  .teams {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .team {
    border: 1px solid var(--team);
    border-radius: 8px;
    padding: 10px;
  }

  .team-head {
    margin-bottom: 8px;
  }

  .player {
    margin-bottom: 4px;
  }

  input[type='color'] {
    width: 34px;
    height: 28px;
    padding: 2px;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .conflicts {
    margin-top: 10px;
    color: var(--bad);
  }

  .conflicts p {
    margin: 2px 0;
  }
</style>
