// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudioEventChip } from '@/components/chat/AudioEventChip';
import { FeishuPublishedCard } from '@/components/chat/FeishuPublishedCard';

describe('AudioEventChip', () => {
  it('renders without crashing', () => {
    render(
      <AudioEventChip classId="baby_cry" confidence={0.92} source="home-mic" />
    );
    expect(screen.getByTestId('audio-event-chip')).toBeInTheDocument();
  });

  it('renders with different class without crashing', () => {
    render(<AudioEventChip classId="glass_break" confidence={0.5} source="cam-1" />);
    expect(screen.getByTestId('audio-event-chip')).toBeInTheDocument();
  });
});

describe('FeishuPublishedCard', () => {
  it('renders share URL and title', () => {
    render(
      <FeishuPublishedCard
        data={{ taskId: 't-1', title: 'My Doc', url: 'https://example.feishu.cn/sheets/abc' }}
      />
    );
    expect(screen.getByTestId('feishu-published-card')).toBeInTheDocument();
    expect(screen.getByText('My Doc')).toBeInTheDocument();
    expect(screen.getByText(/example\.feishu\.cn/)).toBeInTheDocument();
  });
});
