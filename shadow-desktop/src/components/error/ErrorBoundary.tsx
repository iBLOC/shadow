import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useErrorDialogStore } from '../../stores/errorDialogStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level React error boundary.
 *
 * When a descendant component throws during render, we capture the error,
 * forward it to the global error dialog store, and continue rendering
 * children (the dialog will overlay the UI). This keeps the app
 * responsive so the user can copy the error and continue.
 *
 * The state flag prevents an infinite loop: if the error dialog itself
 * throws, we don't want to re-catch it.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    useErrorDialogStore.getState().show({
      source: 'react',
      message: error.message || 'Component error',
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
    // Reset for next render — the dialog handles UX, we don't unmount.
    this.setState({ hasError: false });
  }

  override render(): ReactNode {
    return this.props.children;
  }
}
