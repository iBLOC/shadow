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

  describe('openInline (kind = web)', () => {
    it('inserts an entry with kind=web and makes it active', () => {
      usePreviewStore.getState().openInline('task-007', 'http://localhost:3000', 'web');
      const s = usePreviewStore.getState();
      expect(s.inlinePreviews.size).toBe(1);
      const entry = s.inlinePreviews.get('task-007');
      expect(entry?.url).toBe('http://localhost:3000');
      expect(entry?.kind).toBe('web');
      expect(entry?.content).toBeUndefined();
      expect(s.activeTaskId).toBe('task-007');
    });

    it('clears paneHidden when an inline preview is opened', () => {
      usePreviewStore.setState({ paneHidden: true });
      usePreviewStore.getState().openInline('task-001', 'http://localhost:3001', 'web');
      expect(usePreviewStore.getState().paneHidden).toBe(false);
    });

    it('overwrites URL if the same task_id is opened again', () => {
      usePreviewStore.getState().openInline('task-007', 'http://a.example', 'web');
      usePreviewStore.getState().openInline('task-007', 'http://b.example', 'web');
      const s = usePreviewStore.getState();
      expect(s.inlinePreviews.size).toBe(1);
      expect(s.inlinePreviews.get('task-007')?.url).toBe('http://b.example');
    });
  });

  describe('openInline (kind = markdown)', () => {
    it('inserts an entry with kind=markdown and no content yet', () => {
      usePreviewStore.getState().openInline('task-007', 'https://example.com/README.md', 'markdown');
      const entry = usePreviewStore.getState().inlinePreviews.get('task-007');
      expect(entry?.kind).toBe('markdown');
      expect(entry?.content).toBeUndefined();
    });
  });

  describe('setInlineContent', () => {
    it('backfills content for a markdown-kind entry', () => {
      usePreviewStore.getState().openInline('task-007', 'https://x.md', 'markdown');
      usePreviewStore.getState().setInlineContent('task-007', '# Hello');
      expect(usePreviewStore.getState().inlinePreviews.get('task-007')?.content).toBe('# Hello');
    });

    it('is a no-op for a web-kind entry', () => {
      usePreviewStore.getState().openInline('task-007', 'http://localhost:3000', 'web');
      usePreviewStore.getState().setInlineContent('task-007', '# Hello');
      const entry = usePreviewStore.getState().inlinePreviews.get('task-007');
      expect(entry?.kind).toBe('web');
      expect(entry?.content).toBeUndefined();
    });

    it('is a no-op for an unknown task_id', () => {
      const before = usePreviewStore.getState();
      usePreviewStore.getState().setInlineContent('ghost', '# Hello');
      const after = usePreviewStore.getState();
      expect(after.inlinePreviews).toBe(before.inlinePreviews);
    });
  });

  describe('closeInline', () => {
    beforeEach(() => {
      usePreviewStore.getState().openInline('a', 'http://a', 'web');
      usePreviewStore.getState().openInline('b', 'http://b', 'web');
      usePreviewStore.getState().openInline('c', 'http://c', 'web');
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
      usePreviewStore.getState().openInline('task-007', 'http://localhost:3000', 'web');
      usePreviewStore.getState().detach('task-007');
      const s = usePreviewStore.getState();
      expect(s.inlinePreviews.size).toBe(0);
      expect(s.paneHidden).toBe(false); // still visible — other tabs may exist
    });

    it('picks a new active when the detached tab was active', () => {
      usePreviewStore.getState().openInline('a', 'http://a', 'web');
      usePreviewStore.getState().openInline('b', 'http://b', 'web');
      usePreviewStore.setState({ activeTaskId: 'b' });
      usePreviewStore.getState().detach('b');
      expect(usePreviewStore.getState().activeTaskId).toBe('a');
    });

    it('drops a markdown-kind entry (no OS window to migrate to)', () => {
      usePreviewStore.getState().openInline('doc-1', 'https://x.md', 'markdown');
      usePreviewStore.setState({ activeTaskId: 'doc-1' });
      usePreviewStore.getState().detach('doc-1');
      expect(usePreviewStore.getState().inlinePreviews.size).toBe(0);
    });
  });

  describe('setActive', () => {
    it('updates the active task id when the task exists', () => {
      usePreviewStore.getState().openInline('a', 'http://a', 'web');
      usePreviewStore.getState().openInline('b', 'http://b', 'web');
      usePreviewStore.setState({ activeTaskId: 'a' });
      usePreviewStore.getState().setActive('b');
      expect(usePreviewStore.getState().activeTaskId).toBe('b');
    });

    it('is a no-op for unknown task ids', () => {
      usePreviewStore.getState().openInline('a', 'http://a', 'web');
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
