import type { FrameContext, FrameParticipant } from '../app/animation-contract';
import { FLOWER_BLOOM } from '../geometry/flower-base';

export const BLOOM_SCROLL = {
  // Bloom change per wheel pixel; scrolling down opens, up closes.
  wheelSensitivity: 0.0012,
  // Bloom change per touch pixel; swiping up opens, down closes.
  touchSensitivity: 0.004,
  // Exponential follow rate toward the scrolled target, per second.
  followRate: 3.2,
  settleEpsilon: 0.0005,
} as const;

export function createBloomScroll(
  element: HTMLElement,
  setBloom: (bloom: number) => void,
): FrameParticipant {
  let target: number = FLOWER_BLOOM.initial;
  let current: number = FLOWER_BLOOM.initial;
  let previousTimestamp: number | null = null;
  let touchY: number | null = null;

  function nudge(delta: number) {
    target = Math.min(1, Math.max(0, target + delta));
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const pixels =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 16
        : event.deltaY;
    nudge(pixels * BLOOM_SCROLL.wheelSensitivity);
  }

  function onTouchStart(event: TouchEvent) {
    touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }

  function onTouchMove(event: TouchEvent) {
    if (touchY === null || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    nudge((touchY - y) * BLOOM_SCROLL.touchSensitivity);
    touchY = y;
  }

  function onTouchEnd() {
    touchY = null;
  }

  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchmove', onTouchMove, { passive: true });
  element.addEventListener('touchend', onTouchEnd);

  function update({ timestamp }: FrameContext) {
    const deltaSeconds =
      previousTimestamp === null
        ? 0
        : Math.min(0.1, (timestamp - previousTimestamp) / 1000);
    previousTimestamp = timestamp;
    if (Math.abs(target - current) < BLOOM_SCROLL.settleEpsilon) {
      if (current === target) return;
      current = target;
    } else {
      current +=
        (target - current) *
        (1 - Math.exp(-BLOOM_SCROLL.followRate * deltaSeconds));
    }
    setBloom(current);
  }

  function dispose() {
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchmove', onTouchMove);
    element.removeEventListener('touchend', onTouchEnd);
  }

  return { update, dispose };
}
