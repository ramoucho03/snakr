import "server-only";
import { open } from "node:fs/promises";

/**
 * ffprobe / ffmpeg plumbing + the MP4 box walk that tells us whether a file can
 * start playing on the first byte.
 *
 * Everything here is BEST-EFFORT. A missing ffmpeg, an exotic container, a
 * truncated file — none of it may ever fail an upload or a request. Callers get
 * `null` and degrade: no duration badge, no faststart remux, no poster.
 */

export interface MediaProbe {
  /** Fractional seconds, or null when the container carries no duration. */
  durationSec: number | null;
  width: number | null;
  height: number | null;
  /** Codec names, used to decide whether an MP4 remux can be a stream copy. */
  videoCodec: string | null;
  audioCodec: string | null;
}

/**
 * `ffmpeg-static` ships a glibc binary that cannot exec on the Alpine (musl)
 * runtime, so production points FFMPEG_PATH at Alpine's own ffmpeg. ffprobe
 * lives next to it in the same package; derive its path rather than making the
 * operator set a second variable.
 */
export function ffmpegPath(): string | null {
  return process.env.FFMPEG_PATH || null;
}

export function ffprobePath(): string | null {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  const ff = process.env.FFMPEG_PATH;
  // /usr/bin/ffmpeg → /usr/bin/ffprobe. Only rewrite the trailing binary name.
  if (ff) return ff.replace(/ffmpeg(\.exe)?$/i, (_m, exe: string | undefined) => `ffprobe${exe ?? ""}`);
  return null;
}

/** Load fluent-ffmpeg with both binaries configured. Lazy: image-only hosts never pay. */
async function loadFfmpeg() {
  const ffmpeg = (await import("fluent-ffmpeg")).default;
  const ffPath = ffmpegPath();
  if (ffPath) ffmpeg.setFfmpegPath(ffPath);
  else {
    // Dev fallback: the bundled static binary works fine on glibc/Windows/macOS.
    const staticPath = (await import("ffmpeg-static")).default as unknown as string | null;
    if (staticPath) ffmpeg.setFfmpegPath(staticPath);
  }
  const fpPath = ffprobePath();
  if (fpPath) ffmpeg.setFfprobePath(fpPath);
  // With neither set, fluent-ffmpeg falls back to `ffprobe` on PATH.
  return ffmpeg;
}

export async function ffmpegCommand(input: string) {
  const ffmpeg = await loadFfmpeg();
  return ffmpeg(input);
}

const PROBE_TIMEOUT_MS = 15_000;

/** "00:04:13.52" → 253.52. Returns null for ffmpeg's "N/A". */
export function parseHms(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
  if (!m) return null;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * ffmpeg reports a codec the way a human reads it — `h264 (High) (avc1 /
 * 0x31637661)`, `aac (LC) (mp4a / 0x6134706D)`. ffprobe reports `h264`. Everything
 * downstream compares against ffprobe's vocabulary, so normalise to that.
 */
function codecName(raw: string | undefined): string | null {
  if (!raw) return null;
  const name = raw.trim().split(/[\s(]/)[0].toLowerCase();
  return name && name !== "none" ? name : null;
}

/**
 * Pull `320x180` out of ffmpeg's stream description, which decorates it:
 * `["h264 (High) …", "yuv420p(tv, progressive)", "320x180 [SAR 1:1 DAR 16:9]", …]`.
 */
function frameSize(details: string[] | undefined): [number, number] | null {
  for (const part of details ?? []) {
    const m = /^(\d{2,5})x(\d{2,5})\b/.exec(part.trim());
    if (m) return [Number(m[1]), Number(m[2])];
  }
  return null;
}

/**
 * Fallback when ffprobe is unavailable: `ffmpeg-static` (the dev dependency)
 * ships ffmpeg ONLY. Ask ffmpeg to demux one frame into the null muxer and read
 * the `codecData` it prints about its input, then kill it. Slower than ffprobe
 * because it starts a decode, but it still stops after the first frame.
 */
async function probeViaFfmpeg(absPath: string): Promise<MediaProbe | null> {
  let ffmpeg;
  try {
    ffmpeg = await loadFfmpeg();
  } catch {
    return null;
  }

  return new Promise<MediaProbe | null>((resolve) => {
    let settled = false;
    const finish = (value: MediaProbe | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    try {
      const cmd = ffmpeg(absPath)
        .outputOptions(["-frames:v", "1", "-f", "null"])
        .output("-")
        .on("codecData", (data: { duration?: string; video?: string; audio?: string; video_details?: string[] }) => {
          clearTimeout(timer);
          const size = frameSize(data.video_details);
          finish({
            durationSec: parseHms(data.duration),
            width: size?.[0] ?? null,
            height: size?.[1] ?? null,
            videoCodec: codecName(data.video),
            audioCodec: codecName(data.audio),
          });
          try {
            cmd.kill("SIGKILL");
          } catch {
            /* already gone */
          }
        })
        .on("error", () => {
          clearTimeout(timer);
          finish(null);
        })
        .on("end", () => {
          clearTimeout(timer);
          finish(null);
        });
      cmd.run();
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/**
 * Read duration + dimensions + codecs from a media file's headers. ffprobe does
 * not decode, so this is cheap (single-digit milliseconds on a local file) and
 * safe to call on a request path. Falls back to an ffmpeg header read when no
 * ffprobe binary is reachable.
 */
export async function probeMedia(absPath: string): Promise<MediaProbe | null> {
  let ffmpeg;
  try {
    ffmpeg = await loadFfmpeg();
  } catch {
    return null;
  }

  const data = await new Promise<import("fluent-ffmpeg").FfprobeData | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
    try {
      ffmpeg.ffprobe(absPath, (err, result) => {
        clearTimeout(timer);
        resolve(err ? null : result);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
  if (!data) return probeViaFfmpeg(absPath);

  const video = data.streams?.find((s) => s.codec_type === "video");
  const audio = data.streams?.find((s) => s.codec_type === "audio");

  // ffprobe types these loosely and the values arrive as strings often enough
  // that a plain `typeof x === "number"` check silently drops real data.
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // Container duration is authoritative; fall back to the video stream's.
  const durationSec = num(data.format?.duration) ?? num(video?.duration);

  // A rotated phone video reports its pre-rotation frame size; swap so the
  // stored dimensions match what a player actually displays.
  const meta = video as unknown as
    | { rotation?: number | string; tags?: { rotate?: number | string } }
    | undefined;
  const rotation = Math.abs(Number.parseInt(String(meta?.rotation ?? meta?.tags?.rotate ?? 0), 10) || 0) % 180;
  let width = num(video?.width);
  let height = num(video?.height);
  if (rotation === 90 && width && height) [width, height] = [height, width];

  return {
    durationSec,
    width,
    height,
    videoCodec: codecName(video?.codec_name),
    audioCodec: codecName(audio?.codec_name),
  };
}

/* ===========================================================================
   MP4 / QuickTime "faststart" detection.

   An ISO-BMFF file is a flat list of boxes: [uint32 size][4-char type][payload].
   The `moov` box holds the index a player needs before it can render a single
   frame; `mdat` holds the samples. Muxers that write `mdat` first (ffmpeg's
   default, OBS, most phone cameras, screen recorders) force the browser to
   fetch the head, discover no index, issue a second Range request for the tail,
   parse the index, then finally seek back — two extra round-trips and a moov
   that can be megabytes on a long recording.

   Walking the top-level boxes answers "is moov before mdat?" by reading a few
   dozen bytes, so we only pay for a remux on files that actually need one.
   =========================================================================== */

const MAX_BOXES = 64;

/**
 * `true` when the sample data precedes the index (needs a faststart remux),
 * `false` when the file already starts fast, `null` when it isn't ISO-BMFF or
 * can't be read.
 */
export async function moovAtEnd(absPath: string): Promise<boolean | null> {
  let fh;
  try {
    fh = await open(absPath, "r");
  } catch {
    return null;
  }
  try {
    const header = Buffer.alloc(16);
    let offset = 0;

    for (let i = 0; i < MAX_BOXES; i++) {
      const { bytesRead } = await fh.read(header, 0, 16, offset);
      if (bytesRead < 8) return null;

      const type = header.toString("latin1", 4, 8);
      if (i === 0 && type !== "ftyp") return null; // not ISO-BMFF (mkv, webm, …)

      if (type === "moov") return false;
      if (type === "mdat") return true;

      let size = header.readUInt32BE(0);
      if (size === 1) {
        // 64-bit extended size lives in the 8 bytes after the type.
        if (bytesRead < 16) return null;
        const large = header.readBigUInt64BE(8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        size = Number(large);
      } else if (size === 0) {
        return null; // box runs to EOF and it is neither moov nor mdat
      }
      if (size < 8) return null; // malformed

      offset += size;
    }
    return null;
  } catch {
    return null;
  } finally {
    await fh.close().catch(() => {});
  }
}
