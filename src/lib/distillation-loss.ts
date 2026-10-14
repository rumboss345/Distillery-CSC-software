import { roundAlcohol } from './reporting/alcohol-units';
import { estimateAbvFromBrix } from './fermentation';

export type AlcoholChargeBasis = 'charge' | 'proofed_spirit' | 'estimated_brix' | 'unknown';

export interface DistillationAlcoholCut {
  volume_gal: number;
  abv: number;
}

export interface DistillationAlcoholBalance {
  chargedGal: number | null;
  collectedGal: number;
  lossGal: number | null;
  /** ABV used for the charge when it is not a proofed spirit pull. */
  chargeAbv: number | null;
  basis: AlcoholChargeBasis;
}

function alcoholGal(volumeGal: number, abv: number): number {
  if (!Number.isFinite(volumeGal) || !Number.isFinite(abv) || volumeGal <= 0 || abv <= 0) return 0;
  return volumeGal * (abv / 100);
}

/** Wash ABV from starting Brix and the latest Brix, when both are known. */
export function washChargeAbvFromBrix(
  startBrix: number | null | undefined,
  currentBrix: number | null | undefined,
): number | null {
  if (startBrix == null || currentBrix == null) return null;
  return estimateAbvFromBrix(startBrix, currentBrix);
}

/**
 * Alcohol charged into the still versus alcohol in the cuts.
 * The difference is charged alcohol minus collected alcohol.
 * When more alcohol is collected than was charged, that difference is a gain.
 * Proofing water is not alcohol: a proofed charge uses the spirit pulled.
 */
export function distillationAlcoholBalance(input: {
  chargeVolumeGal: number;
  chargeAbv: number | null;
  proofSpiritGal?: number | null;
  proofSpiritAbv?: number | null;
  proofWaterGal?: number | null;
  /** Set when chargeAbv was filled from Brix rather than a reading on the run. */
  estimatedFromBrix?: boolean;
  cuts: DistillationAlcoholCut[];
}): DistillationAlcoholBalance {
  const collectedGal = roundAlcohol(
    input.cuts.reduce((sum, cut) => sum + alcoholGal(cut.volume_gal, cut.abv), 0),
  );
  const proofed = (input.proofWaterGal ?? 0) > 0.001
    && input.proofSpiritGal != null
    && input.proofSpiritAbv != null
    && input.proofSpiritGal > 0
    && input.proofSpiritAbv > 0;

  if (proofed && input.proofSpiritGal != null && input.proofSpiritAbv != null) {
    const chargedGal = roundAlcohol(alcoholGal(input.proofSpiritGal, input.proofSpiritAbv));
    return {
      chargedGal,
      collectedGal,
      lossGal: roundAlcohol(chargedGal - collectedGal),
      chargeAbv: input.proofSpiritAbv,
      basis: 'proofed_spirit',
    };
  }

  if (input.chargeAbv != null && input.chargeAbv > 0 && input.chargeVolumeGal > 0) {
    const chargedGal = roundAlcohol(alcoholGal(input.chargeVolumeGal, input.chargeAbv));
    return {
      chargedGal,
      collectedGal,
      lossGal: roundAlcohol(chargedGal - collectedGal),
      chargeAbv: input.chargeAbv,
      basis: input.estimatedFromBrix ? 'estimated_brix' : 'charge',
    };
  }

  return {
    chargedGal: null,
    collectedGal,
    lossGal: null,
    chargeAbv: null,
    basis: 'unknown',
  };
}

/**
 * ABV of the alcohol left in the stillage.
 * The alcohol not collected is the loss. When stillage volume is known, that
 * loss has a strength: alcohol gallons divided by stillage gallons.
 */
export function stillageResidualAbv(
  alcoholLossGal: number | null | undefined,
  stillageVolumeGal: number | null | undefined,
): number | null {
  if (alcoholLossGal == null || stillageVolumeGal == null) return null;
  if (!(alcoholLossGal > 0.01) || !(stillageVolumeGal > 0.01)) return null;
  const alcoholGal = Math.min(alcoholLossGal, stillageVolumeGal);
  const abv = (alcoholGal / stillageVolumeGal) * 100;
  if (!Number.isFinite(abv) || abv <= 0) return null;
  return abv;
}

export function formatDistillationLossGal(lossGal: number): string {
  const rounded = Math.round(Math.abs(lossGal) * 100) / 100;
  return `${rounded.toFixed(2)} gal`;
}

/** "Loss 1.60 gal" or "Gain 0.80 gal". Collected alcohol above the charge is a gain. */
export function formatDistillationAlcoholResult(lossGal: number): string {
  const rounded = Math.round(lossGal * 100) / 100;
  const label = rounded < 0 ? 'Gain' : 'Loss';
  return `${label} ${formatDistillationLossGal(rounded)}`;
}

/** One line for the cuts screen and the run list. */
export function formatDistillationLossSummary(balance: DistillationAlcoholBalance): string {
  if (balance.lossGal == null || balance.chargedGal == null) {
    if (balance.collectedGal > 0) {
      return `Collected ${balance.collectedGal.toFixed(2)} gal alcohol. The alcohol in the charge is not known, so loss is not recorded.`;
    }
    return 'No alcohol collected yet.';
  }
  const basisNote = balance.basis === 'estimated_brix'
    ? `Wash ABV ${balance.chargeAbv?.toFixed(1)}% estimated from Brix. `
    : balance.basis === 'proofed_spirit'
      ? 'Compared with the spirit charged, before proofing water. '
      : balance.chargeAbv != null
        ? `Charge ${balance.chargeAbv.toFixed(1)}% ABV. `
        : '';
  return `${basisNote}Alcohol charged ${balance.chargedGal.toFixed(2)} gal. Collected ${balance.collectedGal.toFixed(2)} gal. ${formatDistillationAlcoholResult(balance.lossGal)} alcohol.`;
}
