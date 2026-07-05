"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

export function ModalContent({
  title,
  description,
  children,
  className,
  showClose = true,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  showClose?: boolean;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px] data-[state=open]:animate-[fadeIn_.15s_ease]" />
      <Dialog.Content
        className={cn(
          "glass-strong fixed left-1/2 top-1/2 z-50 w-[min(94vw,32rem)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 focus:outline-none sm:p-6",
          "data-[state=open]:animate-[popIn_.18s_cubic-bezier(0.22,1,0.36,1)]",
          className,
        )}
      >
        {/* Radix requires a Title for a11y; hide it visually when unlabeled. */}
        <Dialog.Title className={cn("font-display text-lg font-semibold text-text-hi", !title && "sr-only")}>
          {title ?? "Dialogue"}
        </Dialog.Title>
        {description && (
          <Dialog.Description className="mt-1 text-sm text-text-lo">
            {description}
          </Dialog.Description>
        )}
        <div className={cn(title && "mt-4")}>{children}</div>
        {showClose && (
          <Dialog.Close
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-text-faint transition-colors hover:bg-glass hover:text-text-hi"
            aria-label="Fermer"
          >
            <X size={16} />
          </Dialog.Close>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
