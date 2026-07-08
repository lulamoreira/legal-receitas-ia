const FRACTIONS: Array<[number, string]> = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

export function scaleQuantity(qty: number, from: number, to: number): number {
  if (!from || from <= 0) return qty;
  return (qty * to) / from;
}

export function formatQuantity(qty: number): string {
  if (!isFinite(qty) || qty <= 0) return "";
  const whole = Math.floor(qty);
  const frac = qty - whole;

  if (frac < 0.05) return String(whole || 0);

  for (const [val, sym] of FRACTIONS) {
    if (Math.abs(frac - val) < 0.05) {
      return whole > 0 ? `${whole} ${sym}` : sym;
    }
  }

  // Fallback: enxuto (até 2 casas)
  const rounded = Math.round(qty * 100) / 100;
  return String(rounded).replace(".", ",");
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
