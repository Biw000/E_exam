import type { FaceLandmarker } from "@mediapipe/tasks-vision";

/**
 * Lazily creates a single FaceLandmarker and shares it across every component
 * that needs face tracking.
 *
 * Two reasons this is a singleton: the WASM bundle and the .task model are a
 * few megabytes, and each instance holds its own GPU context. The exam page
 * mounts the tracker and the enrollment page mounts it again on a fast
 * navigation, so creating one per component would leak contexts until the tab
 * ran out of them.
 *
 * Everything is imported dynamically so the MediaPipe bundle never ends up in
 * the server build - it only touches `window`/WebGL and would break SSR.
 */

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let instance: FaceLandmarker | null = null;
let loading: Promise<FaceLandmarker> | null = null;

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (instance) return instance;
  if (loading) return loading;

  loading = (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);

    let landmarker: FaceLandmarker;
    try {
      landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 2, // 2 so a second person in frame is detectable, not just ignored
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });
    } catch {
      // Some machines have no usable WebGL context (remote desktop, locked-down
      // drivers). CPU is slower but keeps the exam usable.
      landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });
    }

    instance = landmarker;
    return landmarker;
  })();

  try {
    return await loading;
  } catch (err) {
    loading = null; // allow a retry on the next call
    throw err;
  }
}

export function isFaceLandmarkerReady(): boolean {
  return instance !== null;
}
