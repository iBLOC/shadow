import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';
import { BrowserRouter } from 'react-router-dom';

interface WrapperProps {
  children: ReactElement;
}

function Wrapper({ children }: WrapperProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { customRender as render };