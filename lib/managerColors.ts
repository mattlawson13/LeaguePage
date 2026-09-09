// Stable per-manager accent color, used consistently across every chart and
// card on the site. Derived from a hash of user_id rather than stored, so it
// never drifts and needs no migration when a new manager shows up.
const PALETTE = [
  "#ff5a2e", // accent orange
  "#3fb27f", // green
  "#5b8def", // blue
  "#c9a24b", // gold
  "#e0525f", // red
  "#9b6bd6", // purple
  "#3fc4c4", // teal
  "#e0a13f", // amber
  "#7ed957", // lime
  "#e06fc9", // pink
  "#6b8cff", // periwinkle
  "#d97b3f", // burnt orange
  "#4fb8e0", // sky
  "#b0d642", // yellow-green
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
