<script lang="ts">
  import { session } from './lib/state/session.svelte';
  import ProjectList from './components/ProjectList.svelte';
  import SetupWizard from './components/setup/SetupWizard.svelte';
  import RecordPanel from './components/record/RecordPanel.svelte';
  import { isFsAccessSupported } from './lib/project';

  const supported = isFsAccessSupported();
</script>

{#if !supported}
  <div class="unsupported">
    <div>
      <h1>Browser not supported</h1>
      <p>
        This tool needs the File System Access API to remember where your video files live.
        Please open it in <strong>Chrome</strong> or <strong>Edge</strong>.
      </p>
    </div>
  </div>
{:else if session.screen === 'projects'}
  <ProjectList />
{:else if session.screen === 'setup'}
  <SetupWizard />
{:else if session.screen === 'record'}
  <RecordPanel />
{/if}

{#if session.toastMsg}
  <div class="toast">{session.toastMsg}</div>
{/if}

<style>
  .unsupported {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
</style>
