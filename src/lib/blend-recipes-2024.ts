import type { BlendIngredientInput, BlendRecipeSpiritSourceInput } from '../types';

/** Approximate bulk density for high-proof rum (93% ABV). */
export const LBS_PER_GAL_93_RUM = 7.0;
export const LBS_PER_GAL_WATER = 8.34;
export const LBS_PER_GAL_45_SPIRIT = 7.6;
export const LBS_PER_GAL_40_SPIRIT = 7.7;
export const LITERS_PER_GALLON = 3.785411784;

export interface BlendRecipeSeed {
  name: string;
  product_name: string;
  target_abv: number | null;
  target_brix: number | null;
  notes: string;
  spirit_sources: BlendRecipeSpiritSourceInput[];
  ingredients: BlendIngredientInput[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyIngredientFields(): Pick<
  BlendIngredientInput,
  'cost_per_unit' | 'lot_number' | 'inventory_item_id' | 'notes'
> {
  return {
    cost_per_unit: null,
    lot_number: '',
    inventory_item_id: null,
    notes: '',
  };
}

function spiritFromLbs(
  lbs: number,
  label: string,
  abv = 93,
  lbsPerGal = LBS_PER_GAL_93_RUM,
): BlendRecipeSpiritSourceInput {
  return {
    spirit_label: label,
    volume_gal: round2(lbs / lbsPerGal),
    abv,
  };
}

function spiritFromLiters(
  liters: number,
  label: string,
  abv = 93,
): BlendRecipeSpiritSourceInput {
  return {
    spirit_label: label,
    volume_gal: round2(liters / LITERS_PER_GALLON),
    abv,
  };
}

function waterFromLbs(lbs: number): BlendIngredientInput {
  return {
    ingredient_type: 'water',
    name: 'Proofing water',
    amount: round2(lbs / LBS_PER_GAL_WATER),
    unit: 'gal',
    ...emptyIngredientFields(),
  };
}

function sugarLbs(lbs: number, name: string): BlendIngredientInput {
  return {
    ingredient_type: 'sugar',
    name,
    amount: lbs,
    unit: 'lbs',
    ...emptyIngredientFields(),
  };
}

function sugarBags(count: number, name: string, lbsPerBag = 50): BlendIngredientInput {
  return sugarLbs(round2(count * lbsPerBag), name);
}

function flavorMl(ml: number, name: string): BlendIngredientInput {
  return {
    ingredient_type: 'flavoring',
    name,
    amount: ml,
    unit: 'ml',
    ...emptyIngredientFields(),
  };
}

function flavorLiters(liters: number, name: string): BlendIngredientInput {
  return flavorMl(round2(liters * 1000), name);
}

function colorMl(ml: number, name = 'YT75'): BlendIngredientInput {
  return {
    ingredient_type: 'color',
    name,
    amount: ml,
    unit: 'ml',
    ...emptyIngredientFields(),
  };
}

function syrupLbs(lbs: number, name: string): BlendIngredientInput {
  return {
    ingredient_type: 'syrup',
    name,
    amount: lbs,
    unit: 'lbs',
    ...emptyIngredientFields(),
  };
}

function otherGrams(amount: number, name: string, notes = ''): BlendIngredientInput {
  return {
    ingredient_type: 'other',
    name,
    amount,
    unit: 'g',
    ...emptyIngredientFields(),
    notes,
  };
}

function estimateTargetAbv(
  spirits: BlendRecipeSpiritSourceInput[],
  waterLbs: number,
): number | null {
  const spiritGal = spirits.reduce((sum, source) => sum + source.volume_gal, 0);
  const waterGal = waterLbs / LBS_PER_GAL_WATER;
  const totalGal = spiritGal + waterGal;
  if (totalGal <= 0) return null;
  const proofingGal = spirits.reduce((sum, source) => sum + source.volume_gal * source.abv, 0);
  return round1(proofingGal / totalGal);
}

function rumBlendRecipe(
  name: string,
  productName: string,
  batchNotes: string,
  rumLbs: number,
  waterLbs: number,
  rumLabel = '93% rum',
  ingredients: BlendIngredientInput[],
  rumAbv = 93,
): BlendRecipeSeed {
  const spirit = spiritFromLbs(rumLbs, rumLabel, rumAbv);
  return {
    name,
    product_name: productName,
    target_abv: estimateTargetAbv([spirit], waterLbs),
    target_brix: null,
    notes: batchNotes,
    spirit_sources: [spirit],
    ingredients: [waterFromLbs(waterLbs), ...ingredients],
  };
}

function ginBotanicalRecipe(
  name: string,
  botanicals: BlendIngredientInput[],
  notes: string,
): BlendRecipeSeed {
  return {
    name,
    product_name: name.replace(/^Gin — /, ''),
    target_abv: null,
    target_brix: null,
    notes,
    spirit_sources: [],
    ingredients: botanicals,
  };
}

/** Production blending formulas from RECEIPES 2024.docx */
export const BLEND_RECIPES_2024: BlendRecipeSeed[] = [
  rumBlendRecipe(
    'Dark Rum (60 cases)',
    'Dark Rum',
    '60 cases. 585 lbs 93% rum + 974 lbs water = 1,559 lbs total. 7 × 50 lb bags dark brown sugar. 1.75 L YT75 in 1 L bottles (12-pack boxes). Source: RECEIPES 2024.',
    585,
    974,
    '93% rum',
    [
      {
        ...sugarBags(7, 'Dark brown sugar'),
        notes: '7 × 50 lb bags',
      },
      {
        ...colorMl(1750, 'YT75'),
        notes: '1.75 L total; 1 L bottles from 12-pack boxes',
      },
    ],
  ),
  rumBlendRecipe(
    "Jack's Dark Rum (30 cases)",
    "Jack's Dark Rum",
    '249 lbs rum + 415 lbs water = 664 lbs total. Source: RECEIPES 2024.',
    249,
    415,
    '93% rum',
    [sugarBags(5, 'Dark brown sugar'), flavorMl(1750, 'YT75')],
  ),
  rumBlendRecipe(
    'Banana Rum (38 cases)',
    'Banana Rum',
    '311 lbs 93% rum + 482 lbs water = 793 lbs total. Source: RECEIPES 2024.',
    311,
    482,
    '93% rum',
    [
      syrupLbs(102, 'CS1 sweetener'),
      sugarBags(2, 'White sugar'),
      flavorMl(1950, 'Natural banana puree'),
      flavorMl(130, 'Natural banana flavor'),
    ],
  ),
  rumBlendRecipe(
    'Banana Rum (60 cases)',
    'Banana Rum',
    '491 lbs 93% rum + 761 lbs water = 1,252 lbs total. Source: RECEIPES 2024.',
    491,
    761,
    '93% rum',
    [
      flavorMl(210, 'Natural banana flavor'),
      flavorMl(3750, 'Banana puree'),
      sugarLbs(160, 'White sugar (3.2 bags)'),
      syrupLbs(161, 'CS1 sweetener'),
    ],
  ),
  rumBlendRecipe(
    'Coconut Rum (70 cases)',
    'Coconut Rum',
    '618 lbs 93% rum + 1,003 lbs water = 1,621 lbs total. Source: RECEIPES 2024.',
    618,
    1003,
    '93% rum',
    [sugarBags(8, 'White sugar'), flavorLiters(2.76, 'Natural coconut flavor')],
  ),
  rumBlendRecipe(
    'Spiced Rum (40 cases)',
    'Spiced Rum',
    '329.5 lbs 93% rum + 624.6 lbs water = 954.1 lbs total. Source: RECEIPES 2024.',
    329.5,
    624.6,
    '93% rum',
    [
      syrupLbs(53.3, 'CS1 sweetener'),
      flavorMl(400, 'Natural vanilla'),
      flavorMl(190, 'Artificial vanilla'),
      flavorMl(480, 'Natural spiced rum flavor'),
      colorMl(360),
    ],
  ),
  rumBlendRecipe(
    'Triple Sec (47 cases)',
    'Triple Sec',
    '305 lbs 93% rum + 740 lbs water = 1,045 lbs total. Source: RECEIPES 2024.',
    305,
    740,
    '93% rum',
    [sugarBags(5, 'White sugar'), flavorLiters(3.44, 'Triple sec natural flavor')],
  ),
  rumBlendRecipe(
    'Coffee Liqueur (60 cases)',
    'Coffee Liqueur',
    '387.24 lbs 93% rum + 950.48 lbs water = 1,337.72 lbs total. Source: RECEIPES 2024.',
    387.24,
    950.48,
    '93% rum',
    [
      sugarBags(16, 'White sugar'),
      flavorLiters(5.12, 'Glycerin'),
      flavorLiters(40, 'Coffee flavor'),
      flavorLiters(5.6, 'Chocolate flavor'),
      flavorLiters(7.56, 'YT75'),
    ],
  ),
  rumBlendRecipe(
    'Peach Schnapps (19 cases)',
    'Peach Schnapps',
    '121.9 lbs 93% rum + 252.18 lbs water = 374.1 lbs total. Source: RECEIPES 2024.',
    121.9,
    252.18,
    '93% rum',
    [
      flavorMl(1000, 'Natural peach'),
      flavorMl(150, 'Peach flavor'),
      sugarBags(3, 'White sugar'),
    ],
  ),
  rumBlendRecipe(
    '7 Mile Rum (38 cases)',
    '7 Mile Rum',
    '484 lbs 93% oaked rum + 816 lbs water = 1,300 lbs total. Add YT75 as needed for color match. Source: RECEIPES 2024.',
    484,
    816,
    '93% oaked rum',
    [{
      ingredient_type: 'color',
      name: 'YT75',
      amount: 0,
      unit: 'ml',
      ...emptyIngredientFields(),
      notes: 'Add as needed for color match',
    }],
  ),
  rumBlendRecipe(
    'Amaretto (47 cases)',
    'Amaretto',
    '305 lbs 93% rum + 721 lbs water = 1,026 lbs total. Source: RECEIPES 2024.',
    305,
    721,
    '93% rum',
    [
      sugarBags(5, 'White sugar'),
      flavorMl(4500, 'Amaretto flavor'),
      colorMl(561),
    ],
  ),
  rumBlendRecipe(
    'Blackberry (19 cases)',
    'Blackberry',
    '116.97 lbs 93% rum + 240.45 lbs water = 357.42 lbs total. Source: RECEIPES 2024.',
    116.97,
    240.45,
    '93% rum',
    [
      sugarBags(3, 'White sugar'),
      flavorMl(5000, 'Blackberry puree'),
      flavorMl(1072, 'Natural blackberry flavor'),
      colorMl(165.12, 'Purple coloring'),
    ],
  ),
  {
    name: '1780',
    product_name: '1780',
    target_abv: null,
    target_brix: null,
    notes: '12 L 7F + 8 L dark rum + 31 mL YT75. Source: RECEIPES 2024.',
    spirit_sources: [
      spiritFromLiters(12, '7F rum', 40),
      spiritFromLiters(8, 'Dark rum', 93),
    ],
    ingredients: [colorMl(31)],
  },
  {
    name: 'Tukka (216 L batch)',
    product_name: 'Tukka',
    target_abv: null,
    target_brix: null,
    notes: '216 L batch. Add YT75 as needed for color 250. Source: RECEIPES 2024.',
    spirit_sources: [
      spiritFromLiters(71.8, 'Gold rum', 40),
      spiritFromLiters(71.8, 'Dark rum', 40),
      spiritFromLiters(71.8, 'White rum', 40),
    ],
    ingredients: [
      flavorMl(432, 'Coffee flavor'),
      flavorMl(72, 'Artificial vanilla'),
      colorMl(144),
      flavorLiters(10, 'CS1 sweetener'),
      {
        ingredient_type: 'color',
        name: 'YT75',
        amount: 0,
        unit: 'ml',
        ...emptyIngredientFields(),
        notes: 'Add as needed for color 250',
      },
    ],
  },
  {
    name: 'Tukka (300 L batch)',
    product_name: 'Tukka',
    target_abv: null,
    target_brix: null,
    notes: '300 L batch variant. Source: RECEIPES 2024.',
    spirit_sources: [
      spiritFromLbs(200, 'White rum', 93),
      spiritFromLbs(200, 'Gold rum', 93),
      spiritFromLbs(200, 'Dark rum', 93),
    ],
    ingredients: [
      flavorMl(576, 'Coffee flavor'),
      flavorMl(96, 'Artificial vanilla'),
      flavorLiters(13.3, 'CS1 sweetener'),
      {
        ingredient_type: 'color',
        name: 'YT75',
        amount: 192,
        unit: 'ml',
        ...emptyIngredientFields(),
        notes: 'Add as needed',
      },
    ],
  },
  {
    name: 'Otis (250 gal batch)',
    product_name: 'Otis',
    target_abv: null,
    target_brix: null,
    notes: '225 gal 7F + 25 gal dark rum (90% / 10% split). Source: RECEIPES 2024.',
    spirit_sources: [
      { spirit_label: '7F rum', volume_gal: 225, abv: 40 },
      { spirit_label: 'Dark rum', volume_gal: 25, abv: 93 },
    ],
    ingredients: [],
  },
  {
    name: '7F Platinum',
    product_name: '7F Platinum',
    target_abv: null,
    target_brix: null,
    notes: '84.5 L 45% Governors rum + 957 mL heavy rum + 3.5 L 7F. Source: RECEIPES 2024.',
    spirit_sources: [
      spiritFromLiters(84.5, '45% Governors rum', 45),
      spiritFromLiters(0.957, 'Heavy rum', 93),
      spiritFromLiters(3.5, '7F rum', 40),
    ],
    ingredients: [],
  },
  {
    name: 'Morgans',
    product_name: 'Morgans',
    target_abv: null,
    target_brix: null,
    notes: '16 L spiced rum + 5 L 7F. Source: RECEIPES 2024.',
    spirit_sources: [
      spiritFromLiters(16, 'Spiced rum', 40),
      spiritFromLiters(5, '7F rum', 40),
    ],
    ingredients: [],
  },
  {
    name: 'Otis to Muse (20 L)',
    product_name: 'Muse',
    target_abv: null,
    target_brix: null,
    notes: '2 L 7F + 18 L Otis + 29 mL YT75. Source: RECEIPES 2024.',
    spirit_sources: [
      spiritFromLiters(2, '7F rum', 40),
      spiritFromLiters(18, 'Otis', 40),
    ],
    ingredients: [colorMl(29)],
  },
  {
    name: 'Otis to Muse (25 L)',
    product_name: 'Muse',
    target_abv: null,
    target_brix: null,
    notes: '2.5 L 7F + 22.5 L Otis + 36 mL YT75. Source: RECEIPES 2024.',
    spirit_sources: [
      spiritFromLiters(2.5, '7F rum', 40),
      spiritFromLiters(22.5, 'Otis', 40),
    ],
    ingredients: [colorMl(36)],
  },
  {
    name: 'Cookie Rum (50 L)',
    product_name: 'Cookie Rum',
    target_abv: estimateTargetAbv([spiritFromLiters(15, '93% rum', 93)], 63),
    target_brix: null,
    notes: '15 L (27 lbs) 93% rum + 29 L (63 lbs) water + 25 lbs sugar. Source: RECEIPES 2024.',
    spirit_sources: [spiritFromLiters(15, '93% rum', 93)],
    ingredients: [
      waterFromLbs(63),
      sugarLbs(25, 'Sugar'),
      flavorMl(350, 'Cookie flavor'),
      flavorMl(200, 'Natural vanilla'),
    ],
  },
  ginBotanicalRecipe(
    'Gin — Offshore',
    [
      otherGrams(758, 'Juniper'),
      otherGrams(758, 'Coriander'),
      otherGrams(75.8, 'Almonds'),
      otherGrams(75.8, 'Licorice root'),
      otherGrams(19, 'Angelica root'),
      otherGrams(50, 'Bitter orange', 'Basket charge'),
      otherGrams(17, 'Lemongrass', 'Basket charge'),
      otherGrams(50, 'Grapefruit peel', 'Basket charge'),
    ],
    'Botanical charge per still run. Source: RECEIPES 2024.',
  ),
  ginBotanicalRecipe(
    'Gin — Poseidon',
    [
      otherGrams(758, 'Juniper'),
      otherGrams(758, 'Coriander'),
      otherGrams(16, 'Grains of paradise'),
      otherGrams(116, 'Licorice root'),
      otherGrams(15, 'Orris root'),
      otherGrams(16, 'Lemongrass'),
      otherGrams(76, 'Almonds', 'Basket charge'),
      otherGrams(152, 'Sloe berries', 'Basket charge'),
      otherGrams(677, 'Coconut', 'Basket charge'),
      otherGrams(301, 'Pineapple', 'Basket charge'),
      otherGrams(16, 'Lemongrass', 'Basket charge'),
    ],
    'Botanical charge per still run. Source: RECEIPES 2024.',
  ),
  ginBotanicalRecipe(
    'Gin — A&D',
    [
      otherGrams(758, 'Juniper'),
      otherGrams(758, 'Coriander'),
      otherGrams(30, 'Cubeb berries'),
      otherGrams(15, 'White peppercorn'),
      otherGrams(152, 'Angelica root'),
      otherGrams(15, 'Orris root'),
      otherGrams(116, 'Cassia'),
      otherGrams(16, 'Cardamom'),
      otherGrams(16, 'Caraway seed'),
      otherGrams(10, 'Lemongrass', 'Basket charge'),
      otherGrams(30, 'Lemon peel', 'Basket charge'),
      otherGrams(10, 'Lime peel', 'Basket charge'),
      otherGrams(10, 'Chamomile', 'Basket charge'),
      otherGrams(10, 'Lavender', 'Basket charge'),
    ],
    'Botanical charge per still run. Source: RECEIPES 2024.',
  ),
  ginBotanicalRecipe(
    'Gin — Seville',
    [
      otherGrams(375, 'Juniper'),
      otherGrams(375, 'Coriander'),
      otherGrams(150, 'Sweet orange'),
      otherGrams(100, 'Sweet orange', 'Basket charge'),
      otherGrams(108, 'Sweet orange', 'Basket charge'),
      otherGrams(100, 'Bitter orange', 'Basket charge'),
      otherGrams(50, 'Bitter orange', 'Basket charge'),
      otherGrams(50, 'Citron', 'Basket charge'),
      otherGrams(30, 'Lime peel', 'Basket charge'),
      otherGrams(40, 'Tangerine peel', 'Basket charge'),
      otherGrams(30, 'Lemon peel', 'Basket charge'),
      otherGrams(50, 'Haiti bitter orange', 'Basket charge'),
    ],
    'Botanical charge per still run. Source: RECEIPES 2024.',
  ),
  ginBotanicalRecipe(
    'Gin — Pink',
    [
      otherGrams(1137, 'Juniper'),
      otherGrams(38, 'Coriander'),
      otherGrams(38, 'Grains of paradise'),
      otherGrams(341, 'Licorice'),
      otherGrams(38, 'Angelica'),
      otherGrams(38, 'Orris root'),
      otherGrams(95, 'Rose petals', 'Basket charge'),
      otherGrams(190, 'Orange peel', 'Basket charge'),
      otherGrams(57, 'Lavender', 'Basket charge'),
    ],
    'Botanical charge per still run. Source: RECEIPES 2024.',
  ),
  ginBotanicalRecipe(
    'Gin — Zest',
    [
      otherGrams(370, 'Grapefruit'),
      otherGrams(490, 'Sweet orange'),
      otherGrams(315, 'Bitter orange'),
      otherGrams(850, 'Lime peel'),
      otherGrams(50, 'Orris'),
      otherGrams(720, 'Coriander'),
      otherGrams(100, 'Lemon peel'),
    ],
    'Botanical charge per still run. Source: RECEIPES 2024.',
  ),
  ginBotanicalRecipe(
    'Gin — Glow',
    [
      otherGrams(100, 'Cinnamon'),
      otherGrams(20, 'Allspice'),
      otherGrams(50, 'Angelica root'),
      otherGrams(380, 'Coriander'),
      otherGrams(4, 'Anise'),
      otherGrams(4, 'Tonka beans (chopped)'),
      {
        ingredient_type: 'flavoring',
        name: 'Vanilla synth',
        amount: 0,
        unit: 'ml',
        ...emptyIngredientFields(),
        notes: 'In basket',
      },
    ],
    'Botanical charge per still run. Source: RECEIPES 2024.',
  ),
  {
    name: 'Bobos Vodka',
    product_name: 'Bobos Vodka',
    target_abv: null,
    target_brix: null,
    notes: '422 lbs GNS + 282 lbs corn vodka + 1,277 lbs water = 1,981 lbs total. Source: RECEIPES 2024.',
    spirit_sources: [
      spiritFromLbs(422, 'GNS tote', 95, LBS_PER_GAL_93_RUM),
      spiritFromLbs(282, 'Corn vodka (tank)', 40, LBS_PER_GAL_40_SPIRIT),
    ],
    ingredients: [waterFromLbs(1277)],
  },
  rumBlendRecipe(
    'Rum Cola / Ginger (canned cocktail)',
    'Rum Cola / Ginger',
    '112 lbs rum + 1,432 lbs water = 1,544 lbs total. Syrup 302 lbs. Source: RECEIPES 2024.',
    112,
    1432,
    '93% rum',
    [syrupLbs(302, 'Cola / ginger syrup')],
  ),
];
