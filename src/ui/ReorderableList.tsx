import { useState } from 'react';
import type { ReactNode } from 'react';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * 可排序列表。
 *
 * 原实现用 `draggable={isDragging}` —— 元素只有在 state 已经标记为拖拽中时
 * 才可拖动，而该 state 又要靠 mousedown 才会设置，导致 dragstart 常常不触发。
 * 这里让元素始终 draggable，并额外提供上移/下移按钮作为兜底（触屏与键盘可用）。
 */
export function ReorderableList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
  emptyState,
}: {
  items: T[];
  getKey: (item: T, index: number) => string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (items.length === 0) return <>{emptyState}</>;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    onReorder(from, to);
  };

  return (
    <ul className="divide-y divide-line">
      {items.map((item, i) => {
        const isDragging = dragIndex === i;
        const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
        // 从上方拖来时指示线画在下边，反之画在上边
        const indicator = isOver
          ? dragIndex! < i
            ? 'after:bottom-0'
            : 'after:top-0'
          : '';

        return (
          <li
            key={getKey(item, i)}
            draggable
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = 'move';
              // Firefox 需要设置数据才会启动拖拽
              e.dataTransfer.setData('text/plain', String(i));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragIndex !== null && dragIndex !== i) setOverIndex(i);
            }}
            onDragLeave={() => {
              setOverIndex(prev => (prev === i ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) move(dragIndex, i);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={`relative flex items-center gap-2 px-3 py-2.5 transition-colors
                        hover:bg-raised/60
                        ${isDragging ? 'opacity-40' : ''}
                        ${isOver ? `after:absolute after:inset-x-0 after:h-0.5 after:bg-accent ${indicator}` : ''}`}
          >
            {/* HTML5 拖拽在触屏上不触发，窄屏隐藏手柄，改用箭头按钮 */}
            <GripVertical
              size={15}
              aria-hidden
              className="hidden sm:block text-fg-subtle shrink-0 cursor-grab active:cursor-grabbing"
            />

            <div className="flex-1 min-w-0">{renderItem(item, i)}</div>

            {/* 键盘与触屏兜底：拖拽在这些场景下不可用。
                窄屏横向排列，避免两个 36px 按钮把行高撑到 72px。 */}
            <div className="flex flex-row sm:flex-col shrink-0">
              <button
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label="上移"
                title="上移"
                className="w-9 h-9 sm:w-6 sm:h-4 flex items-center justify-center text-fg-muted
                           hover:text-fg hover:bg-raised disabled:opacity-30
                           disabled:hover:text-fg-muted disabled:hover:bg-transparent
                           transition-colors rounded-sm"
              >
                <ChevronUp size={13} />
              </button>
              <button
                onClick={() => move(i, i + 1)}
                disabled={i === items.length - 1}
                aria-label="下移"
                title="下移"
                className="w-9 h-9 sm:w-6 sm:h-4 flex items-center justify-center text-fg-muted
                           hover:text-fg hover:bg-raised disabled:opacity-30
                           disabled:hover:text-fg-muted disabled:hover:bg-transparent
                           transition-colors rounded-sm"
              >
                <ChevronDown size={13} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
