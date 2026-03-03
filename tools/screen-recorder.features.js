
if (localStorage.getItem("theme") === "day") {
  document.body.classList.add("day-mode");
}

const qualityPresets = {
  "480": { width: 854, height: 480, videoBps: 2500000 },
  "720": { width: 1280, height: 720, videoBps: 5000000 },
  "1080": { width: 1920, height: 1080, videoBps: 8000000 },
  "2160": { width: 3840, height: 2160, videoBps: 20000000 }
};

const state = {
  recorder: null,
  chunks: [],
  outputBlob: null,
  outputUrl: "",
  outputExt: "webm",
  originalBlob: null,
  originalExt: "webm",
  recordingStream: null,
  composedVideoStream: null,
  screenStream: null,
  webcamStream: null,
  micStream: null,
  audioContext: null,
  isRecording: false,
  timerId: 0,
  startedAt: 0,
  stopping: false,
  toolBusy: false,
  composeCanvas: null,
  composeCtx: null,
  composeFrameId: 0,
  sourceScreenVideo: null,
  sourceWebcamVideo: null,
  watermarkLogoImage: null,
  watermarkLogoUrl: "",
  virtualBgImage: null,
  virtualBgUrl: "",
  trimDurationSec: 0,
  annotation: {
    tool: "brush",
    color: "#ff3b30",
    size: 7,
    strokes: [],
    activeStroke: null,
    pointerId: null
  }
};

const refs = {
  mode: document.getElementById("capture-mode"),
  quality: document.getElementById("quality"),
  audio: document.getElementById("audio-source"),
  format: document.getElementById("format"),
  webcamBgMode: document.getElementById("webcam-bg-mode"),
  webcamBgImage: document.getElementById("webcam-bg-image"),
  webcamBgFileWrap: document.getElementById("webcam-bg-file-wrap"),
  watermarkMode: document.getElementById("watermark-mode"),
  watermarkText: document.getElementById("watermark-text"),
  watermarkTextWrap: document.getElementById("watermark-text-wrap"),
  watermarkLogo: document.getElementById("watermark-logo"),
  watermarkLogoWrap: document.getElementById("watermark-logo-wrap"),
  start: document.getElementById("start-btn"),
  stop: document.getElementById("stop-btn"),
  download: document.getElementById("download-btn"),
  statusRow: document.getElementById("status-row"),
  timer: document.getElementById("timer"),
  status: document.getElementById("status-text"),
  previewShell: document.getElementById("preview-shell"),
  preview: document.getElementById("preview-video"),
  previewEmpty: document.getElementById("preview-empty"),
  previewLabel: document.getElementById("preview-label"),
  fileMeta: document.getElementById("file-meta"),
  countdown: document.getElementById("countdown"),
  annotationCanvas: document.getElementById("annotation-canvas"),
  annotationToolbar: document.getElementById("annotation-toolbar"),
  annotationToolButtons: Array.from(document.querySelectorAll(".annotation-toolbar [data-tool]")),
  annotationClear: document.getElementById("annotation-clear"),
  annotationColor: document.getElementById("annotation-color"),
  annotationSize: document.getElementById("annotation-size"),
  postTools: document.getElementById("post-tools"),
  trimDuration: document.getElementById("trim-duration"),
  trimStart: document.getElementById("trim-start"),
  trimEnd: document.getElementById("trim-end"),
  trimStartText: document.getElementById("trim-start-text"),
  trimEndText: document.getElementById("trim-end-text"),
  applyTrim: document.getElementById("apply-trim"),
  resetTrim: document.getElementById("reset-trim"),
  gifDuration: document.getElementById("gif-duration"),
  downloadGif: document.getElementById("download-gif"),
  telegramToken: document.getElementById("telegram-token"),
  telegramChatId: document.getElementById("telegram-chat-id"),
  sendTelegram: document.getElementById("send-telegram")
};

refs.telegramToken.value = localStorage.getItem("adhurjya_tg_token") || "";
refs.telegramChatId.value = localStorage.getItem("adhurjya_tg_chat") || "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function once(target, eventName) {
  return new Promise((resolve) => {
    target.addEventListener(eventName, () => resolve(), { once: true });
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const pow = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, pow);
  return (pow === 0 ? val.toFixed(0) : val.toFixed(2)) + " " + units[pow];
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mins = String(Math.floor(total / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return mins + ":" + secs;
}

function formatSec(sec) {
  return formatDuration(sec * 1000);
}

function setStatus(message) {
  refs.status.textContent = message;
}

function dimsFromQuality() {
  return qualityPresets[refs.quality.value] || qualityPresets["1080"];
}

function mimeToExt(mime) {
  if (!mime) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "webm";
}

function refreshControls() {
  const lock = state.isRecording || state.stopping || state.toolBusy;
  refs.start.disabled = state.isRecording || state.stopping || state.toolBusy;
  refs.stop.disabled = !state.isRecording || state.stopping || state.toolBusy;
  refs.download.disabled = !state.outputBlob || lock;
  refs.mode.disabled = lock;
  refs.quality.disabled = lock;
  refs.audio.disabled = lock;
  refs.format.disabled = lock;
  refs.webcamBgMode.disabled = lock;
  refs.webcamBgImage.disabled = lock;
  refs.watermarkMode.disabled = lock;
  refs.watermarkText.disabled = lock;
  refs.watermarkLogo.disabled = lock;
  refs.applyTrim.disabled = !state.outputBlob || lock;
  refs.resetTrim.disabled = !state.outputBlob || lock || !state.originalBlob;
  refs.downloadGif.disabled = !state.outputBlob || lock;
  refs.sendTelegram.disabled = !state.outputBlob || lock;
  refs.statusRow.classList.toggle("recording", state.isRecording);
}

function setPostToolsVisible(show) {
  refs.postTools.classList.toggle("hidden", !show);
}

function releaseStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch (error) {}
  }
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = 0;
  }
  if (!state.isRecording) refs.timer.textContent = "00:00";
}

function startTimer() {
  state.startedAt = Date.now();
  refs.timer.textContent = "00:00";
  state.timerId = setInterval(() => {
    refs.timer.textContent = formatDuration(Date.now() - state.startedAt);
  }, 250);
}

function revokeOutputUrl() {
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = "";
  }
}

function clearOutput(keepOriginal) {
  revokeOutputUrl();
  state.outputBlob = null;
  state.outputExt = "webm";
  refs.fileMeta.textContent = "No recording yet";
  refs.previewLabel.textContent = "Preview";
  if (!keepOriginal) {
    state.originalBlob = null;
    state.originalExt = "webm";
  }
  setPostToolsVisible(false);
}

function resetPreviewToEmpty() {
  refs.preview.pause();
  refs.preview.removeAttribute("src");
  refs.preview.srcObject = null;
  refs.preview.controls = true;
  refs.preview.muted = false;
  refs.previewEmpty.style.display = "grid";
}

function setAnnotationUi(visible) {
  refs.annotationToolbar.classList.toggle("show", visible);
  refs.annotationCanvas.classList.toggle("show", visible);
  refs.annotationCanvas.style.pointerEvents = visible ? "auto" : "none";
  if (!visible) {
    state.annotation.activeStroke = null;
    renderAnnotationOverlay();
  }
}

function syncAnnotationCanvasSize() {
  const rect = refs.previewShell.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (refs.annotationCanvas.width !== width || refs.annotationCanvas.height !== height) {
    refs.annotationCanvas.width = width;
    refs.annotationCanvas.height = height;
  }
  renderAnnotationOverlay();
}

function clearAnnotations() {
  state.annotation.strokes = [];
  state.annotation.activeStroke = null;
  renderAnnotationOverlay();
}

function normalizedPointFromEvent(event) {
  const rect = refs.annotationCanvas.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  const y = clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
  return { x, y };
}

function strokeWidth(baseSize, width, height, isHighlighter) {
  const scale = Math.max(0.9, Math.min(2.8, Math.min(width, height) / 720));
  const factor = isHighlighter ? 2.4 : 1;
  return Math.max(1.1, baseSize * scale * factor);
}

function drawArrow(ctx, sx, sy, ex, ey, color, lineWidth) {
  const angle = Math.atan2(ey - sy, ex - sx);
  const head = Math.max(10, lineWidth * 2.8);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(angle - Math.PI / 7), ey - head * Math.sin(angle - Math.PI / 7));
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(angle + Math.PI / 7), ey - head * Math.sin(angle + Math.PI / 7));
  ctx.stroke();
  ctx.restore();
}

function drawStrokeOnContext(ctx, stroke, width, height) {
  if (!stroke) return;
  const isHighlighter = stroke.type === "highlighter";

  if (stroke.type === "arrow") {
    const lineW = strokeWidth(stroke.size, width, height, false);
    drawArrow(
      ctx,
      stroke.start.x * width,
      stroke.start.y * height,
      stroke.end.x * width,
      stroke.end.y * height,
      stroke.color,
      lineW
    );
    return;
  }

  const pts = stroke.points || [];
  if (!pts.length) return;

  ctx.save();
  ctx.globalAlpha = isHighlighter ? 0.33 : 1;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = strokeWidth(stroke.size, width, height, isHighlighter);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x * width, pts[0].y * height);
  for (let i = 1; i < pts.length; i += 1) {
    ctx.lineTo(pts[i].x * width, pts[i].y * height);
  }
  if (pts.length === 1) {
    const p = pts[0];
    ctx.lineTo(p.x * width + 0.1, p.y * height + 0.1);
  }
  ctx.stroke();
  ctx.restore();
}

function drawAllStrokes(ctx, width, height, includeActive) {
  for (const stroke of state.annotation.strokes) {
    drawStrokeOnContext(ctx, stroke, width, height);
  }
  if (includeActive && state.annotation.activeStroke) {
    drawStrokeOnContext(ctx, state.annotation.activeStroke, width, height);
  }
}

function renderAnnotationOverlay() {
  const ctx = refs.annotationCanvas.getContext("2d");
  const width = refs.annotationCanvas.width;
  const height = refs.annotationCanvas.height;
  ctx.clearRect(0, 0, width, height);
  drawAllStrokes(ctx, width, height, true);
}

function setActiveAnnotationTool(tool) {
  state.annotation.tool = tool;
  refs.annotationToolButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
}
function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawWebcamLayer(ctx, video, x, y, width, height, isPip) {
  const mode = refs.webcamBgMode.value;
  if (!video) {
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, width, height);
    return;
  }

  if (mode === "none") {
    ctx.drawImage(video, x, y, width, height);
    return;
  }

  if (mode === "blur") {
    ctx.save();
    ctx.filter = "blur(" + Math.max(8, Math.round(Math.min(width, height) / 25)) + "px)";
    ctx.drawImage(video, x, y, width, height);
    ctx.restore();

    const pad = isPip ? Math.round(Math.min(width, height) * 0.04) : Math.round(Math.min(width, height) * 0.09);
    const innerX = x + pad;
    const innerY = y + pad;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    ctx.save();
    drawRoundedRectPath(ctx, innerX, innerY, innerW, innerH, Math.max(10, Math.round(Math.min(innerW, innerH) * 0.06)));
    ctx.clip();
    ctx.drawImage(video, innerX, innerY, innerW, innerH);
    ctx.restore();
    return;
  }

  if (mode === "image") {
    if (state.virtualBgImage && state.virtualBgImage.complete) {
      ctx.drawImage(state.virtualBgImage, x, y, width, height);
    } else {
      const grad = ctx.createLinearGradient(x, y, x + width, y + height);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#1f2937");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, width, height);
    }

    const pad = isPip ? Math.round(Math.min(width, height) * 0.05) : Math.round(Math.min(width, height) * 0.1);
    const innerX = x + pad;
    const innerY = y + pad;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    ctx.save();
    drawRoundedRectPath(ctx, innerX, innerY, innerW, innerH, Math.max(10, Math.round(Math.min(innerW, innerH) * 0.05)));
    ctx.clip();
    ctx.drawImage(video, innerX, innerY, innerW, innerH);
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = Math.max(1.4, Math.min(width, height) * 0.01);
    drawRoundedRectPath(ctx, innerX, innerY, innerW, innerH, Math.max(10, Math.round(Math.min(innerW, innerH) * 0.05)));
    ctx.stroke();
  }
}

function drawWatermark(ctx, width, height) {
  const mode = refs.watermarkMode.value;
  if (mode === "none") return;

  const pad = Math.max(12, Math.round(width * 0.015));

  if (mode === "logo" && state.watermarkLogoImage && state.watermarkLogoImage.complete) {
    const ratio = state.watermarkLogoImage.naturalWidth / Math.max(1, state.watermarkLogoImage.naturalHeight);
    const drawW = Math.min(Math.round(width * 0.18), 250);
    const drawH = Math.round(drawW / Math.max(ratio, 0.2));
    const x = width - drawW - pad;
    const y = height - drawH - pad;

    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.drawImage(state.watermarkLogoImage, x, y, drawW, drawH);
    ctx.restore();
    return;
  }

  const text = (refs.watermarkText.value || "Adhurjya Store").trim() || "Adhurjya Store";
  const fontSize = clamp(Math.round(width * 0.022), 16, 34);
  ctx.save();
  ctx.font = "700 " + fontSize + "px Inter, system-ui, sans-serif";
  const textW = ctx.measureText(text).width;
  const boxW = Math.round(textW + fontSize * 0.95);
  const boxH = Math.round(fontSize * 1.55);
  const x = width - boxW - pad;
  const y = height - boxH - pad;

  ctx.fillStyle = "rgba(2, 6, 23, 0.54)";
  drawRoundedRectPath(ctx, x, y, boxW, boxH, Math.round(fontSize * 0.36));
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + Math.round(fontSize * 0.44), y + boxH / 2);
  ctx.restore();
}

function wireExternalStop(track) {
  if (!track) return;
  track.addEventListener("ended", () => {
    if (state.isRecording && !state.stopping) {
      setStatus("Capture source ended. Finalizing recording...");
      stopRecording();
    }
  });
}

async function playMuted(video, stream) {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return video;
}

async function buildMixedAudioTrack(includeSystem, includeMic) {
  const tracks = [];
  if (includeSystem && state.screenStream) {
    const track = state.screenStream.getAudioTracks()[0];
    if (track) tracks.push(track);
  }
  if (includeMic && state.micStream) {
    const track = state.micStream.getAudioTracks()[0];
    if (track) tracks.push(track);
  }

  if (!tracks.length) return null;

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return tracks[0];

  state.audioContext = new AC();
  const dest = state.audioContext.createMediaStreamDestination();
  tracks.forEach((track) => {
    const src = state.audioContext.createMediaStreamSource(new MediaStream([track]));
    src.connect(dest);
  });

  return dest.stream.getAudioTracks()[0] || null;
}

async function createComposedVideoStream(mode, dims) {
  const width = dims.width;
  const height = dims.height;

  state.composeCanvas = document.createElement("canvas");
  state.composeCanvas.width = width;
  state.composeCanvas.height = height;
  state.composeCtx = state.composeCanvas.getContext("2d", { alpha: false });

  if (state.screenStream && state.screenStream.getVideoTracks().length) {
    const screenVideo = document.createElement("video");
    await playMuted(screenVideo, new MediaStream([state.screenStream.getVideoTracks()[0]]));
    state.sourceScreenVideo = screenVideo;
  }

  if (state.webcamStream && state.webcamStream.getVideoTracks().length) {
    const webcamVideo = document.createElement("video");
    await playMuted(webcamVideo, new MediaStream([state.webcamStream.getVideoTracks()[0]]));
    state.sourceWebcamVideo = webcamVideo;
  }

  const ctx = state.composeCtx;

  const renderFrame = () => {
    ctx.clearRect(0, 0, width, height);

    if (mode === "webcam_only") {
      drawWebcamLayer(ctx, state.sourceWebcamVideo, 0, 0, width, height, false);
    } else {
      if (state.sourceScreenVideo) {
        ctx.drawImage(state.sourceScreenVideo, 0, 0, width, height);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      }

      if (mode === "screen_webcam_pip" && state.sourceWebcamVideo) {
        const pipW = Math.round(width * 0.26);
        const pipH = Math.round(pipW * 9 / 16);
        const pad = Math.max(12, Math.round(width * 0.012));
        const x = width - pipW - pad;
        const y = height - pipH - pad;

        ctx.fillStyle = "rgba(0,0,0,0.42)";
        drawRoundedRectPath(ctx, x - 5, y - 5, pipW + 10, pipH + 10, 12);
        ctx.fill();

        drawWebcamLayer(ctx, state.sourceWebcamVideo, x, y, pipW, pipH, true);
      }
    }

    drawAllStrokes(ctx, width, height, true);
    drawWatermark(ctx, width, height);

    state.composeFrameId = requestAnimationFrame(renderFrame);
  };

  renderFrame();
  state.composedVideoStream = state.composeCanvas.captureStream(30);
  return state.composedVideoStream;
}

function recorderConfig() {
  const preferred = refs.format.value;
  const webm = [
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" }
  ];
  const mp4 = [
    { mime: "video/mp4;codecs=h264,aac", ext: "mp4" },
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" }
  ];

  let pool = webm;
  if (preferred === "mp4") pool = mp4.concat(webm);
  if (preferred === "auto") pool = webm.concat(mp4);

  for (const item of pool) {
    if (!item.mime || MediaRecorder.isTypeSupported(item.mime)) {
      return item;
    }
  }

  return { mime: "", ext: preferred === "mp4" ? "mp4" : "webm" };
}

async function buildCaptureStreams() {
  const mode = refs.mode.value;
  const audioMode = refs.audio.value;
  const dims = dimsFromQuality();

  const needScreen = mode === "screen_audio" || mode === "screen_only" || mode === "screen_webcam_pip";
  const needWebcam = mode === "webcam_only" || mode === "screen_webcam_pip";
  const needSystem = audioMode === "system" || audioMode === "both";
  const needMic = audioMode === "mic" || audioMode === "both";

  if (needScreen) {
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: dims.width },
        height: { ideal: dims.height },
        frameRate: { ideal: 30, max: 60 },
        cursor: "always"
      },
      audio: needSystem
    });
    wireExternalStop(state.screenStream.getVideoTracks()[0]);
  }

  if (needWebcam) {
    state.webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: dims.width },
        height: { ideal: dims.height },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    });
  }

  if (needMic) {
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 2,
        sampleRate: 48000
      },
      video: false
    });
  }

  const videoStream = await createComposedVideoStream(mode, dims);
  const includeSystem = needSystem && mode !== "webcam_only";
  const includeMic = needMic;
  const audioTrack = await buildMixedAudioTrack(includeSystem, includeMic);

  const finalStream = new MediaStream();
  const videoTrack = videoStream.getVideoTracks()[0];
  if (videoTrack) finalStream.addTrack(videoTrack);
  if (audioTrack) {
    finalStream.addTrack(audioTrack);
  } else if (needSystem && needScreen && state.screenStream && !state.screenStream.getAudioTracks().length) {
    setStatus("System audio not available in selected share source. Recording video without system sound.");
  }

  state.recordingStream = finalStream;
  return finalStream;
}

async function cleanupLiveResources() {
  if (state.composeFrameId) {
    cancelAnimationFrame(state.composeFrameId);
    state.composeFrameId = 0;
  }

  if (state.sourceScreenVideo) {
    state.sourceScreenVideo.pause();
    state.sourceScreenVideo.srcObject = null;
    state.sourceScreenVideo = null;
  }

  if (state.sourceWebcamVideo) {
    state.sourceWebcamVideo.pause();
    state.sourceWebcamVideo.srcObject = null;
    state.sourceWebcamVideo = null;
  }

  releaseStream(state.composedVideoStream);
  releaseStream(state.recordingStream);
  releaseStream(state.screenStream);
  releaseStream(state.webcamStream);
  releaseStream(state.micStream);

  state.composedVideoStream = null;
  state.recordingStream = null;
  state.screenStream = null;
  state.webcamStream = null;
  state.micStream = null;
  state.composeCanvas = null;
  state.composeCtx = null;

  if (state.audioContext) {
    try { await state.audioContext.close(); } catch (error) {}
    state.audioContext = null;
  }

  setAnnotationUi(false);
}
function outputName(ext) {
  const now = new Date();
  const stamp =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "-" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  return "adhurjya-recording-" + stamp + "." + ext;
}

function setOutputBlob(blob, ext, asOriginal) {
  revokeOutputUrl();
  state.outputBlob = blob;
  state.outputExt = ext;
  state.outputUrl = URL.createObjectURL(blob);

  if (asOriginal) {
    state.originalBlob = blob;
    state.originalExt = ext;
  }

  refs.preview.srcObject = null;
  refs.preview.src = state.outputUrl;
  refs.preview.controls = true;
  refs.preview.muted = false;
  refs.previewLabel.textContent = "Recorded Output";
  refs.previewEmpty.style.display = "none";
  refs.fileMeta.textContent = formatBytes(blob.size) + " • " + ext.toUpperCase();
}

async function showCountdown() {
  refs.countdown.classList.add("show");
  for (const value of ["3", "2", "1"]) {
    refs.countdown.textContent = value;
    await sleep(760);
  }
  refs.countdown.classList.remove("show");
  await sleep(120);
}

async function getVideoDurationFromUrl(url) {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = url;
  await once(video, "loadedmetadata");
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.removeAttribute("src");
  return duration;
}

function syncTrimBounds() {
  let start = Number(refs.trimStart.value);
  let end = Number(refs.trimEnd.value);
  if (end <= start + 0.2) {
    if (document.activeElement === refs.trimStart) {
      end = Math.min(state.trimDurationSec, start + 0.2);
      refs.trimEnd.value = String(end);
    } else {
      start = Math.max(0, end - 0.2);
      refs.trimStart.value = String(start);
    }
  }
  refs.trimStartText.textContent = formatSec(start);
  refs.trimEndText.textContent = formatSec(end);
}

async function setupTrimUi() {
  if (!state.outputBlob) {
    setPostToolsVisible(false);
    return;
  }

  state.trimDurationSec = await getVideoDurationFromUrl(state.outputUrl);
  const max = Math.max(0.2, state.trimDurationSec);
  refs.trimStart.max = String(max);
  refs.trimEnd.max = String(max);
  refs.trimStart.step = "0.1";
  refs.trimEnd.step = "0.1";
  refs.trimStart.value = "0";
  refs.trimEnd.value = String(max);
  refs.trimDuration.textContent = "Duration: " + formatSec(max);
  syncTrimBounds();
  setPostToolsVisible(true);
}

async function seekVideo(video, timeSec) {
  return new Promise((resolve) => {
    video.addEventListener("seeked", () => resolve(), { once: true });
    video.currentTime = Math.max(0, timeSec);
  });
}

async function trimBlobByPlayback(sourceUrl, startSec, endSec) {
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.preload = "auto";
  video.playsInline = true;
  await once(video, "loadedmetadata");

  if (!video.captureStream) {
    throw new Error("captureStream not supported for trimming in this browser.");
  }

  const stream = video.captureStream();
  const conf = recorderConfig();
  const options = {};
  if (conf.mime && MediaRecorder.isTypeSupported(conf.mime)) {
    options.mimeType = conf.mime;
  }

  const chunks = [];
  const recorder = new MediaRecorder(stream, options);
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  let stopped = false;
  const stopNow = () => {
    if (stopped) return;
    stopped = true;
    try { video.pause(); } catch (error) {}
    try { recorder.stop(); } catch (error) {}
  };

  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      releaseStream(stream);
      const mime = recorder.mimeType || conf.mime || state.outputBlob.type || "video/webm";
      resolve(new Blob(chunks, { type: mime }));
    };
  });

  await seekVideo(video, startSec);
  recorder.start(180);
  await video.play();

  const watcher = setInterval(() => {
    if (video.currentTime >= endSec || video.ended) {
      clearInterval(watcher);
      stopNow();
    }
  }, 60);

  const blob = await done;
  clearInterval(watcher);
  return blob;
}

async function convertTailToGif(sourceUrl, seconds) {
  if (!window.GIF) {
    throw new Error("GIF converter library failed to load.");
  }

  const video = document.createElement("video");
  video.src = sourceUrl;
  video.preload = "auto";
  await once(video, "loadedmetadata");

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const tail = Math.min(duration, seconds);
  const start = Math.max(0, duration - tail);
  const fps = 12;
  const step = 1 / fps;

  const outW = Math.min(720, video.videoWidth || 720);
  const outH = Math.max(2, Math.round(outW * (video.videoHeight || 405) / Math.max(2, video.videoWidth || 720)));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { alpha: false });

  const gif = new GIF({
    workers: 2,
    quality: 6,
    width: outW,
    height: outH,
    workerScript: "https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js"
  });

  for (let t = start; t < duration; t += step) {
    await seekVideo(video, Math.min(t, Math.max(start, duration - 0.05)));
    ctx.drawImage(video, 0, 0, outW, outH);
    gif.addFrame(ctx, { copy: true, delay: Math.round(1000 / fps) });
    const progress = ((t - start) / Math.max(step, tail)) * 100;
    setStatus("Building GIF... " + Math.min(100, Math.max(0, Math.round(progress))) + "%");
  }

  return new Promise((resolve) => {
    gif.on("finished", (blob) => resolve(blob));
    gif.render();
  });
}

async function startRecording() {
  if (state.isRecording || state.stopping || state.toolBusy) return;
  clearOutput(false);

  try {
    state.toolBusy = true;
    refreshControls();
    setStatus("Requesting capture permissions...");

    syncAnnotationCanvasSize();
    clearAnnotations();

    const stream = await buildCaptureStreams();

    refs.preview.srcObject = stream;
    refs.preview.controls = false;
    refs.preview.muted = true;
    refs.previewEmpty.style.display = "none";
    refs.previewLabel.textContent = "Live Feed";

    setAnnotationUi(true);
    setStatus("Get ready. Recording starts after countdown...");
    await showCountdown();

    const preset = dimsFromQuality();
    const conf = recorderConfig();
    state.outputExt = conf.ext;
    state.chunks = [];

    const options = {
      videoBitsPerSecond: preset.videoBps,
      audioBitsPerSecond: 192000
    };
    if (conf.mime) options.mimeType = conf.mime;

    state.recorder = new MediaRecorder(stream, options);
    state.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) state.chunks.push(event.data);
    };

    state.recorder.onerror = () => {
      setStatus("Recorder error occurred. Please try again.");
    };

    state.recorder.onstop = async () => {
      try {
        const mime = conf.mime || "video/" + state.outputExt;
        const blob = new Blob(state.chunks, { type: mime });
        const ext = mimeToExt(blob.type || mime || "video/webm");
        setOutputBlob(blob, ext, true);

        const fallbackNotice = refs.format.value === "mp4" && ext !== "mp4"
          ? " MP4 not supported in this browser; saved as WEBM."
          : "";

        await setupTrimUi();
        setStatus("Recording complete." + fallbackNotice);
      } finally {
        await cleanupLiveResources();
        state.isRecording = false;
        state.stopping = false;
        state.toolBusy = false;
        stopTimer();
        refreshControls();
      }
    };

    state.recorder.start(1000);
    state.isRecording = true;
    state.stopping = false;
    state.toolBusy = false;
    startTimer();
    setStatus("Recording in progress...");
    refreshControls();
  } catch (error) {
    await cleanupLiveResources();
    state.isRecording = false;
    state.stopping = false;
    state.toolBusy = false;
    stopTimer();
    resetPreviewToEmpty();
    setStatus("Could not start recording. Please allow permissions and try again.");
    refreshControls();
  }
}

async function stopRecording() {
  if (!state.isRecording || state.stopping || state.toolBusy) return;
  state.stopping = true;
  refreshControls();
  setStatus("Stopping and finalizing recording...");

  try {
    if (state.recorder && state.recorder.state !== "inactive") {
      state.recorder.stop();
    }
  } catch (error) {
    setStatus("Stop failed. Please try again.");
    state.stopping = false;
    refreshControls();
  }
}

function downloadRecording() {
  if (!state.outputBlob) return;
  const a = document.createElement("a");
  a.href = state.outputUrl;
  a.download = outputName(state.outputExt);
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function updateAudioByMode() {
  const mode = refs.mode.value;
  const opts = Array.from(refs.audio.options);
  const allow = { both: true, system: true, mic: true, none: true };

  if (mode === "screen_only") {
    allow.both = false;
    allow.system = false;
    allow.mic = false;
    allow.none = true;
  } else if (mode === "webcam_only") {
    allow.both = false;
    allow.system = false;
  }

  opts.forEach((option) => {
    option.disabled = !allow[option.value];
  });

  if (refs.audio.selectedOptions[0].disabled) {
    const next = opts.find((o) => !o.disabled);
    if (next) refs.audio.value = next.value;
  }

  setStatus(mode === "screen_only"
    ? "Screen Only mode records video without audio."
    : "Ready to record. Pick mode, quality, and audio source.");
}

function updateWatermarkUi() {
  const mode = refs.watermarkMode.value;
  refs.watermarkTextWrap.style.display = mode === "text" ? "block" : "none";
  refs.watermarkLogoWrap.style.display = mode === "logo" ? "block" : "none";
}

function updateVirtualBgUi() {
  refs.webcamBgFileWrap.style.display = refs.webcamBgMode.value === "image" ? "block" : "none";
}

async function readImageFromInput(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => reject(new Error("Could not load image."));
    img.src = url;
  });
}

function toggleMicrophone() {
  const micTrack = state.micStream ? state.micStream.getAudioTracks()[0] : null;
  if (micTrack) {
    micTrack.enabled = !micTrack.enabled;
    setStatus(micTrack.enabled ? "Microphone unmuted via shortcut." : "Microphone muted via shortcut.");
    return;
  }

  const mode = refs.mode.value;
  if (mode === "screen_only") {
    setStatus("Microphone is unavailable in Screen Only mode.");
    return;
  }

  if (mode === "webcam_only") {
    refs.audio.value = refs.audio.value === "mic" ? "none" : "mic";
  } else {
    if (refs.audio.value === "both") refs.audio.value = "system";
    else if (refs.audio.value === "system") refs.audio.value = "both";
    else if (refs.audio.value === "mic") refs.audio.value = "none";
    else refs.audio.value = "mic";
  }

  setStatus("Microphone preference toggled. Current audio source: " + refs.audio.selectedOptions[0].textContent + ".");
}

async function applyTrim() {
  if (!state.outputBlob || state.toolBusy || state.isRecording) return;
  const start = Number(refs.trimStart.value);
  const end = Number(refs.trimEnd.value);
  if (end <= start + 0.2) {
    setStatus("Trim range is too short. Increase end time.");
    return;
  }

  state.toolBusy = true;
  refreshControls();
  setStatus("Trimming video...");

  try {
    const blob = await trimBlobByPlayback(state.outputUrl, start, end);
    const ext = mimeToExt(blob.type || "video/webm");
    setOutputBlob(blob, ext, false);
    await setupTrimUi();
    setStatus("Trim applied successfully.");
  } catch (error) {
    setStatus("Trimming failed: " + error.message);
  } finally {
    state.toolBusy = false;
    refreshControls();
  }
}

async function resetTrim() {
  if (!state.originalBlob || state.toolBusy || state.isRecording) return;
  state.toolBusy = true;
  refreshControls();
  try {
    setOutputBlob(state.originalBlob, state.originalExt, false);
    await setupTrimUi();
    setStatus("Restored original recording.");
  } catch (error) {
    setStatus("Could not restore original recording.");
  } finally {
    state.toolBusy = false;
    refreshControls();
  }
}

async function downloadGifTail() {
  if (!state.outputBlob || state.toolBusy || state.isRecording) return;
  state.toolBusy = true;
  refreshControls();

  try {
    const seconds = Number(refs.gifDuration.value) || 8;
    setStatus("Preparing GIF converter...");
    const gifBlob = await convertTailToGif(state.outputUrl, seconds);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(gifBlob);
    a.download = outputName("gif");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    setStatus("GIF downloaded successfully.");
  } catch (error) {
    setStatus("GIF conversion failed: " + error.message);
  } finally {
    state.toolBusy = false;
    refreshControls();
  }
}

async function sendToTelegram() {
  if (!state.outputBlob || state.toolBusy || state.isRecording) return;
  const token = (refs.telegramToken.value || "").trim();
  const chatId = (refs.telegramChatId.value || "").trim();

  if (!token || !chatId) {
    setStatus("Enter Telegram Bot Token and Chat ID before sending.");
    return;
  }

  localStorage.setItem("adhurjya_tg_token", token);
  localStorage.setItem("adhurjya_tg_chat", chatId);

  state.toolBusy = true;
  refreshControls();
  setStatus("Sending video to Telegram...");

  try {
    const endpoint = "https://api.telegram.org/bot" + token + "/sendVideo";
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", "Recorded via Adhurjya Store Recorder");
    form.append("supports_streaming", "true");
    form.append("video", state.outputBlob, outputName(state.outputExt));

    const response = await fetch(endpoint, { method: "POST", body: form });

    let payload = null;
    try { payload = await response.json(); } catch (error) {}

    if (!response.ok || !payload || payload.ok !== true) {
      const msg = payload && payload.description ? payload.description : ("HTTP " + response.status);
      throw new Error(msg);
    }

    setStatus("Video sent to Telegram successfully.");
  } catch (error) {
    setStatus("Telegram send failed: " + error.message);
  } finally {
    state.toolBusy = false;
    refreshControls();
  }
}

function handleAnnotationPointerDown(event) {
  if (!state.isRecording || state.stopping) return;
  if (event.button !== 0) return;

  event.preventDefault();
  const point = normalizedPointFromEvent(event);
  state.annotation.pointerId = event.pointerId;
  refs.annotationCanvas.setPointerCapture(event.pointerId);

  const tool = state.annotation.tool;
  const color = state.annotation.color;
  const size = Number(state.annotation.size);

  if (tool === "arrow") {
    state.annotation.activeStroke = {
      type: "arrow",
      color,
      size,
      start: point,
      end: point
    };
  } else {
    state.annotation.activeStroke = {
      type: tool,
      color,
      size,
      points: [point]
    };
  }

  renderAnnotationOverlay();
}

function handleAnnotationPointerMove(event) {
  if (!state.annotation.activeStroke || event.pointerId !== state.annotation.pointerId) return;
  const point = normalizedPointFromEvent(event);
  const stroke = state.annotation.activeStroke;

  if (stroke.type === "arrow") {
    stroke.end = point;
  } else {
    stroke.points.push(point);
  }

  renderAnnotationOverlay();
}

function finishAnnotationStroke(event) {
  if (!state.annotation.activeStroke || event.pointerId !== state.annotation.pointerId) return;
  try { refs.annotationCanvas.releasePointerCapture(event.pointerId); } catch (error) {}

  state.annotation.strokes.push(state.annotation.activeStroke);
  state.annotation.activeStroke = null;
  state.annotation.pointerId = null;
  renderAnnotationOverlay();
}

function bindEvents() {
  refs.mode.addEventListener("change", updateAudioByMode);

  refs.webcamBgMode.addEventListener("change", updateVirtualBgUi);
  refs.webcamBgImage.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (state.virtualBgUrl) {
        URL.revokeObjectURL(state.virtualBgUrl);
        state.virtualBgUrl = "";
      }
      const loaded = await readImageFromInput(file);
      state.virtualBgImage = loaded.img;
      state.virtualBgUrl = loaded.url;
      setStatus("Custom virtual background loaded.");
    } catch (error) {
      setStatus("Could not load virtual background image.");
    }
  });

  refs.watermarkMode.addEventListener("change", updateWatermarkUi);
  refs.watermarkLogo.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (state.watermarkLogoUrl) {
        URL.revokeObjectURL(state.watermarkLogoUrl);
        state.watermarkLogoUrl = "";
      }
      const loaded = await readImageFromInput(file);
      state.watermarkLogoImage = loaded.img;
      state.watermarkLogoUrl = loaded.url;
      setStatus("Watermark logo loaded.");
    } catch (error) {
      setStatus("Could not load watermark logo.");
    }
  });

  refs.start.addEventListener("click", startRecording);
  refs.stop.addEventListener("click", stopRecording);
  refs.download.addEventListener("click", downloadRecording);

  refs.trimStart.addEventListener("input", syncTrimBounds);
  refs.trimEnd.addEventListener("input", syncTrimBounds);
  refs.applyTrim.addEventListener("click", applyTrim);
  refs.resetTrim.addEventListener("click", resetTrim);

  refs.downloadGif.addEventListener("click", downloadGifTail);
  refs.sendTelegram.addEventListener("click", sendToTelegram);

  refs.annotationToolButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveAnnotationTool(button.dataset.tool));
  });
  refs.annotationColor.addEventListener("input", () => {
    state.annotation.color = refs.annotationColor.value;
  });
  refs.annotationSize.addEventListener("change", () => {
    state.annotation.size = Number(refs.annotationSize.value);
  });
  refs.annotationClear.addEventListener("click", clearAnnotations);

  refs.annotationCanvas.addEventListener("pointerdown", handleAnnotationPointerDown);
  refs.annotationCanvas.addEventListener("pointermove", handleAnnotationPointerMove);
  refs.annotationCanvas.addEventListener("pointerup", finishAnnotationStroke);
  refs.annotationCanvas.addEventListener("pointercancel", finishAnnotationStroke);

  window.addEventListener("keydown", (event) => {
    if (!event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "r") {
      event.preventDefault();
      if (state.isRecording) stopRecording();
      else startRecording();
    } else if (key === "m") {
      event.preventDefault();
      toggleMicrophone();
    }
  });

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => syncAnnotationCanvasSize());
    ro.observe(refs.previewShell);
  } else {
    window.addEventListener("resize", syncAnnotationCanvasSize);
  }

  window.addEventListener("beforeunload", async () => {
    try {
      if (state.recorder && state.recorder.state !== "inactive") {
        state.recorder.stop();
      }
    } catch (error) {}

    await cleanupLiveResources();

    if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
    if (state.watermarkLogoUrl) URL.revokeObjectURL(state.watermarkLogoUrl);
    if (state.virtualBgUrl) URL.revokeObjectURL(state.virtualBgUrl);
  });
}

updateAudioByMode();
updateVirtualBgUi();
updateWatermarkUi();
setActiveAnnotationTool("brush");
refreshControls();
resetPreviewToEmpty();
syncAnnotationCanvasSize();
bindEvents();
