export type Settings = {
  volume: number;
  screenShake: boolean;
  highContrast: boolean;
  showDamageText: boolean;
};

export type HudState = {
  timeSeconds: number;
  level: number;
  hp: number;
  seed: number;
  dashCooldownRemaining: number;
  dashCooldownTotal: number;
  xp: number;
  xpToNext: number;
  weaponName: string;
};

export type UpgradeRarity = 'common' | 'rare' | 'epic';

export type DraftOption = {
  id: string;
  title: string;
  description: string;
  rarity: UpgradeRarity;
  icon: string;
};

export type UpgradeInventoryItem = {
  id: string;
  icon: string;
  label: string;
  stacks: number;
};

export type DraftState = {
  active: boolean;
  options: DraftOption[];
};

export type VirtualStickInput = {
  x: number;
  y: number;
  active: boolean;
};

export type DebugState = {
  fps: number;
  dtMs: number;
  entities: number;
  seed: number;
  paused: boolean;
  enabled: boolean;
};
