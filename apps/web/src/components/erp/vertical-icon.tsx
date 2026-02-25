'use client';

import {
  ShoppingBag,
  UtensilsCrossed,
  Layers,
  Hotel,
  Flag,
  PartyPopper,
  Wine,
  Coffee,
  Truck,
  Scissors,
  Sparkles,
  Dumbbell,
  Heart,
  Smile,
  Stethoscope,
  Activity,
  Wrench,
  Droplets,
  Shirt,
  Flower2,
  Dog,
  Printer,
  GraduationCap,
  Landmark,
  HeartHandshake,
  Anchor,
  Tent,
  Recycle,
  Hammer,
  GlassWater,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  ShoppingBag,
  UtensilsCrossed,
  Layers,
  Hotel,
  Flag,
  PartyPopper,
  Wine,
  Coffee,
  Truck,
  Scissors,
  Sparkles,
  Dumbbell,
  Heart,
  Smile,
  Stethoscope,
  Activity,
  Wrench,
  Droplets,
  Shirt,
  Flower2,
  Dog,
  Printer,
  GraduationCap,
  Landmark,
  HeartHandshake,
  Anchor,
  Tent,
  Recycle,
  Hammer,
  GlassWater,
  Building2,
};

export function VerticalIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICON_MAP[name] ?? Building2;
  return <Icon className={className} />;
}
