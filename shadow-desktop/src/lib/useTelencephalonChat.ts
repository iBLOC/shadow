import { useChat } from '@ai-sdk/react';
import { useMemo } from 'react';
import type { ChatTransport, UIMessage } from 'ai';
import { createTelencephalonChatTransport } from './aiSdkTelencephalonTransport';

type ChatInit<UI_MESSAGE extends UIMessage> = Parameters<
  typeof useChat<UI_MESSAGE>
>[0] extends infer O
  ? O extends { chat?: unknown }
    ? never
    : O extends { messages?: unknown }
      ? O
      : never
  : never;

export interface UseTelencephalonChatOptions<
  UI_MESSAGE extends UIMessage = UIMessage,
> {
  conversationId: string;
  agent?: string;
  throttleMs?: number;
  initialMessages?: UI_MESSAGE[];
  onFinish?: ChatInit<UI_MESSAGE>['onFinish'];
  onError?: ChatInit<UI_MESSAGE>['onError'];
  onToolCall?: ChatInit<UI_MESSAGE>['onToolCall'];
  id?: string;
}

export function useTelencephalonChat<UI_MESSAGE extends UIMessage = UIMessage>(
  options: UseTelencephalonChatOptions<UI_MESSAGE>,
) {
  const {
    conversationId,
    agent,
    throttleMs,
    initialMessages,
    onFinish,
    onError,
    onToolCall,
    id,
  } = options;

  const transport = useMemo(
    () =>
      createTelencephalonChatTransport({
        conversationId,
        agent,
      }) as unknown as ChatTransport<UI_MESSAGE>,
    [conversationId, agent],
  );

  return useChat<UI_MESSAGE>({
    id: id ?? conversationId,
    messages: initialMessages,
    transport,
    onFinish,
    onError,
    onToolCall,
    experimental_throttle: throttleMs ?? 50,
  } as ChatInit<UI_MESSAGE>);
}

export type { ChatTransport, UIMessage };
