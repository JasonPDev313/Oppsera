'use client';

import { HelpTip } from '@/components/ui/help-tip';

/**
 * Help tip for the "Change Register" sidebar button.
 * Now delegates to the generic HelpTip component (§247).
 */
export function RegisterHelpTip() {
  return (
    <HelpTip
      storageKey="oppsera:walkthrough-completed"
      title="Switch registers"
      description="Pick a different register without logging out. Your current selection is remembered for next time."
      placement="right"
      ariaLabel="Help: how to change register"
    />
  );
}
