/**
 * Collapsible Scrollbar Controller
 *
 * Keeps browser and container scrollbars visually collapsed at rest and expands them on:
 *  1. Active scrolling (`.is-scrolling`, automatically re-collapsing after idle delay)
 *  2. Pointer proximity to a scrollable container's scrollbar edge (`.scrollbar-edge-hover`)
 *
 * Designed with capture-phase scroll tracking, rAF-throttled pointer checks, and full cleanup.
 */

const SCROLL_HIDE_DELAY_MS = 1100;
const EDGE_PROXIMITY_PX = 18;
const SCROLLING_CLASS = 'is-scrolling';
const EDGE_HOVER_CLASS = 'scrollbar-edge-hover';

/**
 * Resolves DOM element targets for a scroll event (normalizing document-level scrolls).
 *
 * @param {EventTarget|null} target
 * @returns {Element[]}
 */
function getScrollTargets(target) {
  if (typeof document === 'undefined') return [];

  if (target === document || target === document.documentElement || target === document.body) {
    const targets = new Set([document.documentElement]);
    if (document.scrollingElement) targets.add(document.scrollingElement);
    if (target === document.body) targets.add(document.body);
    return Array.from(targets);
  }

  return target instanceof Element ? [target] : [];
}

/**
 * Checks whether an element actually renders a scrollable track on the given axis.
 *
 * @param {Element} el
 * @param {'x'|'y'} axis
 * @returns {boolean}
 */
function isScrollableAxis(el, axis) {
  if (!el || typeof window === 'undefined') return false;
  if (el.classList?.contains('scrollbar-none')) return false;

  const hasOverflow =
    axis === 'y'
      ? el.scrollHeight > el.clientHeight + 1
      : el.scrollWidth > el.clientWidth + 1;

  if (!hasOverflow) return false;

  const style = window.getComputedStyle(el);
  const overflowVal = axis === 'y' ? style.overflowY : style.overflowX;
  return overflowVal === 'auto' || overflowVal === 'scroll';
}

/**
 * Attaches global listeners to expand scrollbars on scroll or scrollbar-edge hover
 * and collapse them automatically when idle.
 *
 * @param {Object} [options]
 * @param {number} [options.hideDelayMs=1100] - Delay in ms after scroll stops before collapsing
 * @param {number} [options.edgeProximityPx=18] - Hover zone width in px near scrollable edges
 * @returns {() => void} Cleanup function removing all listeners and timers
 */
export function initCollapsibleScrollbars({
  hideDelayMs = SCROLL_HIDE_DELAY_MS,
  edgeProximityPx = EDGE_PROXIMITY_PX,
} = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const scrollTimers = new WeakMap();
  const activeScrollElements = new Set();
  const activeHoverElements = new Set();
  let rafId = null;
  let isRafScheduled = false;
  let lastPointerEvent = null;

  const markScrolling = (el) => {
    el.classList.add(SCROLLING_CLASS);
    activeScrollElements.add(el);

    const existingTimer = scrollTimers.get(el);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      el.classList.remove(SCROLLING_CLASS);
      activeScrollElements.delete(el);
      scrollTimers.delete(el);
    }, hideDelayMs);

    scrollTimers.set(el, timer);
  };

  const handleScroll = (event) => {
    const targets = getScrollTargets(event.target);
    for (const el of targets) {
      markScrolling(el);
    }
  };

  const updateEdgeHover = () => {
    isRafScheduled = false;
    rafId = null;
    const e = lastPointerEvent;
    if (!e) return;

    // Preserve active scrollbar expansion while dragging a scrollbar thumb
    if ((e.buttons & 1) !== 0 && activeHoverElements.size > 0) {
      return;
    }

    const nextHoverElements = new Set();

    // 1. Check root viewport scrollbar edges
    const docEl = document.scrollingElement || document.documentElement;
    if (docEl && !docEl.classList?.contains('scrollbar-none')) {
      const canScrollY = docEl.scrollHeight > docEl.clientHeight + 1;
      const canScrollX = docEl.scrollWidth > docEl.clientWidth + 1;
      const nearRight = canScrollY && window.innerWidth - e.clientX <= edgeProximityPx;
      const nearBottom = canScrollX && window.innerHeight - e.clientY <= edgeProximityPx;

      if (nearRight || nearBottom) {
        nextHoverElements.add(document.documentElement);
        nextHoverElements.add(docEl);
      }
    }

    // 2. Check scrollable containers under pointer
    let node = e.target instanceof Element ? e.target : null;
    while (node && node !== document.documentElement) {
      const maybeScrollY = node.scrollHeight > node.clientHeight + 1;
      const maybeScrollX = node.scrollWidth > node.clientWidth + 1;

      if (maybeScrollY || maybeScrollX) {
        const rect = node.getBoundingClientRect();
        const nearRightEdge =
          maybeScrollY &&
          e.clientX >= rect.right - edgeProximityPx &&
          e.clientX <= rect.right + 2 &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        const nearBottomEdge =
          maybeScrollX &&
          e.clientY >= rect.bottom - edgeProximityPx &&
          e.clientY <= rect.bottom + 2 &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right;

        if (
          (nearRightEdge && isScrollableAxis(node, 'y')) ||
          (nearBottomEdge && isScrollableAxis(node, 'x'))
        ) {
          nextHoverElements.add(node);
        }
      }

      node = node.parentElement;
    }

    for (const prevEl of activeHoverElements) {
      if (!nextHoverElements.has(prevEl)) {
        prevEl.classList.remove(EDGE_HOVER_CLASS);
      }
    }
    for (const nextEl of nextHoverElements) {
      if (!activeHoverElements.has(nextEl)) {
        nextEl.classList.add(EDGE_HOVER_CLASS);
      }
    }

    activeHoverElements.clear();
    for (const el of nextHoverElements) {
      activeHoverElements.add(el);
    }
  };

  const handleMouseMove = (event) => {
    lastPointerEvent = event;
    if (!isRafScheduled) {
      isRafScheduled = true;
      rafId = window.requestAnimationFrame(updateEdgeHover);
    }
  };

  const clearEdgeHover = () => {
    lastPointerEvent = null;
    if (isRafScheduled && rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
    isRafScheduled = false;
    rafId = null;
    for (const el of activeHoverElements) {
      el.classList.remove(EDGE_HOVER_CLASS);
    }
    activeHoverElements.clear();
  };

  window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  document.addEventListener('mouseleave', clearEdgeHover);
  window.addEventListener('blur', clearEdgeHover);

  return () => {
    window.removeEventListener('scroll', handleScroll, { capture: true });
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseleave', clearEdgeHover);
    window.removeEventListener('blur', clearEdgeHover);

    if (isRafScheduled && rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
    isRafScheduled = false;
    rafId = null;

    for (const el of activeScrollElements) {
      const timer = scrollTimers.get(el);
      if (timer) window.clearTimeout(timer);
      el.classList.remove(SCROLLING_CLASS);
    }
    activeScrollElements.clear();

    for (const el of activeHoverElements) {
      el.classList.remove(EDGE_HOVER_CLASS);
    }
    activeHoverElements.clear();
  };
}

export default initCollapsibleScrollbars;

