import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/**
 * 自定义确认对话框
 * 替代原生 confirm()，解决内嵌浏览器不阻塞的问题
 */
export default function ConfirmDialog({
  open,
  title = '确认',
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[400px] max-w-[90vw]">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-navy">{title}</h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{message}</p>
          {children}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-outline" onClick={onCancel}>{cancelText}</button>
          <button className="btn-primary" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
