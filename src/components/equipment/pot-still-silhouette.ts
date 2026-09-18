/** Side-view pot still paths (kettle, swan neck, lyne arm, condenser) for process view SVG. */

export const POT_STILL_VIEW = { width: 228, height: 200 } as const;

/** Wash kettle body — flat base, rounded pot, inward shoulder. */
export const POT_KETTLE_BODY =
  'M 14 170 H 92 V 160 Q 96 125 84 106 Q 72 90 52 90 Q 32 90 22 106 Q 14 125 14 155 Z';

/** Manway hatch on left shoulder. */
export const POT_MANWAY =
  'M 18 118 H 28 Q 32 118 32 124 Q 32 130 28 130 H 18 Q 14 130 14 124 Q 14 118 18 118 Z';

/** Onion / vapor bulb atop the kettle. */
export const POT_ONION =
  'M 36 90 Q 52 78 68 90 Q 74 98 68 106 Q 52 114 36 106 Q 30 98 36 90 Z';

/** Swan neck centerline (drawn with thick stroke). */
export const POT_SWAN_NECK =
  'M 60 88 Q 60 66 66 50 Q 76 36 96 34 Q 116 34 128 46 Q 136 56 138 58';

/** Lyne arm centerline. */
export const POT_LYNE_ARM = 'M 138 58 L 162 62';

/** Condenser column + receiver bulb. */
export const POT_CONDENSER =
  'M 162 46 H 186 V 90 Q 190 102 192 112 Q 196 132 178 140 Q 160 140 164 112 Q 166 102 162 90 Z';

export const POT_CONDENSER_OUTLET = { x: 188, y: 122, width: 20, height: 8 } as const;

/** Clip region for charge liquid inside the kettle. */
export const POT_LIQUID_CLIP =
  'M 20 168 H 86 Q 92 158 90 132 Q 86 112 52 108 Q 26 112 22 132 Q 20 152 20 168 Z';

export const POT_FLAME_CX = 52;
export const POT_LIQUID_BOUNDS = {
  x: 14,
  width: 78,
  innerHeight: 54,
  bottomY: 166,
  rx: 6,
} as const;
