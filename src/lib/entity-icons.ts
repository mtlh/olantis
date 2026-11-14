/**
 * The icon catalogue for user-chosen marks.
 *
 * Stored on `accounts.icon` (the folder glyph) and `providers.icon` (an
 * override for the fetched brand mark, e.g. Vanguard's "V"). Only ids listed
 * here are accepted, so the value in the database can never point at a
 * component the renderer does not know.
 *
 * This module stays free of React/lucide imports because the API routes import
 * it to validate writes; `components/EntityIcon.tsx` maps ids to components.
 */
export const ENTITY_ICON_OPTIONS = [
  { id: "folder", label: "Folder" },
  { id: "home", label: "Home" },
  { id: "wallet", label: "Wallet" },
  { id: "coins", label: "Coins" },
  { id: "piggy-bank", label: "Savings" },
  { id: "landmark", label: "Bank" },
  { id: "building", label: "Building" },
  { id: "briefcase", label: "Work" },
  { id: "user", label: "Personal" },
  { id: "users", label: "Household" },
  { id: "graduation-cap", label: "Education" },
  { id: "shield", label: "Protected" },
  { id: "target", label: "Goal" },
  { id: "trending-up", label: "Growth" },
  { id: "gem", label: "Premium" },
  { id: "plane", label: "Travel" },
  { id: "car", label: "Car" },
  { id: "heart", label: "Favourite" },
  { id: "leaf", label: "Ethical" },
  { id: "sun", label: "Sun" },
  { id: "moon", label: "Moon" },
  { id: "zap", label: "Bolt" },
  { id: "star", label: "Star" },
  { id: "gift", label: "Gift" },
] as const;

export type EntityIconId = (typeof ENTITY_ICON_OPTIONS)[number]["id"];

const ENTITY_ICON_IDS: ReadonlySet<string> = new Set(ENTITY_ICON_OPTIONS.map((option) => option.id));

export function isEntityIconId(value: unknown): value is EntityIconId {
  return typeof value === "string" && ENTITY_ICON_IDS.has(value);
}

/**
 * `null`/empty clears the override (back to the default folder/brand mark).
 * Anything unknown normalises to null rather than being stored verbatim.
 */
export function normalizeEntityIcon(value: unknown): EntityIconId | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return isEntityIconId(id) ? id : null;
}

export function entityIconLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return ENTITY_ICON_OPTIONS.find((option) => option.id === value)?.label ?? null;
}
