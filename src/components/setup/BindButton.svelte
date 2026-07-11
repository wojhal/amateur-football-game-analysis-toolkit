<script lang="ts">
  import type { KeyBind } from '../../lib/types';
  import { bindLabel, RESERVED_CODES } from '../../lib/input/keymap';

  interface Props {
    bind: KeyBind;
    /** Whether Shift is part of the binding (players) or ignored (actions). */
    allowShift?: boolean;
    conflict?: boolean;
    onchange: (bind: KeyBind) => void;
  }

  let { bind, allowShift = true, conflict = false, onchange }: Props = $props();

  let arming = $state(false);
  let btn: HTMLButtonElement;

  function onKeydown(e: KeyboardEvent) {
    if (!arming) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      arming = false;
      return;
    }
    if (RESERVED_CODES.has(e.code)) {
      if (e.code.startsWith('Shift')) return; // waiting for the actual key
      return;
    }
    onchange({ code: e.code, shift: allowShift && e.shiftKey });
    arming = false;
    btn.blur();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<button
  bind:this={btn}
  class:arming
  class:conflict
  title={arming ? 'Press a key (Esc to cancel)' : 'Click, then press the new key'}
  onclick={() => (arming = !arming)}
>
  {#if arming}…{:else}<kbd>{bindLabel(allowShift ? bind : { ...bind, shift: false })}</kbd>{/if}
</button>

<style>
  button {
    min-width: 46px;
    padding: 3px 6px;
  }

  button.arming {
    border-color: var(--accent);
    background: var(--accent);
    color: #0b1420;
  }

  button.conflict {
    border-color: var(--bad);
  }

  button.conflict kbd {
    color: var(--bad);
  }
</style>
