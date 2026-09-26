import * as Primitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("space-y-2 pr-8", className)} {...props} />;
}
export function DialogContent({ className, children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal>
    <Primitive.Overlay className="fixed inset-0 z-50 bg-bg/70" />
    <Primitive.Content className={cn("fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl bg-white p-5 text-stage-ink shadow-xl", className)} {...props}>
      {children}
      <Primitive.Close className="absolute top-2 right-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-stage" aria-label="Close checkout"><X className="h-5 w-5" /></Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal>;
}
