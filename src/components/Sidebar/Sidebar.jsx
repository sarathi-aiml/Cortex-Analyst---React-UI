export default function Sidebar() {
  return (
    <div className="w-[250px] bg-gray-100 border-r p-4 overflow-y-auto">
      <div className="font-bold text-xl mb-6">CORTEX</div>
      <button className="w-full bg-white border text-left p-2 mb-4 rounded hover:bg-gray-50">
        New chat
      </button>
      <div className="text-sm font-semibold mb-2 text-gray-500">Chats</div>
      <div className="space-y-2 text-sm">
        {[""].map((chat, i) => (
          <div key={i} className="hover:bg-gray-200 px-2 py-1 rounded cursor-pointer">
            {chat}
          </div>
        ))}
      </div>
    </div>
  );
}