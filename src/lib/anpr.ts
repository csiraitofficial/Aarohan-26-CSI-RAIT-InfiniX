import Tesseract from 'tesseract.js';

/**
 * Extract number plate from vehicle detection
 * Uses OCR to read Indian vehicle registration numbers
 */
export async function recognizePlate(imageData: string | HTMLCanvasElement): Promise<string | null> {
    try {
        const { data: { text } } = await Tesseract.recognize(imageData, 'eng', {
            logger: m => console.log('OCR Progress:', m)
        });

        // Clean the text
        const cleaned = text.replace(/[^A-Z0-9]/g, '').toUpperCase();

        // Indian number plate formats:
        // Standard: MH12AB1234, DL01CA9999
        // New BH series: 22BH1234AB
        const patterns = [
            /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/, // Standard format
            /^\d{2}BH\d{4}[A-Z]{2}$/           // Bharat series
        ];

        for (const pattern of patterns) {
            if (pattern.test(cleaned)) {
                return formatPlateNumber(cleaned);
            }
        }

        // Try to extract if partially detected
        const match = cleaned.match(/[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}/);
        if (match) {
            return formatPlateNumber(match[0]);
        }

        return null;
    } catch (error) {
        console.error('Error recognizing plate:', error);
        return null;
    }
}

/**
 * Format plate number for display
 */
function formatPlateNumber(plate: string): string {
    // Standard: MH12AB1234 -> MH 12 AB 1234
    if (/^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/.test(plate)) {
        return plate.replace(/^([A-Z]{2})(\d{2})([A-Z]{1,2})(\d{4})$/, '$1 $2 $3 $4');
    }
    // Bharat: 22BH1234AB -> 22 BH 1234 AB
    if (/^\d{2}BH\d{4}[A-Z]{2}$/.test(plate)) {
        return plate.replace(/^(\d{2})(BH)(\d{4})([A-Z]{2})$/, '$1 $2 $3 $4');
    }
    return plate;
}

/**
 * Extract plate region from full frame based on vehicle detection
 */
export function extractPlateRegion(
    canvas: HTMLCanvasElement,
    vehicleBBox: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
    const ctx = canvas.getContext('2d')!;

    // Number plate is typically at the bottom 20% of vehicle
    const plateHeight = vehicleBBox.height * 0.2;
    const plateY = vehicleBBox.y + vehicleBBox.height - plateHeight;

    // Create new canvas for plate region
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = vehicleBBox.width;
    plateCanvas.height = plateHeight;

    const plateCtx = plateCanvas.getContext('2d')!;
    plateCtx.drawImage(
        canvas,
        vehicleBBox.x, plateY, vehicleBBox.width, plateHeight,
        0, 0, vehicleBBox.width, plateHeight
    );

    return plateCanvas;
}

/**
 * Generate mock plate number for testing
 */
export function generateMockPlate(): string {
    const states = ['MH', 'DL', 'KA', 'TN', 'OD', 'UP', 'GJ'];
    const state = states[Math.floor(Math.random() * states.length)];
    const district = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const series = String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
        String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const number = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');

    return `${state} ${district} ${series} ${number}`;
}
