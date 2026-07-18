const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const FormData = require("form-data");
const fetch = require("node-fetch");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const PYTHON_BIN = process.env.PYTHON_BIN || "python";
const SKIP_GRADCAM = process.env.SKIP_GRADCAM === "true";
const AI_GATEWAY_SHARED_SECRET = process.env.AI_GATEWAY_SHARED_SECRET || "";
const REQUIRE_AI_GATEWAY_SIGNATURE = process.env.REQUIRE_AI_GATEWAY_SIGNATURE !== "false";
const ENABLE_PUBLIC_DEMO = process.env.ENABLE_PUBLIC_DEMO === "true";
const MAX_SIGNATURE_AGE_MS = Number(process.env.AI_GATEWAY_SIGNATURE_MAX_AGE_MS || 5 * 60 * 1000);
const seenGatewayRequestIds = new Map();
const RETINA_SERVICE = (process.env.RETINA_SERVICE || "all").toLowerCase();
const MODEL_PATH =
  process.env.RETINA_DR_MODEL_PATH ||
  path.join(__dirname, "..", "models", "smoke_test.onnx");
const DR_MODEL_KIND = (process.env.RETINA_DR_MODEL_KIND || "legacy").toLowerCase();
const GLAUCOMA_MODEL_PATH =
  process.env.RETINA_GLAUCOMA_MODEL_PATH ||
  path.join(__dirname, "..", "models", "glaucoma_model.onnx");
const HR_MODEL_PATH =
  process.env.RETINA_HR_MODEL_PATH ||
  path.join(__dirname, "..", "models", "hr_efficientnet_model.onnx");
const GRADCAM_SERVICE_URL = process.env.RETINA_GRADCAM_SERVICE_URL || "http://localhost:5000/gradcam";
const ORT_SESSION_OPTIONS = {
  executionProviders: ["cpu"],
  intraOpNumThreads: Number(process.env.ORT_NUM_THREADS || 1),
  interOpNumThreads: 1,
};

const CLASS_LABELS = {
  0: "No DR",
  1: "Mild DR",
  2: "Moderate DR",
  3: "Severe DR",
  4: "Proliferative DR",
};

const REFERRAL_GUIDANCE = {
  0: "Re-screen in 12 months",
  1: "Re-screen in 6 months",
  2: "Refer to ophthalmologist within 6 months",
  3: "Urgent referral within 2-4 weeks",
  4: "Emergency referral - high risk of vision loss",
};

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
if (ENABLE_PUBLIC_DEMO) {
  app.use(express.static(path.join(__dirname, "public")));
}

let session;
let glaucomaSession;
let hrSession;
let gradcamProcess;

function serviceEnabled(serviceName) {
  return RETINA_SERVICE === "all" || RETINA_SERVICE === serviceName;
}

function verifyGatewaySignature(req, res) {
  if (!REQUIRE_AI_GATEWAY_SIGNATURE) return true;

  if (!AI_GATEWAY_SHARED_SECRET) {
    res.status(500).json({ error: "AI gateway shared secret is not configured" });
    return false;
  }

  const timestamp = req.get("X-AFIO-Timestamp");
  const signature = req.get("X-AFIO-Signature");
  const requestId = req.get("X-AFIO-Request-Id");
  if (!timestamp || !signature || !requestId) {
    res.status(401).json({ error: "Missing AFIO gateway signature" });
    return false;
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SIGNATURE_AGE_MS) {
    res.status(403).json({ error: "Invalid or expired AFIO gateway signature" });
    return false;
  }

  pruneSeenRequestIds();
  if (seenGatewayRequestIds.has(requestId)) {
    res.status(409).json({ error: "Duplicate AFIO gateway request" });
    return false;
  }

  const payload = req.file.buffer.toString("base64");
  const expectedSignature = crypto
    .createHmac("sha256", AI_GATEWAY_SHARED_SECRET)
    .update(`${timestamp}.${requestId}.${payload}`)
    .digest("hex");

  const expected = Buffer.from(expectedSignature, "hex");
  const provided = Buffer.from(signature, "hex");
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    res.status(403).json({ error: "Invalid AFIO gateway signature" });
    return false;
  }

  seenGatewayRequestIds.set(requestId, Date.now());
  return true;
}

function pruneSeenRequestIds() {
  const cutoff = Date.now() - MAX_SIGNATURE_AGE_MS;
  for (const [requestId, seenAt] of seenGatewayRequestIds.entries()) {
    if (seenAt < cutoff) seenGatewayRequestIds.delete(requestId);
  }
}

async function preprocessImageDR(buffer) {
  if (DR_MODEL_KIND === "convnext") {
    const { data } = await sharp(buffer)
      .resize(224, 224)
      .removeAlpha()
      .toColorspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });

    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const float32Data = new Float32Array(3 * 224 * 224);
    const pixelCount = 224 * 224;

    for (let i = 0; i < pixelCount; i++) {
      float32Data[i] = data[i * 3] / 255;
      float32Data[pixelCount + i] = data[i * 3 + 1] / 255;
      float32Data[2 * pixelCount + i] = data[i * 3 + 2] / 255;
    }

    for (let c = 0; c < 3; c++) {
      const channelOffset = c * pixelCount;
      for (let i = 0; i < pixelCount; i++) {
        float32Data[channelOffset + i] =
          (float32Data[channelOffset + i] - mean[c]) / std[c];
      }
    }

    return new ort.Tensor("float32", float32Data, [1, 3, 224, 224]);
  }

  const { data } = await sharp(buffer)
    .resize(300, 300)
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32Data = new Float32Array(3 * 300 * 300);
  const pixelCount = 300 * 300;

  for (let i = 0; i < pixelCount; i++) {
    float32Data[i] = data[i * 3] / 255;
    float32Data[pixelCount + i] = data[i * 3 + 1] / 255;
    float32Data[2 * pixelCount + i] = data[i * 3 + 2] / 255;
  }

  return new ort.Tensor("float32", float32Data, [1, 3, 300, 300]);
}

async function preprocessImageHREfficientNet(buffer) {
  const { data } = await sharp(buffer)
    .resize(300, 300)
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32Data = new Float32Array(3 * 300 * 300);
  const pixelCount = 300 * 300;

  for (let i = 0; i < pixelCount; i++) {
    float32Data[i] = data[i * 3] / 255;
    float32Data[pixelCount + i] = data[i * 3 + 1] / 255;
    float32Data[2 * pixelCount + i] = data[i * 3 + 2] / 255;
  }

  return new ort.Tensor("float32", float32Data, [1, 3, 300, 300]);
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function sigmoid(logit) {
  return 1 / (1 + Math.exp(-logit));
}

async function preprocessImageGlaucoma(buffer) {
  const { data } = await sharp(buffer)
    .resize(512, 512)
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32Data = new Float32Array(3 * 512 * 512);
  const pixelCount = 512 * 512;

  for (let i = 0; i < pixelCount; i++) {
    float32Data[i] = data[i * 3] / 255;
    float32Data[pixelCount + i] = data[i * 3 + 1] / 255;
    float32Data[2 * pixelCount + i] = data[i * 3 + 2] / 255;
  }

  return new ort.Tensor("float32", float32Data, [1, 3, 512, 512]);
}

function regionBrightness(data, imageSize, startX, startY, regionSize) {
  let sum = 0;
  let count = 0;

  for (let y = startY; y < startY + regionSize; y++) {
    for (let x = startX; x < startX + regionSize; x++) {
      const idx = (y * imageSize + x) * 3;
      sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      count++;
    }
  }

  return sum / count;
}

function regionVariance(data, imageSize, startX, startY, regionSize) {
  const brightnessValues = [];

  for (let y = startY; y < startY + regionSize; y++) {
    for (let x = startX; x < startX + regionSize; x++) {
      const idx = (y * imageSize + x) * 3;
      brightnessValues.push((data[idx] + data[idx + 1] + data[idx + 2]) / 3);
    }
  }

  const mean =
    brightnessValues.reduce((a, b) => a + b, 0) / brightnessValues.length;
  const variance =
    brightnessValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
    brightnessValues.length;

  return variance;
}

function regionAverageColor(data, imageSize, startX, startY, regionSize) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let y = startY; y < startY + regionSize; y++) {
    for (let x = startX; x < startX + regionSize; x++) {
      const idx = (y * imageSize + x) * 3;
      sumR += data[idx];
      sumG += data[idx + 1];
      sumB += data[idx + 2];
      count++;
    }
  }

  return { r: sumR / count, g: sumG / count, b: sumB / count };
}

async function validateFundusImage(imageBuffer) {
  const IMAGE_SIZE = 224;

  const { data } = await sharp(imageBuffer)
    .resize(IMAGE_SIZE, IMAGE_SIZE)
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const CORNER_SIZE = 10;
  const corners = [
    regionBrightness(data, IMAGE_SIZE, 0, 0, CORNER_SIZE),
    regionBrightness(data, IMAGE_SIZE, IMAGE_SIZE - CORNER_SIZE, 0, CORNER_SIZE),
    regionBrightness(data, IMAGE_SIZE, 0, IMAGE_SIZE - CORNER_SIZE, CORNER_SIZE),
    regionBrightness(data, IMAGE_SIZE, IMAGE_SIZE - CORNER_SIZE, IMAGE_SIZE - CORNER_SIZE, CORNER_SIZE),
  ];
  const cornerBrightness = corners.reduce((a, b) => a + b, 0) / corners.length;

  if (cornerBrightness > 60) {
    return {
      valid: false,
      error:
        "This does not appear to be a fundus photograph. Fundus images have a dark circular border.",
    };
  }

  const CENTER_SIZE = 80;
  const centerStart = (IMAGE_SIZE - CENTER_SIZE) / 2;
  const centerBrightness = regionBrightness(data, IMAGE_SIZE, centerStart, centerStart, CENTER_SIZE);

  if (centerBrightness < 40) {
    return {
      valid: false,
      error: "Image is too dark. Please upload a clear fundus photograph.",
    };
  }

  if (centerBrightness - cornerBrightness < 30) {
    return {
      valid: false,
      error:
        "This does not appear to be a fundus photograph. Please upload a retinal fundus image.",
    };
  }

  const { r: rAvg, b: bAvg } = regionAverageColor(data, IMAGE_SIZE, centerStart, centerStart, CENTER_SIZE);

  if (rAvg < 80 || rAvg - bAvg < 15) {
    return {
      valid: false,
      error:
        "Image does not appear to be a retinal fundus photograph. Fundus images have a characteristic red/orange tone.",
    };
  }

  const sharpnessVariance = regionVariance(data, IMAGE_SIZE, centerStart, centerStart, CENTER_SIZE);

  if (sharpnessVariance < 50) {
    return {
      valid: false,
      error:
        "Image appears blurry. Please upload a sharper fundus photograph for accurate results.",
    };
  }

  return { valid: true };
}

async function fetchGradCam(imageBuffer, filename) {
  if (SKIP_GRADCAM || !gradcamProcess) return null;

  try {
    const form = new FormData();
    form.append("image", imageBuffer, filename || "image.png");

    const res = await fetch(GRADCAM_SERVICE_URL, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.heatmap || null;
  } catch (err) {
    console.error("Grad-CAM service unavailable:", err.message);
    return null;
  }
}

function getRiskLevel(cdr) {
  if (cdr < 0.3) {
    return { risk_level: "Normal", risk_detail: "CDR within normal range" };
  }
  if (cdr < 0.5) {
    return {
      risk_level: "Monitor",
      risk_detail: "CDR slightly elevated, monitor over time",
    };
  }
  if (cdr < 0.7) {
    return {
      risk_level: "Suspicious",
      risk_detail: "Suspicious - refer for IOP testing",
    };
  }
  return {
    risk_level: "High risk",
    risk_detail: "High risk - urgent referral",
  };
}

function checkSessionReady(res, modelName, modelSession) {
  if (!modelSession) {
    res.status(503).json({ error: `${modelName} model is not loaded on this service` });
    return false;
  }
  return true;
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: RETINA_SERVICE,
    models_loaded: {
      dr: Boolean(session),
      glaucoma: Boolean(glaucomaSession),
      hr: Boolean(hrSession),
    },
  });
});

app.post("/predict", upload.single("image"), async (req, res) => {
  if (!serviceEnabled("dr")) {
    return res.status(404).json({ error: "DR model is not enabled on this Retina service" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded" });
  }
  if (!verifyGatewaySignature(req, res)) return;
  if (!checkSessionReady(res, "DR", session)) return;

  const validation = await validateFundusImage(req.file.buffer);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const inputTensor = await preprocessImageDR(req.file.buffer);
    const feeds = { [session.inputNames[0]]: inputTensor };
    const results = await session.run(feeds);
    const outputTensor = results[session.outputNames[0]];

    const scores = softmax(Array.from(outputTensor.data));
    const predictedClass = scores.indexOf(Math.max(...scores));

    const topScore = scores[predictedClass];
    const secondScore = Math.max(...scores.filter((_, i) => i !== predictedClass));
    const isLowConfidence = topScore < 0.5 || topScore - secondScore < 0.15;

    const heatmap = await fetchGradCam(req.file.buffer, req.file.originalname);

    res.json({
      predicted_class: predictedClass,
      severity_label: CLASS_LABELS[predictedClass],
      confidence: Number(scores[predictedClass].toFixed(2)),
      scores: scores.map((s) => Number(s.toFixed(2))),
      referral: REFERRAL_GUIDANCE[predictedClass],
      heatmap,
      low_confidence: isLowConfidence,
      model_name:
        DR_MODEL_KIND === "convnext"
          ? "ConvNeXt-Base DR Screening Model (ONNX quantized)"
          : "DR severity ONNX model",
      confidence_warning: isLowConfidence
        ? "Low confidence prediction - consider re-imaging or specialist review"
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Inference failed" });
  }
});

app.post("/gradcam", upload.single("image"), async (req, res) => {
  if (!serviceEnabled("dr")) {
    return res.status(404).json({ error: "DR Grad-CAM is not enabled on this Retina service" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded" });
  }
  if (!verifyGatewaySignature(req, res)) return;
  if (SKIP_GRADCAM || !gradcamProcess) {
    return res.status(503).json({ error: "Retina DR Grad-CAM is disabled on this service" });
  }

  const validation = await validateFundusImage(req.file.buffer);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const heatmap = await fetchGradCam(req.file.buffer, req.file.originalname);
  if (!heatmap) {
    return res.status(502).json({ error: "Retina DR Grad-CAM generation failed" });
  }

  return res.json({ heatmap });
});

app.post("/predict-glaucoma", upload.single("image"), async (req, res) => {
  if (!serviceEnabled("glaucoma")) {
    return res.status(404).json({ error: "Glaucoma model is not enabled on this Retina service" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded" });
  }
  if (!verifyGatewaySignature(req, res)) return;
  if (!checkSessionReady(res, "Glaucoma", glaucomaSession)) return;

  const validation = await validateFundusImage(req.file.buffer);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const inputTensor = await preprocessImageGlaucoma(req.file.buffer);
    const feeds = { [glaucomaSession.inputNames[0]]: inputTensor };
    const results = await glaucomaSession.run(feeds);
    const outputTensor = results[glaucomaSession.outputNames[0]];

    const data = outputTensor.data;
    const pixelCount = 512 * 512;

    let discPixels = 0;
    let cupPixels = 0;

    for (let i = 0; i < pixelCount; i++) {
      if (data[i] >= 0.5) discPixels++;
      if (data[pixelCount + i] >= 0.5) cupPixels++;
    }

    const cdr = discPixels === 0 ? 0 : cupPixels / discPixels;
    const { risk_level, risk_detail } = getRiskLevel(cdr);

    res.json({
      cdr: Number(cdr.toFixed(2)),
      risk_level,
      risk_detail,
      disc_pixels: discPixels,
      cup_pixels: cupPixels,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Inference failed" });
  }
});

app.post("/predict-hr", upload.single("image"), async (req, res) => {
  if (!serviceEnabled("hr")) {
    return res.status(404).json({ error: "Hypertensive-retinopathy model is not enabled on this service" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded" });
  }
  if (!verifyGatewaySignature(req, res)) return;
  if (!checkSessionReady(res, "Hypertensive-retinopathy", hrSession)) return;

  const validation = await validateFundusImage(req.file.buffer);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const inputTensor = await preprocessImageHREfficientNet(req.file.buffer);
    const feeds = { [hrSession.inputNames[0]]: inputTensor };
    const results = await hrSession.run(feeds);
    const outputTensor = results[hrSession.outputNames[0]];

    const logit = outputTensor.data[0];
    const probability = sigmoid(logit);
    const hrDetected = probability > 0.2;

    res.json({
      hr_detected: hrDetected,
      probability: Number(probability.toFixed(2)),
      risk_level: hrDetected ? "HR Detected" : "No HR Detected",
      recommendation: hrDetected
        ? "Refer to ophthalmologist - signs of hypertensive retinopathy detected"
        : "No signs of hypertensive retinopathy. Monitor blood pressure regularly.",
      note: "This is a preliminary screening result. Confirmation requires blood pressure measurement and specialist review.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Inference failed" });
  }
});

function startGradCam() {
  if (SKIP_GRADCAM) {
    console.log("[GradCAM] Skipped by SKIP_GRADCAM=true");
    return null;
  }

  const gradcam = spawn(PYTHON_BIN, [path.join(__dirname, "gradcam_service.py")], {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  gradcam.stdout.on("data", (data) => {
    console.log("[GradCAM]", data.toString().trim());
  });

  gradcam.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.log("[GradCAM]", msg);
  });

  gradcam.on("exit", (code) => {
    console.log("[GradCAM] Process exited with code", code);
  });

  console.log("[GradCAM] Starting service...");
  return gradcam;
}

function checkModelInputSize(label, modelSession, expectedSize) {
  try {
    const inputName = modelSession.inputNames[0];
    const dims = modelSession.inputMetadata?.[0]?.shape || modelSession.inputMetadata?.[inputName]?.dimensions;
    if (!dims) return;

    const [, , h, w] = dims;
    if (h !== expectedSize || w !== expectedSize) {
      console.warn(
        `[WARNING] ${label} expects input ${h}x${w}, but this service preprocesses at ${expectedSize}x${expectedSize}.`,
      );
    } else {
      console.log(`${label}: input size OK (${h}x${w})`);
    }
  } catch (err) {
    console.warn(`Could not verify input size for ${label}:`, err.message);
  }
}

async function start() {
  if (serviceEnabled("dr")) {
    gradcamProcess = startGradCam();
  }

  if (gradcamProcess) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (serviceEnabled("dr")) {
    session = await ort.InferenceSession.create(MODEL_PATH, ORT_SESSION_OPTIONS);
    checkModelInputSize(`DR (${path.basename(MODEL_PATH)})`, session, DR_MODEL_KIND === "convnext" ? 224 : 300);
  }
  if (serviceEnabled("glaucoma")) {
    glaucomaSession = await ort.InferenceSession.create(GLAUCOMA_MODEL_PATH, ORT_SESSION_OPTIONS);
    checkModelInputSize(`Glaucoma (${path.basename(GLAUCOMA_MODEL_PATH)})`, glaucomaSession, 512);
  }
  if (serviceEnabled("hr")) {
    hrSession = await ort.InferenceSession.create(HR_MODEL_PATH, ORT_SESSION_OPTIONS);
    checkModelInputSize(`HR (${path.basename(HR_MODEL_PATH)})`, hrSession, 300);
  }

  app.listen(PORT, () => {
    console.log(`Retina ${RETINA_SERVICE} service listening on port ${PORT}`);
  });
}

process.on("exit", () => {
  if (gradcamProcess) gradcamProcess.kill();
});
process.on("SIGINT", () => {
  process.exit();
});

start().catch((err) => {
  console.error("Failed to start Retina service:", err);
  process.exit(1);
});
