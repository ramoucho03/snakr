"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn(
          "glass-strong z-50 min-w-44 overflow-hidden rounded-xl p-1.5 text-sm shadow-[var(--shadow-float)]",
          "data-[state=open]:animate-[fadeIn_.12s_ease]",
          className,
        )}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onSelect?: (e: Event) => void;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Menu.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors",
        "data-[highlighted]:bg-glass data-[disabled]:opacity-40 data-[disabled]:pointer-events-none",
        danger ? "text-danger data-[highlighted]:bg-danger/10" : "text-text-hi",
        className,
      )}
    >
      {children}
    </Menu.Item>
  );
}

export function DropdownSeparator() {
  return <Menu.Separator className="my-1 h-px bg-glass-border" />;
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <Menu.Label className="px-2.5 py-1.5 text-xs font-medium text-text-faint">{children}</Menu.Label>;
}
