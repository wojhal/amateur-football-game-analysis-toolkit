<script lang="ts">
  import type { MatchEvent, Team } from '../../lib/types';
  import { session } from '../../lib/state/session.svelte';
  import { aggregate, pct, type PlayerStats } from '../../lib/stats/aggregate';
  import { normalizeEvent } from '../../lib/stats/normalize';
  import { playersTable, teamsTable, eventsTable } from '../../lib/export/tables';
  import { ACTION_DEFS, ACTION_ORDER } from '../../lib/recorder/action-defs';
  import { IFAB } from '../../lib/geometry/pitch';
  import { eventDetails } from '../../lib/describe';
  import type { ActionType, Point } from '../../lib/types';
  import { downloadCsv } from '../../lib/export/csv';
  import { downloadXlsx } from '../../lib/export/xlsx';
  import { downloadProjectJson } from '../../lib/export/json';
  import PitchView from '../record/PitchView.svelte';

  const project = $derived(session.project!);
  const agg = $derived(
    aggregate(session.events, project.teams, {
      videos: project.videos,
      pitch: project.pitch,
    }),
  );

  let mapType = $state<'shot' | 'pass'>('shot');

  // --- per-player map ---
  let mapPlayer = $state('');
  let playerMapType = $state<'' | ActionType>('');

  const playerMapEvents = $derived(
    !mapPlayer
      ? []
      : session.events
          .filter(
            (e) => e.playerId === mapPlayer && (!playerMapType || e.type === playerMapType),
          )
          .map((e) => {
            const n = normalizeEvent(e, project);
            if (!n) return e;
            return { ...e, start: n.start, end: e.type === 'shot' ? shotLanding(e) : n.end };
          }),
  );

  function playerLabel(p: { name: string; number: number | null }): string {
    return (p.number != null ? `${p.number} ` : '') + (p.name || '(unnamed)');
  }

  /**
   * Where a shot landed, projected onto the (normalized, attacking →) goal
   * line — only for shots placed in the goal mouth or its margin.
   */
  function shotLanding(e: MatchEvent): Point | undefined {
    const t = e.shotTarget;
    if (e.type !== 'shot' || !t || !('gx' in t)) return undefined;
    const gx = Math.min(IFAB.GOAL_WIDTH + 2, Math.max(-2, t.gx));
    return {
      x: project.pitch.length,
      y: project.pitch.width / 2 - IFAB.GOAL_WIDTH / 2 + gx,
    };
  }

  function mapEvents(team: Team): MatchEvent[] {
    return session.events
      .filter((e) => e.teamId === team.id && e.type === mapType)
      .map((e) => {
        const n = normalizeEvent(e, project);
        if (!n) return e;
        return { ...e, start: n.start, end: mapType === 'pass' ? n.end : shotLanding(e) };
      });
  }

  function rows(team: Team): { name: string; s: PlayerStats }[] {
    return team.players.map((p) => ({
      name: (p.number != null ? `${p.number} ` : '') + (p.name || '(unnamed)'),
      s: agg.perPlayer.get(p.id)!,
    }));
  }

  async function exportXlsx() {
    const t = [
      teamsTable(project, session.events),
      playersTable(project, session.events),
      eventsTable(project, session.events),
    ];
    await downloadXlsx(t, project.name);
  }
</script>

<div class="stats">
  <header class="row">
    <button onclick={() => (session.view = 'record')}>← Back to recording</button>
    <h1>
      {project.teams[0].name} {agg.perTeam.home.shots.goals} : {agg.perTeam.away.shots.goals}
      {project.teams[1].name}
    </h1>
    <div class="grow"></div>
    <span class="dim">Export:</span>
    <button onclick={() => downloadCsv(playersTable(project, session.events), project.name)}>
      Players CSV
    </button>
    <button onclick={() => downloadCsv(teamsTable(project, session.events), project.name)}>
      Teams CSV
    </button>
    <button onclick={() => downloadCsv(eventsTable(project, session.events), project.name)}>
      Events CSV
    </button>
    <button onclick={exportXlsx}>Excel</button>
    <button onclick={() => downloadProjectJson(project, session.events)}>JSON</button>
  </header>

  {#each project.teams as team (team.id)}
    {@const total = agg.perTeam[team.id]}
    <section>
      <h2 style="color: {team.color}">{team.name}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th title="completed / attempted">Passes</th>
              <th>Pass %</th>
              <th title="key passes (chance-creating; included in Passes)">Key</th>
              <th title="passes ending closer to the opponent's goal (completed / attempted)">Prog.</th>
              <th title="passes of 30 m or more (completed / attempted)">Long</th>
              <th title="expected threat: sum of zone-value deltas of completed passes (can be negative)">xT</th>
              <th>Goals</th>
              <th title="shots on target (goals included)">On tgt</th>
              <th title="total shots">Shots</th>
              <th title="expected goals: sum over all shots">xG</th>
              <th title="won / contested (both players in a duel)">Grd duels</th>
              <th title="take-ons won / attempted">Dribbles</th>
              <th title="won / attempted">Tackles</th>
              <th title="won / contested">Aerials</th>
              <th>Int</th>
              <th>Clr</th>
              <th>Saves</th>
              <th>Blk</th>
              <th title="failed passes + lost dribbles + manual turnovers">Trn</th>
              <th title="failures flagged as serious mistakes">Mist</th>
              <th>Fouls</th>
              <th>Fouled</th>
              <th>Offs</th>
            </tr>
          </thead>
          <tbody>
            {#each rows(team) as r (r.s.playerId)}
              <tr>
                <td>{r.name}</td>
                <td>{r.s.passes.won}/{r.s.passes.att}</td>
                <td>{pct(r.s.passes)}</td>
                <td>{r.s.keyPasses}</td>
                <td>{r.s.progressivePasses.won}/{r.s.progressivePasses.att}</td>
                <td>{r.s.longBalls.won}/{r.s.longBalls.att}</td>
                <td>{r.s.xt.toFixed(2)}</td>
                <td>{r.s.shots.goals}</td>
                <td>{r.s.shots.onTarget}</td>
                <td>{r.s.shots.total}</td>
                <td>{r.s.xg.toFixed(2)}</td>
                <td>{r.s.groundDuels.won}/{r.s.groundDuels.att}</td>
                <td>{r.s.dribbles.won}/{r.s.dribbles.att}</td>
                <td>{r.s.tackles.won}/{r.s.tackles.att}</td>
                <td>{r.s.aerials.won}/{r.s.aerials.att}</td>
                <td>{r.s.interceptions}</td>
                <td>{r.s.clearances}</td>
                <td>{r.s.saves}</td>
                <td>{r.s.blocks}</td>
                <td>{r.s.turnovers}</td>
                <td>{r.s.mistakes}</td>
                <td>{r.s.foulsCommitted}</td>
                <td>{r.s.foulsSuffered}</td>
                <td>{r.s.offsides}</td>
              </tr>
            {/each}
            <tr class="total">
              <td>Team total</td>
              <td>{total.passes.won}/{total.passes.att}</td>
              <td>{pct(total.passes)}</td>
              <td>{total.keyPasses}</td>
              <td>{total.progressivePasses.won}/{total.progressivePasses.att}</td>
              <td>{total.longBalls.won}/{total.longBalls.att}</td>
              <td>{total.xt.toFixed(2)}</td>
              <td>{total.shots.goals}</td>
              <td>{total.shots.onTarget}</td>
              <td>{total.shots.total}</td>
              <td>{total.xg.toFixed(2)}</td>
              <td>{total.groundDuels.won}/{total.groundDuels.att}</td>
              <td>{total.dribbles.won}/{total.dribbles.att}</td>
              <td>{total.tackles.won}/{total.tackles.att}</td>
              <td>{total.aerials.won}/{total.aerials.att}</td>
              <td>{total.interceptions}</td>
              <td>{total.clearances}</td>
              <td>{total.saves}</td>
              <td>{total.blocks}</td>
              <td>{total.turnovers}</td>
              <td>{total.mistakes}</td>
              <td>{total.foulsCommitted}</td>
              <td>{total.foulsSuffered}</td>
              <td>{total.offsides}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  {/each}

  <section>
    <div class="row">
      <h2 style="margin: 0">Maps</h2>
      <select bind:value={mapType}>
        <option value="shot">Shots</option>
        <option value="pass">Passes</option>
      </select>
      <span class="dim">Both teams normalized to attack →</span>
    </div>
    <div class="maps">
      {#each project.teams as team (team.id)}
        <div class="map">
          <h3 style="color: {team.color}">{team.name}</h3>
          <PitchView
            length={project.pitch.length}
            width={project.pitch.width}
            events={mapEvents(team)}
            teams={project.teams}
            details={(e) => eventDetails(e, project)}
          />
        </div>
      {/each}
    </div>
  </section>

  <section>
    <div class="row">
      <h2 style="margin: 0">Player map</h2>
      <select bind:value={mapPlayer}>
        <option value="">(choose a player)</option>
        {#each project.teams as team (team.id)}
          <optgroup label={team.name}>
            {#each team.players as p (p.id)}
              <option value={p.id}>{playerLabel(p)}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <select bind:value={playerMapType}>
        <option value="">All actions</option>
        {#each ACTION_ORDER as action (action)}
          <option value={action}>{ACTION_DEFS[action].label}</option>
        {/each}
      </select>
      <span class="dim">
        {mapPlayer ? `${playerMapEvents.length} events, normalized to attack →` : ''}
      </span>
    </div>
    {#if mapPlayer}
      <div class="player-map">
        <PitchView
          length={project.pitch.length}
          width={project.pitch.width}
          events={playerMapEvents}
          teams={project.teams}
          details={(e) => eventDetails(e, project)}
        />
      </div>
    {/if}
  </section>
</div>

<style>
  .stats {
    height: 100%;
    overflow: auto;
    padding: 16px 20px 60px;
  }

  header {
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  h1 {
    font-size: 18px;
    margin: 0 0 0 8px;
  }

  .grow {
    flex: 1;
  }

  section {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 14px;
  }

  .table-wrap {
    overflow-x: auto;
  }

  /* Zebra striping for readability. */
  tbody tr:nth-child(odd):not(.total) {
    background: var(--bg-raised);
  }

  tr.total td {
    font-weight: 700;
    border-top: 2px solid var(--border);
  }

  .maps {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 10px;
  }

  .map h3 {
    margin-bottom: 6px;
  }

  .player-map {
    max-width: 720px;
    margin-top: 10px;
  }
</style>
