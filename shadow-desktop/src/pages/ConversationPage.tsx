import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useConversationStore } from '../stores/conversationStore';
import { useAgentStore } from '../stores/agentStore';
import { useCompanionModeStore } from '../stores/companionModeStore';
import { Button, EmptyState } from '../components/ui';
import {
  Send,
  Plus,
  Trash2,
  Bot,
  User,
  Search,
  MessageSquare,
  Sparkles,
  Mic,
  Radio,
} from 'lucide-react';
import type { Conversation, Message } from '../types';
import './ConversationPage.css';

export function ConversationPage() {
  const { t } = useTranslation();
  const { 
    conversations, 
    activeConversationId, 
    addConversation,
    removeConversation, 
    setActiveConversation,
    addMessage,
    setSessionId,
  } = useConversationStore();
  const { agents, activeAgentId, setActiveAgent } = useAgentStore();
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  const handleNewConversation = () => {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: t('conversation.newChat'),
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    addConversation(conversation);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !activeConversationId) return;
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    
    addMessage(activeConversationId, userMessage);
    setInput('');
    setIsLoading(true);
    
    try {
      const conversation = conversations.find(c => c.id === activeConversationId);
      let sessionId = conversation?.sessionId;
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (!sessionId || attempt > 0) {
            sessionId = await invoke<string>('prefrontal_create_session');
            setSessionId(activeConversationId, sessionId);
          }
          
          const response = await invoke<string>('prefrontal_process', {
            sessionId,
            message: input,
          });
          
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response || t('conversation.noResponse'),
            timestamp: new Date(),
          };
          addMessage(activeConversationId, assistantMessage);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const errorStr = String(error).toLowerCase();
          
          const isSessionError = 
            errorStr.includes('session') || 
            errorStr.includes('not found') ||
            errorStr.includes('invalid') ||
            errorStr.includes('expired');
          
          if (isSessionError && attempt === 0) {
            setSessionId(activeConversationId, '');
            sessionId = undefined;
            continue;
          }
          break;
        }
      }
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: t('conversation.error', { error: lastError?.message || 'Unknown error' }),
        timestamp: new Date(),
      };
      addMessage(activeConversationId, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filteredConversations = conversations.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedAgent = agents.find(a => a.id === activeAgentId);

  return (
    <div className="conversation-container">
      <aside className="conversation-sidebar">
        <div className="sidebar-header">
          <h3>{t('conversation.title')}</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            icon={<Plus size={18} />}
            onClick={handleNewConversation}
          />
        </div>
        
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('conversation.searchPlaceholder')}
            className="search-input"
          />
        </div>
        
        <div className="conversation-list">
          {filteredConversations.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={24} />}
              title={t('conversation.noConversations')}
              size="sm"
            />
          ) : (
            filteredConversations.map((conv) => (
              <div 
                key={conv.id} 
                className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
                onClick={() => setActiveConversation(conv.id)}
              >
                <MessageSquare size={16} className="conv-icon" />
                <div className="conv-content">
                  <span className="conv-title">{conv.title}</span>
                  <span className="conv-meta">
                    {conv.messages.length} {t('conversation.messages')}
                  </span>
                </div>
                <button 
                  className="conv-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeConversation(conv.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
        
        <div className="agent-section">
          <button 
            className="agent-selector-btn"
            onClick={() => setShowAgentSelector(!showAgentSelector)}
          >
            <div className="agent-info">
              <Bot size={16} />
              <span>{selectedAgent?.name || t('conversation.selectAgent')}</span>
            </div>
            <div className={`agent-status ${selectedAgent?.status || 'offline'}`} />
          </button>
          
          {showAgentSelector && (
            <div className="agent-dropdown">
              {agents.map((agent) => (
                <div 
                  key={agent.id} 
                  className={`agent-option ${activeAgentId === agent.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveAgent(agent.id);
                    setShowAgentSelector(false);
                  }}
                >
                  <Bot size={16} />
                  <span>{agent.name}</span>
                  <span className={`status-dot ${agent.status}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
      
      <main className="conversation-main">
        {activeConversation ? (
          <>
            <div className="messages-container">
              {activeConversation.messages.length === 0 ? (
                <div className="welcome-state">
                  <div className="welcome-icon">
                    <Sparkles size={48} />
                  </div>
                  <h2>{t('conversation.welcome')}</h2>
                  <p>{t('conversation.welcomeDesc')}</p>
                  <div className="suggested-prompts">
                    <button className="prompt-chip" onClick={() => setInput(t('conversation.helpWithTask'))}>
                      {t('conversation.helpWithTask')}
                    </button>
                    <button className="prompt-chip" onClick={() => setInput(t('conversation.whatCanYouDo'))}>
                      {t('conversation.whatCanYouDo')}
                    </button>
                    <button className="prompt-chip" onClick={() => setInput(t('conversation.showMyAgents'))}>
                      {t('conversation.showMyAgents')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {activeConversation.messages.map((msg) => (
                    <div key={msg.id} className={`message message-${msg.role}`}>
                      <div className="message-avatar">
                        {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                      </div>
                      <div className="message-content">
                        <div className="message-bubble">
                          {msg.content}
                        </div>
                        <div className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="message message-assistant">
                      <div className="message-avatar">
                        <Bot size={20} />
                      </div>
                      <div className="message-content">
                        <div className="message-bubble loading">
                          <div className="typing-indicator">
                            <span /><span /><span />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            <CompanionModePanel />

            <div className="input-container">
              <div className="input-wrapper">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={t('conversation.placeholder')}
                  className="message-input"
                  rows={1}
                />
                <Button
                  variant="primary"
                  icon={<Send size={18} />}
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                />
              </div>
              <p className="input-hint">
                {t('conversation.pressEnter')}, {t('conversation.shiftEnterForNewLine')}
              </p>
            </div>
          </>
        ) : (
          <div className="no-conversation">
            <div className="no-conv-icon">
              <MessageSquare size={64} />
            </div>
            <h3>{t('conversation.selectOrCreate')}</h3>
            <Button 
              variant="primary" 
              icon={<Plus size={18} />}
              onClick={handleNewConversation}
            >
              {t('conversation.newChat')}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function CompanionModePanel() {
  const { t } = useTranslation();
  const {
    phase,
    transcript,
    partialTranscript,
    error,
    turnCount,
    isActive,
    start,
    stop,
  } = useCompanionModeStore();

  const handleToggle = async () => {
    if (isActive) {
      await stop();
    } else {
      await start();
    }
  };

  const phaseLabel = (() => {
    switch (phase) {
      case 'connecting':
        return t('common.connecting');
      case 'listening':
        return t('conversation.companion.listening');
      case 'speaking':
        return t('conversation.companion.speaking');
      case 'processing':
        return t('conversation.companion.processing');
      case 'barge_in':
        return t('conversation.companion.bargeIn');
      case 'error':
        return error || t('conversation.companion.connectError');
      default:
        return t('conversation.companion.placeholder');
    }
  })();

  return (
    <div className={`companion-panel ${phase}`}>
      <button
        className={`companion-toggle ${isActive ? 'active' : ''}`}
        onClick={handleToggle}
        title={isActive ? t('conversation.companion.stop') : t('conversation.companion.start')}
      >
        {isActive ? <Radio size={20} /> : <Mic size={20} />}
      </button>
      <div className="companion-status">
        <span className={`companion-phase-dot ${phase}`} />
        <span className="companion-phase-label">{phaseLabel}</span>
        {isActive && turnCount > 0 && (
          <span className="companion-turn-count">
            {t('conversation.companion.turnCount', { count: turnCount })}
          </span>
        )}
      </div>
      {(transcript || partialTranscript) && (
        <div className="companion-transcript">
          {transcript}
          {partialTranscript && <em className="partial"> {partialTranscript}</em>}
        </div>
      )}
    </div>
  );
}
