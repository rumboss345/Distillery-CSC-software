#!/usr/bin/env python3
"""Build TTB Table 3 lookup data (proof -> PG at standard column weights)."""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "services" / "table3-data.generated.json"


def round_ttb(value: float) -> float:
    return round(value + 1e-9, 1)


def pg100_from_600(values: dict[int, float]) -> dict[int, float]:
    return {proof: round_ttb(v / 6.0) for proof, v in values.items()}


def pg100_from_1000(values: dict[int, float]) -> dict[int, float]:
    return {proof: round_ttb(v / 10.0) for proof, v in values.items()}


# Page 8 — proof 51–100, 600 lb column (validated against page 7 100 lb column)
PG_600_51_100 = {
    51: 37.9, 52: 38.6, 53: 39.4, 54: 40.2, 55: 40.9,
    56: 41.7, 57: 42.5, 58: 43.2, 59: 44.0, 60: 44.8,
    61: 45.6, 62: 46.3, 63: 47.1, 64: 47.9, 65: 48.7,
    66: 49.4, 67: 50.2, 68: 51.0, 69: 51.8, 70: 52.6,
    71: 53.4, 72: 54.2, 73: 55.0, 74: 55.8, 75: 56.6,
    76: 57.3, 77: 58.1, 78: 59.0, 79: 59.8, 80: 60.6,
    81: 61.4, 82: 62.2, 83: 63.0, 84: 63.8, 85: 64.6,
    86: 65.4, 87: 66.3, 88: 67.1, 89: 67.9, 90: 68.7,
    91: 69.6, 92: 70.4, 93: 71.2, 94: 72.1, 95: 72.9,
    96: 73.7, 97: 74.6, 98: 75.4, 99: 76.3, 100: 77.1,
}

# Page 12 — proof 101–150, 100 lb column
PG_100_101_150 = {
    101: 13.0, 102: 13.1, 103: 13.3, 104: 13.4, 105: 13.6,
    106: 13.7, 107: 13.9, 108: 14.0, 109: 14.2, 110: 14.3,
    111: 14.5, 112: 14.6, 113: 14.8, 114: 14.9, 115: 15.0,
    116: 15.2, 117: 15.3, 118: 15.5, 119: 15.6, 120: 15.8,
    121: 15.9, 122: 16.1, 123: 16.2, 124: 16.4, 125: 16.5,
    126: 16.7, 127: 16.8, 128: 17.0, 129: 17.1, 130: 17.3,
    131: 17.5, 132: 17.6, 133: 17.8, 134: 17.9, 135: 18.1,
    136: 18.2, 137: 18.4, 138: 18.5, 139: 18.7, 140: 18.9,
    141: 19.1, 142: 19.2, 143: 19.4, 144: 19.5, 145: 19.7,
    146: 19.8, 147: 20.0, 148: 20.1, 149: 20.3, 150: 20.5,
}

# Page 17 — proof 151–200, 100 lb column
PG_100_151_200 = {
    151: 20.7, 152: 20.9, 153: 21.1, 154: 21.3, 155: 21.5,
    156: 21.7, 157: 21.9, 158: 22.1, 159: 22.3, 160: 22.2,
    161: 22.4, 162: 22.6, 163: 22.8, 164: 23.0, 165: 23.2,
    166: 23.4, 167: 23.6, 168: 23.8, 169: 24.0, 170: 24.0,
    171: 24.2, 172: 24.4, 173: 24.6, 174: 24.8, 175: 25.0,
    176: 25.2, 177: 25.4, 178: 25.6, 179: 25.8, 180: 25.9,
    181: 26.1, 182: 26.3, 183: 26.5, 184: 26.7, 185: 26.9,
    186: 27.1, 187: 27.3, 188: 27.5, 189: 27.7, 190: 28.0,
    191: 28.2, 192: 28.4, 193: 28.6, 194: 28.8, 195: 29.0,
    196: 29.2, 197: 29.4, 198: 29.6, 199: 29.8, 200: 30.3,
}

# Fix page 17 transcription: use image-verified anchors for 160, 170, 180, 190, 200
PG_100_151_200.update({
    160: 22.2, 170: 24.0, 180: 25.9, 190: 28.0, 200: 30.3,
})

# Page 3 — proof 1–50, 1000 lb column
PG_1000_1_50 = {
    1: 1.2, 2: 2.4, 3: 3.6, 4: 4.8, 5: 6.0,
    6: 7.2, 7: 8.5, 8: 9.7, 9: 10.9, 10: 12.1,
    11: 13.3, 12: 14.5, 13: 15.7, 14: 16.9, 15: 18.1,
    16: 19.4, 17: 20.6, 18: 21.8, 19: 23.0, 20: 24.3,
    21: 25.5, 22: 26.7, 23: 27.9, 24: 29.1, 25: 30.4,
    26: 31.6, 27: 32.8, 28: 34.0, 29: 35.2, 30: 36.7,
    31: 37.9, 32: 39.1, 33: 40.3, 34: 41.5, 35: 42.8,
    36: 44.0, 37: 45.2, 38: 46.4, 39: 47.6, 40: 49.2,
    41: 50.4, 42: 51.6, 43: 52.8, 44: 54.0, 45: 55.3,
    46: 56.5, 47: 57.7, 48: 58.9, 49: 60.1, 50: 61.9,
}

# Interpolate 1-50 between anchors from page 3/4 samples where missing
ANCHOR_1000 = {1: 1.2, 5: 6.0, 10: 12.1, 20: 24.3, 25: 30.4, 30: 36.7, 40: 49.2, 50: 61.9}
for proof in range(1, 51):
    if proof not in PG_1000_1_50:
        lower = max(p for p in ANCHOR_1000 if p <= proof)
        upper = min(p for p in ANCHOR_1000 if p >= proof)
        if lower == upper:
            PG_1000_1_50[proof] = ANCHOR_1000[lower]
        else:
            ratio = (proof - lower) / (upper - lower)
            PG_1000_1_50[proof] = ANCHOR_1000[lower] + ratio * (ANCHOR_1000[upper] - ANCHOR_1000[lower])
            PG_1000_1_50[proof] = round_ttb(PG_1000_1_50[proof])

PG_AT_100: dict[str, float] = {}
PG_AT_100.update({str(k): v for k, v in pg100_from_1000(PG_1000_1_50).items()})
PG_AT_100.update({str(k): v for k, v in pg100_from_600(PG_600_51_100).items()})
PG_AT_100.update({str(k): v for k, v in PG_100_101_150.items()})
PG_AT_100.update({str(k): v for k, v in PG_100_151_200.items()})
PG_AT_100["0"] = 0.0

# Override with page 7 direct 100 lb values where available
PAGE7_100 = {
    51: 6.3, 52: 6.4, 53: 6.6, 54: 6.7, 55: 6.8,
    56: 6.9, 57: 7.1, 58: 7.2, 59: 7.3, 60: 7.5,
    61: 7.6, 62: 7.7, 63: 7.9, 64: 8.0, 65: 8.1,
    66: 8.2, 67: 8.4, 68: 8.5, 69: 8.6, 70: 8.8,
    71: 8.9, 72: 9.0, 73: 9.2, 74: 9.3, 75: 9.4,
    76: 9.6, 77: 9.7, 78: 9.8, 79: 9.9, 80: 10.1,
    81: 10.2, 82: 10.4, 83: 10.5, 84: 10.6, 85: 10.8,
    86: 10.9, 87: 11.0, 88: 11.2, 89: 11.3, 90: 11.5,
    91: 11.6, 92: 11.7, 93: 11.9, 94: 12.0, 95: 12.1,
    96: 12.3, 97: 12.4, 98: 12.6, 99: 12.7, 100: 12.9,
}
PG_AT_100.update({str(k): v for k, v in PAGE7_100.items()})

# Sparse exact column overrides from CFR + table pages (proof:columnWeight -> PG)
EXACT_COLUMNS: dict[str, float] = {}

def add_exact(proof: int, weight: int, pg: float) -> None:
    EXACT_COLUMNS[f"{proof}:{weight}"] = pg

# CFR §30.63 examples at 190 proof
add_exact(190, 60000, 16778.4)
add_exact(190, 300, 83.9)
add_exact(190, 700, 195.7)
add_exact(190, 800, 223.7)
add_exact(190, 1000, 279.6)
add_exact(190, 6000, 1677.8)

# CFR §30.63 at 86 proof
add_exact(86, 300, 32.7)
add_exact(86, 200, 21.8)
add_exact(86, 100, 10.9)
add_exact(86, 500, 54.5)

# Page 17 anchors
for proof, pg100 in PG_100_151_200.items():
    add_exact(proof, 100, pg100)
    add_exact(proof, 200, round_ttb(pg100 * 2))
    add_exact(proof, 300, round_ttb(pg100 * 3))
    add_exact(proof, 400, round_ttb(pg100 * 4))
    add_exact(proof, 500, round_ttb(pg100 * 5))

# Page 17 verified rows (100–500 lb columns)
for proof, row in {
    151: [20.7, 41.4, 62.1, 82.8, 103.5],
    160: [22.2, 44.5, 66.7, 89.0, 111.2],
    170: [24.0, 48.1, 72.1, 96.1, 120.2],
    180: [25.9, 51.9, 77.8, 103.7, 129.6],
    190: [28.0, 55.9, 83.9, 111.9, 139.8],
    200: [30.3, 60.5, 90.8, 121.0, 151.3],
}.items():
    for weight, pg in zip([100, 200, 300, 400, 500], row):
        add_exact(proof, weight, pg)

# Page 7 / 8 — proof 51–100 standard columns (sample anchors + full 80/86/100 rows)
for proof, row in {
    80: [10.1, 20.2, 30.3, 40.4, 50.5, 60.6, 70.7, 80.7, 90.8, 100.9],
    86: [10.9, 21.8, 32.7, 43.6, 54.5, 65.4, 76.3, 87.2, 98.2, 109.1],
    100: [12.9, 25.7, 38.6, 51.4, 64.3, 77.1, 90.0, 102.8, 115.7, 128.5],
}.items():
    for weight, pg in zip([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], row):
        add_exact(proof, weight, pg)

# Page 12 — proof 101–150, 100 & 500 lb columns
for proof, pg100, pg500 in [
    (101, 13.0, 65.0), (110, 14.3, 71.5), (120, 15.8, 78.9), (130, 17.3, 86.5),
    (140, 18.9, 94.5), (150, 20.5, 102.7),
]:
    add_exact(proof, 100, pg100)
    add_exact(proof, 500, pg500)

# Page 18 — proof 151–200, 600–1000 lb columns
for proof, row in {
    190: [167.8, 195.7, 223.7, 251.7, 279.6],
    200: [181.5, 211.8, 242.1, 272.3, 302.6],
}.items():
    for weight, pg in zip([600, 700, 800, 900, 1000], row):
        add_exact(proof, weight, pg)

# Page 13 — 120 proof row
add_exact(120, 100, 15.8)
add_exact(120, 200, 31.6)
add_exact(120, 300, 47.3)
add_exact(120, 400, 63.1)
add_exact(120, 500, 78.9)
add_exact(120, 600, 94.7)
add_exact(120, 700, 110.4)
add_exact(120, 800, 126.2)
add_exact(120, 900, 142.0)
add_exact(120, 1000, 157.8)

payload = {
    "source": "TTB Gauging Manual Table No. 3 (27 CFR §30.63)",
    "pgAt100Lb": PG_AT_100,
    "exactColumns": EXACT_COLUMNS,
    "standardColumnWeights": [
        100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
        2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000,
        30000, 40000, 50000, 60000, 70000,
    ],
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, indent=2))
print(f"Wrote {OUT}")