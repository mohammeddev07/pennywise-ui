import { useEffect, useState } from "react";

/** True once `flag` has stayed true for `ms` - used to upgrade "loading" to "loading, and it is slow". */
export function useDelayedFlag(flag: boolean, ms: number) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!flag) {
      setLate(false);
      return;
    }
    const id = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(id);
  }, [flag, ms]);
  return late;
}
