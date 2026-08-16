import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DelegateToPeerDialog } from '../../src/components/DelegateToPeerDialog';
import * as prefrontalClient from '../../src/lib/prefrontalClient';

vi.mock('../../src/lib/prefrontalClient', () => ({
  prefrontalClient: {
    listA2APeers: vi.fn(),
    registerA2APeer: vi.fn(),
    delegateToPeer: vi.fn(),
  },
}));

const mockPeers = [
  {
    id: 'peer-1',
    url: 'http://192.168.1.100:8082',
    name: 'Home Server',
    reachable: true,
    last_seen_ms: Date.now(),
    capabilities: ['llm', 'tts'],
  },
];

describe('DelegateToPeerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    render(<DelegateToPeerDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when open is true', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: mockPeers,
    } as any);

    render(<DelegateToPeerDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('displays peer cards when peers with llm are available', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: mockPeers,
    } as any);

    render(<DelegateToPeerDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/home server/i)).toBeInTheDocument();
    });
  });

  it('filters to only peers with llm capability', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: [
        ...mockPeers,
        { id: 'no-llm', url: 'http://192.168.1.102:8082', name: 'No LLM', reachable: true, last_seen_ms: Date.now(), capabilities: ['tts'] },
      ],
    } as any);

    render(<DelegateToPeerDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText(/no llm/i)).not.toBeInTheDocument();
    });
  });

  it('calls onClose when cancel button is clicked', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: mockPeers,
    } as any);

    const handleClose = vi.fn();

    render(<DelegateToPeerDialog open={true} onClose={handleClose} />);

    await waitFor(() => {
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      cancelBtn.click();
    });

    expect(handleClose).toHaveBeenCalled();
  });

  it('uses prefillUrl to auto-show add peer form', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: [],
    } as any);

    render(
      <DelegateToPeerDialog
        open={true}
        onClose={() => {}}
        prefillUrl="http://192.168.1.100:8082"
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue(/192\.168\.1\.100:8082/i)).toBeInTheDocument();
    });
  });
});