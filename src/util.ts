// Utility functions for miscellaneous tasks that might need to be performed in multiple places

import { PPMTexture } from "./renderer.js";

interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

export class util {

    public static parsePPM3(ppmText: string): PPMTexture | null {
        const lines = ppmText.split('\n').map(line => line.trim());
        if (lines[0] !== 'P3') {
            console.error('Invalid PPM format. Expected P3 header.');
            return null;
        }

        let i = 1;
        while (lines[i].startsWith('#')) {
            i++; // Skip comments
        }

        const [width, height] = lines[i].split(' ').map(Number);
        const maxval = parseInt(lines[i + 1]);
        const pixels: number[] = [];

        for (const line of lines.slice(i + 2)) {
            pixels.push(...line.split(' ').map(Number));
        }

        // I do not know why I could not add 255 in the pixels.push above
        // but for whatever reason the values literally never appeared in the array
        const new_pixels: number[] = [];
        for (let i = 0; i < pixels.length; i += 3) {
            new_pixels.push(pixels[i], pixels[i + 1], pixels[i + 2], 255);
        }

        return { width, height, maxval, data: Uint8Array.from(new_pixels) };
    }


    public static hex2rgb(hex: string): Color {
        if (hex.length !== 7) {
            throw new Error('Invalid hex color');
        }
        return {
            r: parseInt(hex.slice(1, 3), 16) / 255,
            g: parseInt(hex.slice(3, 5), 16) / 255,
            b: parseInt(hex.slice(5, 7), 16) / 255,
            a: 255
        };
    }
}
