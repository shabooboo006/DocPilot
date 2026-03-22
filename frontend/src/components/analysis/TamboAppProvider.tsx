import { useMemo, type PropsWithChildren } from 'react';
import { TamboProvider } from '@tambo-ai/react';

export function TamboAppProvider({ children }: PropsWithChildren) {
  const apiKey = import.meta.env.VITE_TAMBO_API_KEY as string | undefined;
  const userKey = useMemo(() => 'docpilot-local-user', []);

  if (!apiKey) {
    return <>{children}</>;
  }

  return (
    <TamboProvider apiKey={apiKey} userKey={userKey}>
      {children}
    </TamboProvider>
  );
}
