/**
 * Collapsible Scrollbar Controller Unit Tests
 *
 * Verifies that:
 *  1. Scrolling an element expands its scrollbar (`.is-scrolling`) and auto-collapses after idle delay.
 *  2. Continuous scrolling resets the collapse timer without flickering.
 *  3. Document-level scroll events expand the root viewport scrollbar (`document.documentElement`).
 *  4. Hovering near a scrollable edge adds `.scrollbar-edge-hover` and removes it when leaving.
 *  5. Elements marked `.scrollbar-none` are excluded from edge-hover expansion.
 *  6. Cleanup removes listeners, clears classes, and cancels pending timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initCollapsibleScrollbars } from '@/utils/collapsibleScrollbar';

describe('initCollapsibleScrollbars', () => {
  let cleanup;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  it('adds .is-scrolling on element scroll and collapses after idle delay', () => {
    cleanup = initCollapsibleScrollbars({ hideDelayMs: 1000 });

    const container = document.createElement('div');
    document.body.appendChild(container);

    container.dispatchEvent(new Event('scroll', { bubbles: false }));
    expect(container.classList.contains('is-scrolling')).toBe(true);

    vi.advanceTimersByTime(999);
    expect(container.classList.contains('is-scrolling')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(container.classList.contains('is-scrolling')).toBe(false);
  });

  it('resets the collapse timer when consecutive scroll events occur', () => {
    cleanup = initCollapsibleScrollbars({ hideDelayMs: 1000 });

    const container = document.createElement('div');
    document.body.appendChild(container);

    container.dispatchEvent(new Event('scroll', { bubbles: false }));
    vi.advanceTimersByTime(700);
    expect(container.classList.contains('is-scrolling')).toBe(true);

    // Another scroll resets the 1000ms timer
    container.dispatchEvent(new Event('scroll', { bubbles: false }));
    vi.advanceTimersByTime(700);
    expect(container.classList.contains('is-scrolling')).toBe(true);

    vi.advanceTimersByTime(300);
    expect(container.classList.contains('is-scrolling')).toBe(false);
  });

  it('marks document.documentElement on document scroll', () => {
    cleanup = initCollapsibleScrollbars({ hideDelayMs: 800 });

    document.dispatchEvent(new Event('scroll'));
    expect(document.documentElement.classList.contains('is-scrolling')).toBe(true);

    vi.advanceTimersByTime(800);
    expect(document.documentElement.classList.contains('is-scrolling')).toBe(false);
  });

  it('expands scrollbar when pointer hovers near a scrollable right edge and collapses on move away', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    cleanup = initCollapsibleScrollbars({ edgeProximityPx: 18 });

    const panel = document.createElement('div');
    panel.style.overflowY = 'auto';
    Object.defineProperty(panel, 'scrollHeight', { value: 600, configurable: true });
    Object.defineProperty(panel, 'clientHeight', { value: 200, configurable: true });
    panel.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      width: 300,
      height: 200,
    });
    document.body.appendChild(panel);

    // Move near right edge (x = 290, within 18px of right = 300)
    panel.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 290, clientY: 100 })
    );
    expect(panel.classList.contains('scrollbar-edge-hover')).toBe(true);

    // Move away into the middle of the panel
    panel.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 100 })
    );
    expect(panel.classList.contains('scrollbar-edge-hover')).toBe(false);
  });

  it('does not add .scrollbar-edge-hover to .scrollbar-none elements', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });

    cleanup = initCollapsibleScrollbars({ edgeProximityPx: 18 });

    const strip = document.createElement('div');
    strip.className = 'scrollbar-none';
    strip.style.overflowX = 'auto';
    Object.defineProperty(strip, 'scrollWidth', { value: 800, configurable: true });
    Object.defineProperty(strip, 'clientWidth', { value: 300, configurable: true });
    strip.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 300,
      bottom: 40,
      width: 300,
      height: 40,
    });
    document.body.appendChild(strip);

    strip.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 35 })
    );
    expect(strip.classList.contains('scrollbar-edge-hover')).toBe(false);
  });

  it('cleans up classes and stops handling events after teardown', () => {
    cleanup = initCollapsibleScrollbars({ hideDelayMs: 1000 });

    const container = document.createElement('div');
    document.body.appendChild(container);

    container.dispatchEvent(new Event('scroll', { bubbles: false }));
    expect(container.classList.contains('is-scrolling')).toBe(true);

    cleanup();
    cleanup = null;

    expect(container.classList.contains('is-scrolling')).toBe(false);

    container.dispatchEvent(new Event('scroll', { bubbles: false }));
    expect(container.classList.contains('is-scrolling')).toBe(false);
  });
});

