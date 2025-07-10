import React from 'react';

import Sidebar from "./components/Sidebar/Sidebar";
import ChatWindow from "./components/ChatWindow/ChatWindow";

function App() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <ChatWindow />
    </div>
  );
}

export default App;