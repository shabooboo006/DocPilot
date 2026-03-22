import { Toolbar } from './components/layout/Toolbar';
import { MainLayout } from './components/layout/MainLayout';
import { StatusBar } from './components/layout/StatusBar';
import { EditorPanel } from './components/editor/EditorPanel';
import { ChatPanel } from './components/chat/ChatPanel';
import { TamboAppProvider } from './components/analysis/TamboAppProvider';

export default function App() {
  return (
    <TamboAppProvider>
      <div className="h-screen overflow-hidden bg-[linear-gradient(180deg,#fafafa_0%,#f4f4f5_100%)] text-zinc-950">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          跳到主内容
        </a>

        <div className="relative flex h-full flex-col overflow-hidden">
          <Toolbar />

          <main id="main-content" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <MainLayout left={<EditorPanel />} right={<ChatPanel />} />
          </main>

          <StatusBar />
        </div>
      </div>
    </TamboAppProvider>
  );
}
