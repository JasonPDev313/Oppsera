'use client';

import { useState } from 'react';
import { Archive, ArrowRightLeft, PackagePlus } from 'lucide-react';
import { SavedTabsPanel } from './SavedTabsPanel';
import { TransferTabPanel } from './TransferTabPanel';
import { QuickAddItemPanel } from './QuickAddItemPanel';

type ToolId = 'saved-tabs' | 'transfer-tab' | 'quick-add-item';

interface Tool {
  id: ToolId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOOLS: Tool[] = [
  { id: 'saved-tabs', label: 'Saved Tabs', icon: Archive },
  { id: 'transfer-tab', label: 'Transfer Tab', icon: ArrowRightLeft },
  { id: 'quick-add-item', label: 'Add Item', icon: PackagePlus },
];

interface ToolsViewProps {
  locationId: string;
  terminalId: string;
  onRecallSavedTab: (orderId: string) => void;
  onTransferTab: (orderId: string) => void;
  onItemCreated: () => void;
  isLoading?: boolean;
}

export function ToolsView({
  locationId,
  terminalId,
  onRecallSavedTab,
  onTransferTab,
  onItemCreated,
  isLoading,
}: ToolsViewProps) {
  const [activeTool, setActiveTool] = useState<ToolId>('saved-tabs');

  return (
    <div className="flex h-full">
      {/* Tool sidebar */}
      <div className="flex w-44 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="p-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                {tool.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tool content */}
      <div className="flex-1 overflow-hidden">
        {activeTool === 'saved-tabs' && (
          <SavedTabsPanel
            locationId={locationId}
            onRecall={onRecallSavedTab}
            isRecalling={isLoading}
          />
        )}
        {activeTool === 'transfer-tab' && (
          <TransferTabPanel
            currentTerminalId={terminalId}
            onTransfer={onTransferTab}
            isTransferring={isLoading}
          />
        )}
        {activeTool === 'quick-add-item' && (
          <QuickAddItemPanel onItemCreated={onItemCreated} />
        )}
      </div>
    </div>
  );
}
