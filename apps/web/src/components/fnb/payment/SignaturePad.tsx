'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onSignature: (data: string | null) => void;
  width?: number;
  height?: number;
}

/**
 * Minimal canvas-based signature capture for CMAA house account chits.
 * Emits base64 PNG data URI via onSignature callback.
 */
export function SignaturePad({ onSignature, width = 300, height = 120 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  // Initialize canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = 'var(--fnb-text-primary, #fff)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0]!;
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [getPos]);

  const endDraw = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    setHasStrokes(true);
    const canvas = canvasRef.current;
    if (canvas) {
      onSignature(canvas.toDataURL('image/png'));
    }
  }, [onSignature]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onSignature(null);
  }, [onSignature]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold uppercase"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Signature
        </span>
        {hasStrokes && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 text-[10px] transition-colors hover:opacity-80"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            <Eraser className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-lg touch-none"
        style={{
          backgroundColor: 'var(--fnb-bg-elevated)',
          border: '1px solid var(--fnb-border, rgba(255,255,255,0.1))',
          cursor: 'crosshair',
          width: '100%',
          height: `${height}px`,
        }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {!hasStrokes && (
        <span
          className="text-[10px] text-center"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Sign above to authorize charge
        </span>
      )}
    </div>
  );
}
