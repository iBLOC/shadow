import { describe, it, expect, beforeEach } from 'vitest';
import { usePreviewStore } from '../../src/stores/previewStore';

describe('previewStore', () => {
  beforeEach(() => {
    // Reset between tests — start from a clean inline state.
    usePreviewStore.setState({
      inlinePreviews: new Map(),
      activeTaskId: null,
      paneHidden: false,
    });
  });

  describe('openInline', () => {
    it('inserts an entry and makes it active', () => {
      usePreviewStore.getState().openInline('task-007', 'http://localhost:3000');
      const s = usePreviewStore.getState();
      expect(s.inlinePreviews.size).toBe(1);
      expect(s.inlinePreviews.get('task-007')?.url).toBe('http://localhost:3000');
      expect(s.activeTaskId).toBe('task-007');
    });

    it('clears paneHidden when an inline preview is opened', () => {
      usePreviewStore.setState({ paneHidden: true });
      usePreviewStore.getState().openInline('task-001', 'http://localhost:3001');
      expect(usePreviewStore.getState().paneHidden).toBe(false);
    });

    it('overwrites URL if the same task_id is opened again', () => {
      usePreviewStore.getState().openInline('task-007', 'http://a.example');
      usePreviewStore.getState().openInline('task-007', 'http://b.example');
      const s = usePreviewStore.getState();
      expect(s.inlinePreviews.size).toBe(1);
      expect(s.inlinePreviews.get('task-007')?.url).toBe('http://b.example');
    });
  });

  describe('closeInline', () => {
    beforeEach(() => {
      usePreviewStore.getState().openInline('a', 'http://a');
      usePreviewStore.getState().openInline('b', 'http://b');
      usePreviewStore.getState().openInline('c', 'http://c');
    });

    it('removes the entry from the map', () => {
      usePreviewStore.getState().closeInline('b');
      expect(usePreviewStore.getState().inlinePreviews.size).toBe(2);
      expect(usePreviewStore.getState().inlinePreviews.has('b')).toBe(false);
    });

    it('promotes the next entry to active when the active is closed', () => {
      usePreviewStore.setState({ activeTaskId: 'b' });
      usePreviewStore.getState().closeInline('b');
      // Either a or c becomes active — both are valid fallbacks.
      expect(['a', 'c']).toContain(usePreviewStore.getState().activeTaskId);
    });

    it('clears activeTaskId when the last entry is closed', () => {
      usePreviewStore.getState().closeInline('a');
      usePreviewStore.getState().closeInline('b');
      usePreviewStore.getState().closeInline('c');
      expect(usePreviewStore.getState().activeTaskId).toBeNull();
      expect(usePreviewStore.getState().inlinePreviews.size).toBe(0);
    });

    it('is a no-op for an unknown task_id', () => {
      const before = usePreviewStore.getState();
      usePreviewStore.getState().closeInline('does-not-exist');
      const after = usePreviewStore.getState();
      expect(after.inlinePreviews).toBe(before.inlinePreviews);
    });
  });

  describe('detach', () => {
    it('removes the entry but does NOT clear paneHidden (caller handles window)', () => {
      usePreviewStore.getState().openInline('task-007', 'http://localhost:3000');
      usePreviewStore.getState().detach('task-007');
      const s = usePreviewStore.getState();
      expect(s.inlinePreviews.size).toBe(0);
      expect(s.paneHidden).toBe(false); // still visible — other tabs may exist
    });

    it('picks a new active when the detached tab was active', () => {
      usePreviewStore.getState().openInline('a', 'http://a');
      usePreviewStore.getState().openInline('b', 'http://b');
      usePreviewStore.setState({ activeTaskId: 'b' });
      usePreviewStore.getState().detach('b');
      expect(usePreviewStore.getState().activeTaskId).toBe('a');
    });
  });

  describe('setActive', () => {
    it('updates the active task id when the task exists', () => {
      usePreviewStore.getState().openInline('a', 'http://a');
      usePreviewStore.getState().openInline('b', 'http://b');
      usePreviewStore.setState({ activeTaskId: 'a' });
      usePreviewStore.getState().setActive('b');
      expect(usePreviewStore.getState().activeTaskId).toBe('b');
    });

    it('is a no-op for unknown task ids', () => {
      usePreviewStore.getState().openInline('a', 'http://a');
      usePreviewStore.setState({ activeTaskId: 'a' });
      usePreviewStore.getState().setActive('ghost');
      expect(usePreviewStore.getState().activeTaskId).toBe('a');
    });
  });

  describe('pane visibility', () => {
    it('hidePane / showPane flip paneHidden', () => {
      expect(usePreviewStore.getState().paneHidden).toBe(false);
      usePreviewStore.getState().hidePane();
      expect(usePreviewStore.getState().paneHidden).toBe(true);
      usePreviewStore.getState().showPane();
      expect(usePreviewStore.getState().paneHidden).toBe(false);
    });

    it('togglePane flips both directions', () => {
      usePreviewStore.getState().togglePane();
      expect(usePreviewStore.getState().paneHidden).toBe(true);
      usePreviewStore.getState().togglePane();
      expect(usePreviewStore.getState().paneHidden).toBe(false);
    });
  });

  describe('setPaneWidth clamping', () => {
    it('clamps to PREVIEW_PANE_MIN_WIDTH (240) for tiny values', () => {
      usePreviewStore.getState().setPaneWidth(50);
      expect(usePreviewStore.getState().paneWidth).toBe(240);
    });

    it('clamps to 0.7 × innerWidth for huge values', () => {
      // jsdom defaults innerWidth to 1024; 0.7 × 1024 = 716.8 → 716
      usePreviewStore.getState().setPaneWidth(99999);
      const w = usePreviewStore.getState().paneWidth;
      expect(w).toBeLessThanOrEqual(1024);
      expect(w).toBeGreaterThanOrEqual(240);
    });

    it('passes through reasonable values unchanged', () => {
      usePreviewStore.getState().setPaneWidth(500);
      expect(usePreviewStore.getState().paneWidth).toBe(500);
    });
  });
});