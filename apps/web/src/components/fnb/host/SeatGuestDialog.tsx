'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, ChevronDown, ChevronUp, Check, Armchair } from 'lucide-react';

interface SuggestedTable {
  tableId: string;
  displayLabel: string;
  maxCapacity: number;
  serverName: string | null;
  fitScore: number;
  fitReason: string;
}

interface AvailableTable {
  tableId: string;
  displayLabel: string;
  maxCapacity: number;
  serverName: string | null;
  currentStatus: string;
}

interface SeatGuestDialogProps {
  open: boolean;
  onClose: () => void;
  onSeat: (tableId: string) => Promise<void>;
  guestName: string;
  partySize: number;
  suggestedTables: SuggestedTable[];
  allTables: AvailableTable[];
  isSeating: boolean;
}

function FitScoreRing({ score }: { score: number }) {
  const size = 36;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color =
    score >= 80
      ? 'var(--fnb-success)'
      : score >= 50
        ? 'var(--fnb-warning)'
        : 'var(--fnb-danger)';

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.15)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          strokeLinecap="round"
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--fnb-text-xs)',
          fontWeight: 'var(--fnb-font-bold)',
          fontFamily: 'var(--fnb-font-mono)',
          color,
        }}
      >
        {score}
      </span>
    </div>
  );
}

export function SeatGuestDialog({
  open,
  onClose,
  onSeat,
  guestName,
  partySize,
  suggestedTables,
  allTables,
  isSeating,
}: SeatGuestDialogProps) {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [showAllTables, setShowAllTables] = useState(false);

  if (!open) return null;

  const handleSeat = async () => {
    if (!selectedTableId || isSeating) return;
    await onSeat(selectedTableId);
    setSelectedTableId(null);
    setShowAllTables(false);
  };

  // Filter out suggested tables from the "all" list
  const suggestedIds = new Set(suggestedTables.map((t) => t.tableId));
  const otherTables = allTables.filter(
    (t) => !suggestedIds.has(t.tableId) && t.currentStatus === 'available'
  );

  const content = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--fnb-bg-overlay)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--fnb-bg-surface)',
          borderRadius: 'var(--fnb-radius-lg)',
          boxShadow: 'var(--fnb-shadow-overlay)',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 'var(--fnb-space-4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--fnb-space-4)',
            borderBottom: 'var(--fnb-border-subtle)',
          }}
        >
          <div>
            <div
              style={{
                color: 'var(--fnb-text-primary)',
                fontSize: 'var(--fnb-text-lg)',
                fontWeight: 'var(--fnb-font-semibold)',
              }}
            >
              Seat {guestName}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--fnb-space-1)',
                color: 'var(--fnb-text-secondary)',
                fontSize: 'var(--fnb-text-sm)',
                marginTop: '2px',
              }}
            >
              <Users size={14} />
              Party of {partySize}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fnb-text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '44px',
              minWidth: '44px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--fnb-space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--fnb-space-4)',
          }}
        >
          {/* Suggested Tables */}
          {suggestedTables.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--fnb-space-2)',
              }}
            >
              <span
                style={{
                  color: 'var(--fnb-text-muted)',
                  fontSize: 'var(--fnb-text-xs)',
                  fontWeight: 'var(--fnb-font-semibold)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Suggested Tables
              </span>
              {suggestedTables.map((table) => (
                <button
                  key={table.tableId}
                  onClick={() => setSelectedTableId(table.tableId)}
                  style={{
                    background:
                      selectedTableId === table.tableId
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'var(--fnb-bg-elevated)',
                    border:
                      selectedTableId === table.tableId
                        ? '2px solid var(--fnb-info)'
                        : '2px solid var(--fnb-success)',
                    borderRadius: 'var(--fnb-radius-lg)',
                    padding: 'var(--fnb-card-padding)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--fnb-space-3)',
                    textAlign: 'left',
                    width: '100%',
                    minHeight: '60px',
                    transition: 'background var(--fnb-duration-micro) ease',
                  }}
                >
                  <FitScoreRing score={table.fitScore} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--fnb-space-2)',
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--fnb-text-primary)',
                          fontSize: 'var(--fnb-text-base)',
                          fontWeight: 'var(--fnb-font-semibold)',
                        }}
                      >
                        {table.displayLabel}
                      </span>
                      <span
                        style={{
                          color: 'var(--fnb-text-muted)',
                          fontSize: 'var(--fnb-text-sm)',
                        }}
                      >
                        (seats {table.maxCapacity})
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--fnb-space-2)',
                        marginTop: '2px',
                      }}
                    >
                      {table.serverName && (
                        <span
                          style={{
                            color: 'var(--fnb-text-secondary)',
                            fontSize: 'var(--fnb-text-sm)',
                          }}
                        >
                          {table.serverName}
                        </span>
                      )}
                      <span
                        style={{
                          color: 'var(--fnb-text-muted)',
                          fontSize: 'var(--fnb-text-xs)',
                        }}
                      >
                        {table.fitReason}
                      </span>
                    </div>
                  </div>
                  {selectedTableId === table.tableId && (
                    <Check
                      size={20}
                      style={{
                        color: 'var(--fnb-info)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* All Available (expandable) */}
          {otherTables.length > 0 && (
            <div>
              <button
                onClick={() => setShowAllTables(!showAllTables)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--fnb-space-2)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--fnb-text-muted)',
                  fontSize: 'var(--fnb-text-xs)',
                  fontWeight: 'var(--fnb-font-semibold)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  padding: '4px 0',
                  width: '100%',
                }}
              >
                All Available ({otherTables.length})
                {showAllTables ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showAllTables && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--fnb-space-2)',
                    marginTop: 'var(--fnb-space-2)',
                  }}
                >
                  {otherTables.map((table) => (
                    <button
                      key={table.tableId}
                      onClick={() => setSelectedTableId(table.tableId)}
                      style={{
                        background:
                          selectedTableId === table.tableId
                            ? 'rgba(59, 130, 246, 0.15)'
                            : 'var(--fnb-bg-elevated)',
                        border:
                          selectedTableId === table.tableId
                            ? '2px solid var(--fnb-info)'
                            : '2px solid transparent',
                        borderRadius: 'var(--fnb-radius-lg)',
                        padding: 'var(--fnb-card-padding)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--fnb-space-3)',
                        textAlign: 'left',
                        width: '100%',
                        minHeight: '52px',
                        transition: 'background var(--fnb-duration-micro) ease',
                      }}
                    >
                      <Armchair
                        size={20}
                        style={{
                          color: 'var(--fnb-text-muted)',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--fnb-space-2)',
                          }}
                        >
                          <span
                            style={{
                              color: 'var(--fnb-text-primary)',
                              fontSize: 'var(--fnb-text-base)',
                              fontWeight: 'var(--fnb-font-semibold)',
                            }}
                          >
                            {table.displayLabel}
                          </span>
                          <span
                            style={{
                              color: 'var(--fnb-text-muted)',
                              fontSize: 'var(--fnb-text-sm)',
                            }}
                          >
                            (seats {table.maxCapacity})
                          </span>
                        </div>
                        {table.serverName && (
                          <span
                            style={{
                              color: 'var(--fnb-text-secondary)',
                              fontSize: 'var(--fnb-text-sm)',
                            }}
                          >
                            {table.serverName}
                          </span>
                        )}
                      </div>
                      {selectedTableId === table.tableId && (
                        <Check
                          size={20}
                          style={{
                            color: 'var(--fnb-info)',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No tables */}
          {suggestedTables.length === 0 && otherTables.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--fnb-space-8)',
                gap: 'var(--fnb-space-2)',
              }}
            >
              <Armchair
                size={40}
                style={{ color: 'var(--fnb-text-disabled)', opacity: 0.5 }}
              />
              <span
                style={{
                  color: 'var(--fnb-text-muted)',
                  fontSize: 'var(--fnb-text-base)',
                }}
              >
                No tables available
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--fnb-space-3)',
            padding: 'var(--fnb-space-4)',
            borderTop: 'var(--fnb-border-subtle)',
          }}
        >
          <button
            onClick={onClose}
            disabled={isSeating}
            style={{
              flex: 1,
              background: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
              border: 'var(--fnb-border-subtle)',
              borderRadius: 'var(--fnb-radius-md)',
              padding: '12px',
              fontSize: 'var(--fnb-text-base)',
              fontWeight: 'var(--fnb-font-medium)',
              cursor: 'pointer',
              minHeight: '48px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSeat}
            disabled={!selectedTableId || isSeating}
            style={{
              flex: 1,
              background:
                selectedTableId && !isSeating ? 'var(--fnb-success)' : 'var(--fnb-bg-elevated)',
              color:
                selectedTableId && !isSeating ? '#fff' : 'var(--fnb-text-disabled)',
              border: 'none',
              borderRadius: 'var(--fnb-radius-md)',
              padding: '12px',
              fontSize: 'var(--fnb-text-base)',
              fontWeight: 'var(--fnb-font-semibold)',
              cursor: selectedTableId && !isSeating ? 'pointer' : 'not-allowed',
              minHeight: '48px',
            }}
          >
            {isSeating ? 'Seating...' : 'Seat Here'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
