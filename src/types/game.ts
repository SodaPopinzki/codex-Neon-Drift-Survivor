export type Settings = {
  volume: number;
  screenShake: boolean;
  highContrast: boolean;
};

export type HudState = {
  timeSeconds: number;
  level: number;
  hp: number;
};

export type VirtualStickInput = {
  x: number;
  y: number;
  active: boolean;
};
