import Decimal from "decimal.js";
export const measures: Record<string, { dimension: string; factor: number }> = {
  g: { dimension: "mass", factor: 1 },
  kg: { dimension: "mass", factor: 1000 },
  ml: { dimension: "volume", factor: 1 },
  L: { dimension: "volume", factor: 1000 },
  tsp: { dimension: "volume", factor: 5 },
  tbsp: { dimension: "volume", factor: 15 },
  cups: { dimension: "volume", factor: 240 },
  pieces: { dimension: "count", factor: 1 },
};
export function convertQuantity(
  quantity: number | null,
  from: string,
  to: string,
) {
  if (
    !measures[from] ||
    !measures[to] ||
    measures[from].dimension !== measures[to].dimension
  )
    throw new Error(
      "Incompatible units. Mass, volume and pieces cannot be interchanged.",
    );
  return quantity === null
    ? null
    : new Decimal(quantity)
        .mul(measures[from].factor)
        .div(measures[to].factor)
        .toNumber();
}
export const displayQuantity = (value: number | null) =>
  value === null ? "Unknown" : new Decimal(value).toDecimalPlaces(2).toString();
export function expiryState(date: string | Date | null, now = new Date()) {
  if (!date) return null;
  // Use-by values are calendar dates, not elapsed 24-hour intervals.
  const calendarDate = new Date(date).toISOString().slice(0, 10);
  const days = Math.ceil(
    (new Date(calendarDate).getTime() -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000,
  );
  return days < 0 ? "Expired" : days <= 3 ? "Use soon" : null;
}
