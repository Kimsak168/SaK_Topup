"use client";

import { useState, type ComponentProps } from "react";
import Link, { useLinkStatus } from "next/link";
import styles from "./StorefrontLink.module.css";

function NavigationStatus() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span role="status" className={styles.pending}>
      <span className="sr-only">Opening page...</span>
    </span>
  );
}

// Warm only the destination the customer approaches, rather than fetching
// every game and package in a large catalogue as it enters the viewport.
export function StorefrontLink({
  children,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    >
      {children}
      <NavigationStatus />
    </Link>
  );
}
