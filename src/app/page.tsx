import { Suspense } from "react";
import { Board } from "@/components/board/Board";

export default function Home() {
  // Board uses useSearchParams() (for the ?job= deep link from the discovery
  // digest email), which Next.js requires to be wrapped in Suspense.
  return (
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  );
}
