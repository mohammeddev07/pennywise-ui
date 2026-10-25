import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useIsWide } from "@/shared/hooks/useMediaQuery";

/**
 * One overlay, two ergonomics: a centered dialog with keyboard focus on wide screens, a drag-to-dismiss bottom
 * sheet on phones. Both trap focus and close on Escape.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const wide = useIsWide();
  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("glass max-h-[88dvh] overflow-y-auto rounded-2xl sm:max-w-lg", className)}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
            <DialogDescription className={description ? undefined : "sr-only"}>{description ?? title}</DialogDescription>
          </DialogHeader>
          {children}
          {footer && <div className="flex justify-end gap-2 pt-2">{footer}</div>}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn("glass max-h-[92dvh] rounded-t-3xl", className)}>
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-lg font-semibold tracking-tight">{title}</DrawerTitle>
          <DrawerDescription className={description ? undefined : "sr-only"}>{description ?? title}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-2">{children}</div>
        {footer && <div className="flex gap-2 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] [&>*]:flex-1">{footer}</div>}
      </DrawerContent>
    </Drawer>
  );
}
