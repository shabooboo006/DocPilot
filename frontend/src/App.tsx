import { Toolbar } from './components/layout/Toolbar';
import { MainLayout } from './components/layout/MainLayout';
import { StatusBar } from './components/layout/StatusBar';
import { EditorPanel } from './components/editor/EditorPanel';
import { ChatPanel } from './components/chat/ChatPanel';

export default function App() {
  return (
    <div className="h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:text-zinc-950"
      >
        跳到主内容
      </a>

      <div className="relative flex h-full flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_28%),radial-gradient(circle_at_80%_16%,rgba(15,23,42,0.06),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.22),transparent_36%)]" />

        <Toolbar />

        <main id="main-content" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <MainLayout left={<EditorPanel />} right={<ChatPanel />} />
        </main>

        <StatusBar />
      </div>
    </div>
  );
}
