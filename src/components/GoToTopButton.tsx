"use client";

import { useEffect, useState } from "react";

export const GO_TO_TOP_THRESHOLD = 320;

export function shouldShowGoToTop(scrollY: number): boolean {
  return scrollY > GO_TO_TOP_THRESHOLD;
}

export function getScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? "auto" : "smooth";
}

export default function GoToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(shouldShowGoToTop(window.scrollY));
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!visible) return null;

  function handleClick() {
    document.getElementById("page-top")?.focus({ preventScroll: true });
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: getScrollBehavior(prefersReducedMotion),
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Go to top"
      className="fixed right-5 bottom-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-2xl leading-none text-white shadow-lg active:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400"
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
