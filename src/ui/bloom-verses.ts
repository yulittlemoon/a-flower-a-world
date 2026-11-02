import {
  VERSE_OPENING,
  VERSE_POOLS,
  type VersePhase,
} from './bloom-verses-library';

export const BLOOM_VERSES = {
  // The verse changes only when the flower becomes fully open (Bloom) or
  // fully closed (Fade).
  openAt: 0.98,
  closedAt: 0.02,
  // Bloom must move this far back from an extreme before that extreme can
  // trigger a new verse again.
  rearmDistance: 0.1,
  // Chance that a verse shows one Chinese and one English line together.
  pairChance: 0.35,
  fadeMilliseconds: 900,
} as const;

type Verse = { zh?: string; en?: string };

const hasHan = (text: string) => /[\u4e00-\u9fff]/.test(text);

function shuffled<T>(items: readonly T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

// Shuffled Chinese and English decks for one pool, reshuffled when used up so
// no line repeats until the whole pool has been shown.
function createDeck(phase: VersePhase) {
  const pool = VERSE_POOLS[phase];
  let zh: string[] = [];
  let en: string[] = [];

  function refill() {
    zh = shuffled(pool.filter(hasHan));
    en = shuffled(pool.filter((line) => !hasHan(line)));
  }

  function draw(): Verse {
    if (zh.length === 0 && en.length === 0) refill();
    if (zh.length > 0 && en.length > 0 && Math.random() < BLOOM_VERSES.pairChance) {
      return { zh: zh.pop(), en: en.pop() };
    }
    const fromZh =
      en.length === 0 || (zh.length > 0 && Math.random() < zh.length / (zh.length + en.length));
    return fromZh ? { zh: zh.pop() } : { en: en.pop() };
  }

  refill();
  return { draw };
}

export function createBloomVerses(parent: HTMLElement, initialBloom: number) {
  const element = document.createElement('div');
  element.className = 'bloom-verse';
  element.setAttribute('aria-live', 'polite');
  const zhLine = document.createElement('p');
  zhLine.className = 'bloom-verse-zh';
  const enLine = document.createElement('p');
  enLine.className = 'bloom-verse-en';
  element.append(zhLine, enLine);
  parent.append(element);

  const decks = { bloom: createDeck('bloom'), fade: createDeck('fade') };
  // Which extreme can fire next; an extreme the flower starts at is not armed.
  let openArmed = initialBloom < BLOOM_VERSES.openAt;
  let closedArmed = initialBloom > BLOOM_VERSES.closedAt;
  let pending: Verse | null = null;
  let swapTimer: number | null = null;

  function render(verse: Verse) {
    zhLine.textContent = verse.zh ?? '';
    enLine.textContent = verse.en ?? '';
    zhLine.hidden = !verse.zh;
    enLine.hidden = !verse.en;
  }

  // Fade out, swap the words, fade back in. A newer verse requested mid-fade
  // simply replaces the pending one.
  function show(verse: Verse) {
    pending = verse;
    if (swapTimer !== null) return;
    element.dataset.visible = 'false';
    swapTimer = window.setTimeout(() => {
      swapTimer = null;
      if (!pending) return;
      render(pending);
      pending = null;
      element.dataset.visible = 'true';
    }, BLOOM_VERSES.fadeMilliseconds);
  }

  function update(bloom: number) {
    if (openArmed && bloom >= BLOOM_VERSES.openAt) {
      openArmed = false;
      show(decks.bloom.draw());
    } else if (closedArmed && bloom <= BLOOM_VERSES.closedAt) {
      closedArmed = false;
      show(decks.fade.draw());
    }
    if (bloom <= BLOOM_VERSES.openAt - BLOOM_VERSES.rearmDistance) openArmed = true;
    if (bloom >= BLOOM_VERSES.closedAt + BLOOM_VERSES.rearmDistance) closedArmed = true;
  }

  render(VERSE_OPENING);
  requestAnimationFrame(() => {
    element.dataset.visible = 'true';
  });

  return {
    update,
    dispose() {
      if (swapTimer !== null) window.clearTimeout(swapTimer);
      element.remove();
    },
  };
}
