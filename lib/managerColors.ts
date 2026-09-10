// Stable per-manager accent color, used consistently across every chart and
// card on the site. Derived from a hash of user_id rather than stored, so it
// never drifts and needs no migration when a new manager shows up. Kept to a
// single muted, mid-tone palette (rather than saturated "chart defaults") so
// it reads the same deliberate way in both light and dark mode.
const PALETTE = [
  "#b5502c", // terracotta
  "#5c7a54", // sage
  "#a8792c", // ochre
  "#4d6a85", // slate blue
  "#7a4f6b", // plum
  "#3f7a75", // teal
  "#9c4a35", // rust
  "#6d7a3f", // moss
  "#a15d6b", // dusty rose
  "#3f5c7a", // denim
  "#a08a2e", // mustard
  "#7d5a3f", // clay
  "#5a6975", // steel
  "#824468", // berry
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function managerColor(userId: string): string {
  return PALETTE[hash(userId) % PALETTE.length];
}
