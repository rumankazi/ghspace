import * as React from "react"
import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // Hidden from assistive technology on purpose: the container that owns
      // the placeholders announces the wait once, rather than every block
      // announcing itself.
      aria-hidden
      className={cn("skeleton rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
