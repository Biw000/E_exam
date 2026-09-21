/**
 * Eye signals from MediaPipe blendshapes.
 *
 * The Face Landmarker can score 52 facial "blendshapes" from 0 to 1. Six per
 * eye matter here: eyeBlink, and eyeLook{In,Out,Up,Down}. No extra model is
 * involved - these come from the same landmarker already running for head pose.
 *
 * Honest limits, stated once so nobody over-reads the output:
 *   - A webcam without calibration cannot say WHERE on the screen someone is
 *     looking, only roughly whether the eyes are turned away from centre.
 *   - Reading the last line of a question looks like "looking down".
 *   - Glasses, glare and low light all degrade the scores.
 * So gaze is logged for review and is never, on its own, a strike.
 */

export interface EyeMetrics {
  /** 0 = open, 1 = closed. */
  blinkLeft: number;
  blinkRight: number;
  /** Negative = looking toward the user's left, positive = right. */
  gazeX: number;
  /** Negative = looking down, positive = up. */
  gazeY: number;
}

type Category = { categoryName: string; score: number };

function score(categories: Category[], name: string): number {
  return categories.find((c) => c.categoryName === name)?.score ?? 0;
}

export function eyesFromBlendshapes(categories: Category[] | undefined): EyeMetrics | null {
  if (!categories?.length) return null;

  const lookOutLeft = score(categories, "eyeLookOutLeft");
  const lookInLeft = score(categories, "eyeLookInLeft");
  const lookOutRight = score(categories, "eyeLookOutRight");
  const lookInRight = score(categories, "eyeLookInRight");

  // Both eyes rotate together. Looking to the user's left moves the left eye
  // outward and the right eye inward, so those two scores add up for "left".
  const toLeft = (lookOutLeft + lookInRight) / 2;
  const toRight = (lookOutRight + lookInLeft) / 2;

  const up = (score(categories, "eyeLookUpLeft") + score(categories, "eyeLookUpRight")) / 2;
  const down = (score(categories, "eyeLookDownLeft") + score(categories, "eyeLookDownRight")) / 2;

  return {
    blinkLeft: score(categories, "eyeBlinkLeft"),
    blinkRight: score(categories, "eyeBlinkRight"),
    gazeX: toRight - toLeft,
    gazeY: up - down,
  };
}

export function eyesClosed(eyes: EyeMetrics, threshold: number): boolean {
  return eyes.blinkLeft >= threshold && eyes.blinkRight >= threshold;
}

export function gazeDirection(eyes: EyeMetrics, threshold: number): string | null {
  // Closed eyes report meaningless look scores, so ignore gaze mid-blink.
  if (eyesClosed(eyes, 0.5)) return null;
  if (eyes.gazeX <= -threshold) return "LEFT";
  if (eyes.gazeX >= threshold) return "RIGHT";
  if (eyes.gazeY >= threshold) return "UP";
  if (eyes.gazeY <= -threshold) return "DOWN";
  return null;
}
