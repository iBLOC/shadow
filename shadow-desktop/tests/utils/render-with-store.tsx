import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { StoreApi } from 'zustand';

interface WrapperProps {
  children: ReactElement;
}

function Wrapper({ children }: WrapperProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

interface RenderWithStoreOptions<T extends StoreApi<unknown>> extends Omit<RenderOptions, 'wrapper'> {
  store?: T;
}

function renderWithStore<T extends StoreApi<unknown>>(
  ui: ReactElement,
  options: RenderWithStoreOptions<T> = {}
) {
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { renderWithStore as render };
export type { RenderWithStoreOptions };