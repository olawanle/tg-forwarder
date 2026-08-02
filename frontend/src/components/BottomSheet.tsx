import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function BottomSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return createPortal(
    <>
      <div className="bottom-sheet-overlay" onClick={onClose} />
      <div className="bottom-sheet">
        <div className="grabber" />
        {children}
      </div>
    </>,
    document.body,
  );
}
