"use client";

import { createElement } from "react";
import {
  Briefcase,
  Building2,
  Car,
  Coins,
  Folder,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  Leaf,
  Moon,
  PiggyBank,
  Plane,
  Shield,
  Star,
  Sun,
  Target,
  TrendingUp,
  User,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { isEntityIconId, type EntityIconId } from "@/lib/entity-icons";

/**
 * Ids (see lib/entity-icons.ts) mapped to the glyph the user picked. Kept apart
 * from the catalogue so the validation module stays importable from API routes
 * without dragging React and lucide into the server bundle.
 */
const ENTITY_ICON_COMPONENTS: Record<EntityIconId, LucideIcon> = {
  folder: Folder,
  home: Home,
  wallet: Wallet,
  coins: Coins,
  "piggy-bank": PiggyBank,
  landmark: Landmark,
  building: Building2,
  briefcase: Briefcase,
  user: User,
  users: Users,
  "graduation-cap": GraduationCap,
  shield: Shield,
  target: Target,
  "trending-up": TrendingUp,
  gem: Gem,
  plane: Plane,
  car: Car,
  heart: Heart,
  leaf: Leaf,
  sun: Sun,
  moon: Moon,
  zap: Zap,
  star: Star,
  gift: Gift,
};

export function entityIconComponent(icon: string | null | undefined): LucideIcon | null {
  return isEntityIconId(icon) ? ENTITY_ICON_COMPONENTS[icon] : null;
}

/**
 * A user-chosen mark. Returns null for an unset/unknown id so callers can fall
 * back to their own default (folder glyph, brand mark, …).
 */
export function EntityIcon({
  icon,
  size = 16,
  color,
  strokeWidth = 1.75,
  className,
}: {
  icon: string | null | undefined;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = entityIconComponent(icon);
  if (!Icon) return null;
  // createElement keeps the chosen glyph out of JSX: the React compiler's
  // static-components rule reads a variable component in JSX as newly created
  // on every render, which would reset its state.
  return createElement(Icon, {
    "aria-hidden": true,
    className,
    style: { width: size, height: size, ...(color ? { color } : {}) },
    strokeWidth,
  });
}
