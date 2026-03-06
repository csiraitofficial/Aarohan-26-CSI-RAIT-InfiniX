import * as ort from 'onnxruntime-web';

// Configure onnxruntime-web to use WASM
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

export interface DetectedObject {
    label: string;
    confidence: number;
    box: [number, number, number, number]; // [x1, y1, x2, y2]
}

export const LABELS = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop",
    "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush"
];

// Traffic-related labels to filter
export const TRAFFIC_LABELS = ["person", "bicycle", "car", "motorcycle", "bus", "truck"];

export class YOLOv11 {
    session: ort.InferenceSession | null = null;
    modelPath: string;

    constructor(modelPath: string = "/models/yolo11m.onnx") {
        this.modelPath = modelPath;
    }

    async load() {
        if (!this.session) {
            try {
                this.session = await ort.InferenceSession.create(this.modelPath, {
                    executionProviders: ['wasm'],
                });
                console.log("YOLOv11 model loaded successfully");
            } catch (e) {
                console.error("Failed to load YOLOv11 model:", e);
                throw e;
            }
        }
    }

    async detect(image: HTMLImageElement | HTMLVideoElement, canvas: HTMLCanvasElement, threshold: number = 0.25): Promise<DetectedObject[]> {
        if (!this.session) await this.load();

        const [input, xRatio, yRatio] = this.preprocess(image, canvas);

        const feeds: Record<string, ort.Tensor> = {};
        feeds[this.session!.inputNames[0]] = input;

        const results = await this.session!.run(feeds);
        const output = results[this.session!.outputNames[0]];

        return this.postprocess(output, xRatio, yRatio, threshold);
    }

    preprocess(image: HTMLImageElement | HTMLVideoElement, canvas: HTMLCanvasElement): [ort.Tensor, number, number] {
        const width = 640;
        const height = 640;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(image, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        const float32Data = new Float32Array(3 * width * height);

        for (let i = 0; i < pixels.length / 4; i++) {
            float32Data[i] = pixels[i * 4] / 255.0; // R
            float32Data[i + width * height] = pixels[i * 4 + 1] / 255.0; // G
            float32Data[i + 2 * width * height] = pixels[i * 4 + 2] / 255.0; // B
        }

        const input = new ort.Tensor('float32', float32Data, [1, 3, height, width]);

        // Calculate ratios to map back to original image size
        const xRatio = (image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth) / width;
        const yRatio = (image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight) / height;

        return [input, xRatio, yRatio];
    }

    postprocess(output: ort.Tensor, xRatio: number, yRatio: number, threshold: number): DetectedObject[] {
        const data = output.data as Float32Array;
        const [_, channels, boxes] = output.dims; // [1, 84, 8400]

        const detected: DetectedObject[] = [];

        // Transpose logic: The output is [1, 84, 8400], we iterate over 8400 anchors
        for (let i = 0; i < boxes; i++) {
            let maxScore = 0;
            let maxClass = -1;

            // Find class with max score (classes start at index 4)
            for (let c = 0; c < channels - 4; c++) {
                const score = data[(c + 4) * boxes + i];
                if (score > maxScore) {
                    maxScore = score;
                    maxClass = c;
                }
            }

            if (maxScore > threshold) {
                const x = data[0 * boxes + i];
                const y = data[1 * boxes + i];
                const w = data[2 * boxes + i];
                const h = data[3 * boxes + i];

                const x1 = (x - w / 2) * xRatio;
                const y1 = (y - h / 2) * yRatio;
                const x2 = (x + w / 2) * xRatio;
                const y2 = (y + h / 2) * yRatio;

                detected.push({
                    label: LABELS[maxClass],
                    confidence: maxScore,
                    box: [x1, y1, x2, y2]
                });
            }
        }

        return this.nms(detected);
    }

    nms(boxes: DetectedObject[], iouThreshold: number = 0.45): DetectedObject[] {
        if (boxes.length === 0) return [];

        boxes.sort((a, b) => b.confidence - a.confidence);
        const selected: DetectedObject[] = [];
        const active = new Array(boxes.length).fill(true);

        for (let i = 0; i < boxes.length; i++) {
            if (active[i]) {
                selected.push(boxes[i]);
                for (let j = i + 1; j < boxes.length; j++) {
                    if (active[j]) {
                        const iou = this.calculateIoU(boxes[i].box, boxes[j].box);
                        if (iou > iouThreshold) {
                            active[j] = false;
                        }
                    }
                }
            }
        }

        return selected;
    }

    calculateIoU(box1: number[], box2: number[]): number {
        const [x1, y1, x2, y2] = box1;
        const [x3, y3, x4, y4] = box2;

        const xA = Math.max(x1, x3);
        const yA = Math.max(y1, y3);
        const xB = Math.min(x2, x4);
        const yB = Math.min(y2, y4);

        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const box1Area = (x2 - x1) * (y2 - y1);
        const box2Area = (x4 - x3) * (y4 - y3);

        return interArea / (box1Area + box2Area - interArea);
    }
}
