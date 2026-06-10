import { useEffect, useState } from 'react';

/** Subscribe to a realtime source for the component's lifetime. */
export function useSub<T>(
  sub: (cb: (v: T) => void) => () => void,
  initial: T,
  deps: any[] = [],
): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const unsub = sub(setValue);
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
