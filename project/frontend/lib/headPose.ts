/**
 * Head pose maths.
 *
 * MediaPipe's FaceLandmarker can return a 4x4 facial transformation matrix.
 * The upper-left 3x3 block is a rotation matrix, and yaw / pitch / roll fall
 * straight out of it - no solvePnP needed on the client.
 *
 * Sign conventions used everywhere in the app:
 *   yaw   < 0  ->  head turned to the user's LEFT
 *   pitch > 0  ->  head tilted UP
 *   roll       ->  head tilted toward a shoulder (recorded, never judged)
 *
 * Nothing here decides that anyone is cheating. It converts geometry into a
 * label; how long that label persists is what the tracker cares about.
 */

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
  direction_x: "LEFT" | "CENTER" | "RIGHT";
  direction_y: "UP" | "CENTER" | "DOWN";
}

export interface HeadPoseConfig {
  center_tolerance: number;
  warning_yaw: number;
  warning_pitch: number;
  critical_yaw: number;
  critical_pitch: number;
  warning_duration: number;
  suspicious_duration: number;
  face_check_interval_seconds: number;
}

/**
 * Fallback used only until GET /api/face/config responds. The server copy in
 * app/config.py is the source of truth; these numbers exist so the first
 * second of tracking is not undefined.
 */
export const DEFAULT_HEAD_POSE_CONFIG: HeadPoseConfig = {
  center_tolerance: 12,
  warning_yaw: 15,
  warning_pitch: 15,
  critical_yaw: 25,
  critical_pitch: 25,
  warning_duration: 3,
  suspicious_duration: 8,
  face_check_interval_seconds: 7,
};

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert a MediaPipe 4x4 transformation matrix (row-major, length 16) into
 * Euler angles in degrees.
 */
export function poseFromMatrix(matrix: number[], config: HeadPoseConfig): HeadPose | null {
  if (!matrix || matrix.length < 16) return null;

  // Row-major 4x4 -> rotation elements.
  const r00 = matrix[0];
  const r10 = matrix[4];
  const r20 = matrix[8];
  const r21 = matrix[9];
  const r22 = matrix[10];

  const sy = Math.sqrt(r00 * r00 + r10 * r10);
  if (sy < 1e-6) return null; // gimbal lock: the estimate would be noise

  let pitch = Math.atan2(-r21, r22) * RAD_TO_DEG;
  const yaw = Math.atan2(r20, sy) * RAD_TO_DEG;
  const roll = Math.atan2(-r10, r00) * RAD_TO_DEG;

  // An upright head reads near ±180 on this axis; fold it back so that
  // "looking straight ahead" is ~0 rather than ~180.
  if (pitch > 90) pitch -= 180;
  else if (pitch < -90) pitch += 180;

  // Both axes come out of the matrix reversed from the convention used across
  // the app (positive yaw = turned to the user's right, positive pitch = chin
  // up). Without these flips, "หันซ้าย" only passed when turning right and
  // "เงยหน้า" only passed when looking down.
  pitch = -pitch;
  const signedYaw = -yaw;

  return {
    yaw: signedYaw,
    pitch,
    roll,
    direction_x: classifyX(signedYaw, config),
    direction_y: classifyY(pitch, config),
  };
}

export function classifyX(yaw: number, config: HeadPoseConfig): HeadPose["direction_x"] {
  if (yaw <= -config.center_tolerance) return "LEFT";
  if (yaw >= config.center_tolerance) return "RIGHT";
  return "CENTER";
}

export function classifyY(pitch: number, config: HeadPoseConfig): HeadPose["direction_y"] {
  if (pitch >= config.center_tolerance) return "UP";
  if (pitch <= -config.center_tolerance) return "DOWN";
  return "CENTER";
}

/** True when the head is far enough off-center to start a warning timer. */
export function exceedsWarning(pose: HeadPose, config: HeadPoseConfig): boolean {
  return (
    Math.abs(pose.yaw) >= config.warning_yaw || Math.abs(pose.pitch) >= config.warning_pitch
  );
}

export function exceedsCritical(pose: HeadPose, config: HeadPoseConfig): boolean {
  return (
    Math.abs(pose.yaw) >= config.critical_yaw || Math.abs(pose.pitch) >= config.critical_pitch
  );
}

/** The event name that matches a sustained off-center pose. */
export function poseEventType(pose: HeadPose): string {
  if (pose.direction_x === "LEFT") return "LOOKING_LEFT";
  if (pose.direction_x === "RIGHT") return "LOOKING_RIGHT";
  if (pose.direction_y === "UP") return "LOOKING_UP";
  if (pose.direction_y === "DOWN") return "LOOKING_DOWN";
  return "HEAD_POSE_WARNING";
}

export type EnrollPose = "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";

export const ENROLL_SEQUENCE: EnrollPose[] = ["CENTER", "LEFT", "RIGHT", "UP", "DOWN"];

export const ENROLL_INSTRUCTIONS: Record<EnrollPose, string> = {
  CENTER: "กรุณามองตรงมาที่กล้อง",
  LEFT: "กรุณาหันหน้าไปทางซ้ายเล็กน้อย",
  RIGHT: "กรุณาหันหน้าไปทางขวาเล็กน้อย",
  UP: "กรุณาเงยหน้าขึ้นเล็กน้อย",
  DOWN: "กรุณาก้มหน้าลงเล็กน้อย",
};

/**
 * Whether the current head pose satisfies the pose the user is being asked
 * to hold. Uses a slightly smaller angle than the anti-cheat warning so the
 * step is reachable without an uncomfortable turn.
 */
export function matchesEnrollPose(
  pose: HeadPose,
  target: EnrollPose,
  config: HeadPoseConfig
): boolean {
  const yawTarget = config.warning_yaw;
  const pitchTarget = config.warning_pitch;

  switch (target) {
    case "CENTER":
      return (
        Math.abs(pose.yaw) < config.center_tolerance &&
        Math.abs(pose.pitch) < config.center_tolerance
      );
    case "LEFT":
      return pose.yaw <= -yawTarget;
    case "RIGHT":
      return pose.yaw >= yawTarget;
    case "UP":
      return pose.pitch >= pitchTarget;
    case "DOWN":
      return pose.pitch <= -pitchTarget;
    default:
      return false;
  }
}

/** Live nudge shown while the user is still short of the target angle. */
export function enrollHint(
  pose: HeadPose | null,
  target: EnrollPose,
  config: HeadPoseConfig
): string {
  if (!pose) return "ไม่พบใบหน้า กรุณาจัดใบหน้าให้อยู่ในกรอบ";
  if (matchesEnrollPose(pose, target, config)) return "อยู่ในตำแหน่งแล้ว กำลังบันทึก...";

  switch (target) {
    case "CENTER":
      return "กรุณาหันหน้าตรงเข้าหากล้อง";
    case "LEFT":
      return pose.yaw > 0 ? "หันผิดทาง กรุณาหันไปทางซ้าย" : "หันไปทางซ้ายอีกเล็กน้อย";
    case "RIGHT":
      return pose.yaw < 0 ? "หันผิดทาง กรุณาหันไปทางขวา" : "หันไปทางขวาอีกเล็กน้อย";
    case "UP":
      return pose.pitch < 0 ? "เงยหน้าขึ้น ไม่ใช่ก้มลง" : "เงยหน้าขึ้นอีกเล็กน้อย";
    case "DOWN":
      return pose.pitch > 0 ? "ก้มหน้าลง ไม่ใช่เงยขึ้น" : "ก้มหน้าลงอีกเล็กน้อย";
    default:
      return "";
  }
}


/**
 * Framing checks, kept next to the pose maths so the numbers live in one file.
 *
 * A face that is too small, off to one side, or half out of frame produces a
 * weak embedding that then fails verification on exam day. Catching it during
 * enrollment is much kinder than catching it when the exam is about to start.
 */
export interface FaceFraming {
  centerX: number;
  centerY: number;
  span: number;
}

export const FRAMING = {
  minSpan: 0.32,
  maxSpan: 0.85,
  centerXRange: [0.34, 0.66] as const,
  centerYRange: [0.3, 0.72] as const,
};

export type FramingIssue =
  | "TOO_FAR"
  | "TOO_CLOSE"
  | "OFF_LEFT"
  | "OFF_RIGHT"
  | "OFF_TOP"
  | "OFF_BOTTOM"
  | null;

export function checkFraming(box: FaceFraming | null): FramingIssue {
  if (!box) return null;
  if (box.span < FRAMING.minSpan) return "TOO_FAR";
  if (box.span > FRAMING.maxSpan) return "TOO_CLOSE";
  // The preview is mirrored, so a face sitting at a low x appears on the
  // viewer's right. The hints below are written from the user's point of view.
  if (box.centerX < FRAMING.centerXRange[0]) return "OFF_RIGHT";
  if (box.centerX > FRAMING.centerXRange[1]) return "OFF_LEFT";
  if (box.centerY < FRAMING.centerYRange[0]) return "OFF_TOP";
  if (box.centerY > FRAMING.centerYRange[1]) return "OFF_BOTTOM";
  return null;
}

export const FRAMING_HINTS: Record<NonNullable<FramingIssue>, string> = {
  TOO_FAR: "ขยับเข้าใกล้กล้องอีกนิด",
  TOO_CLOSE: "ถอยห่างจากกล้องเล็กน้อย",
  OFF_LEFT: "ขยับไปทางขวาให้อยู่กลางกรอบ",
  OFF_RIGHT: "ขยับไปทางซ้ายให้อยู่กลางกรอบ",
  OFF_TOP: "ขยับลงให้ใบหน้าอยู่กลางกรอบ",
  OFF_BOTTOM: "ขยับขึ้นให้ใบหน้าอยู่กลางกรอบ",
};
