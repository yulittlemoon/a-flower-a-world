import type { FrameContext, FrameParticipant } from '../app/animation-contract';

export const BLOOM_HINT = {
  // Wait this long after the intro settles before showing the hint.
  showDelayMilliseconds: 2000,
  // If nobody has scrolled yet, pulse the hint once more after this long.
  repulseAfterMilliseconds: 10000,
} as const;

// A quiet "scroll to bloom" hint. It appears once the intro has settled,
// disappears for good on the first scroll or swipe, and pulses once more if
// the visitor still has not tried it.
export function createBloomHint(
  parent: HTMLElement,
  interactionElement: HTMLElement,
  isIntroSettled: () => boolean,
): FrameParticipant {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const element = document.createElement('div');
  element.className = 'bloom-hint';
  element.innerHTML = `
    <span class="bloom-hint-arrow" aria-hidden="true"></span>
    <span class="bloom-hint-zh">${touch ? '上滑，让花绽放' : '向下滑动，让花绽放'}</span>
    <span class="bloom-hint-en">${touch ? 'Swipe up to bloom' : 'Scroll to bloom'}</span>
  `;
  parent.append(element);

  let settledAt: number | null = null;
  let shownAt: number | null = null;
  let repulsed = false;
  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    element.dataset.state = 'hidden';
    interactionElement.removeEventListener('wheel', dismiss);
    interactionElement.removeEventListener('touchmove', dismiss);
  }

  interactionElement.addEventListener('wheel', dismiss, { passive: true });
  interactionElement.addEventListener('touchmove', dismiss, { passive: true });

  function update({ timestamp }: FrameContext) {
    if (dismissed) return;
    if (settledAt === null) {
      if (isIntroSettled()) settledAt = timestamp;
      return;
    }
    if (shownAt === null) {
      if (timestamp - settledAt < BLOOM_HINT.showDelayMilliseconds) return;
      shownAt = timestamp;
      element.dataset.state = 'visible';
      return;
    }
    if (!repulsed && timestamp - shownAt >= BLOOM_HINT.repulseAfterMilliseconds) {
      repulsed = true;
      element.dataset.state = 'pulse';
    }
  }

  return {
    update,
    dispose() {
      dismiss();
      element.remove();
    },
  };
}
