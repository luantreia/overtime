export function computeRemainingFromDoc(valueSeconds, lastUpdateDate, running) {
  if (valueSeconds === undefined || valueSeconds === null) return 0;
  const value = Math.floor(Number(valueSeconds) || 0);
  if (!running || !lastUpdateDate) return Math.max(0, value);

  const last = new Date(lastUpdateDate).getTime();
  if (isNaN(last)) return Math.max(0, value);

  const elapsedMs = Date.now() - last;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  return Math.max(0, value - elapsedSec);
}

export function computeSuddenDeathFromDoc(sdValue, lastUpdateDate, running) {
  const value = Math.floor(Number(sdValue) || 0);
  if (!running || !lastUpdateDate) return value;
  const last = new Date(lastUpdateDate).getTime();
  if (isNaN(last)) return value;
  const elapsedSec = Math.floor((Date.now() - last) / 1000);
  return value + elapsedSec;
}
