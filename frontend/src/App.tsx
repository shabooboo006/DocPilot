import { Toolbar } from './components/layout/Toolbar';
import { MainLayout } from './components/layout/MainLayout';
import { StatusBar } from './components/layout/StatusBar';
import { EditorPanel } from './components/editor/EditorPanel';
import { ChatPanel } from './components/chat/ChatPanel';

export default function App() {
  return (
    <div className="h-screen flex flex-col">
      <Toolbar />
      <MainLayout
        left={<EditorPanel />}
        right={<ChatPanel />}
      />
      <StatusBar />
    </div>
  );
}
