export interface ServiceStatusProps {
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  message?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}
