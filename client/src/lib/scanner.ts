/**
 * Estoqui Barcode Scanner Wrapper
 * - Native ML Kit scanner when running inside the iOS/Android app (Capacitor)
 * - html5-qrcode fallback when running in a browser (web/PWA)
 */

import { Capacitor } from '@capacitor/core';

export type ScanResult = {
  barcode: string;
  format: string;
};

/**
 * Scan a barcode. Automatically picks native or web scanner.
 * Returns the barcode string, or null if cancelled.
 */
export async function scanBarcode(): Promise<ScanResult | null> {
  if (Capacitor.isNativePlatform()) {
    return scanNative();
  } else {
    return scanWeb();
  }
}

/** Native scanner — uses ML Kit via @capacitor-mlkit/barcode-scanning */
async function scanNative(): Promise<ScanResult | null> {
  try {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');

    // Check + request camera permission
    const { camera } = await BarcodeScanner.checkPermissions();
    if (camera !== 'granted') {
      const result = await BarcodeScanner.requestPermissions();
      if (result.camera !== 'granted') {
        throw new Error('Camera permission denied');
      }
    }

    const { barcodes } = await BarcodeScanner.scan();
    if (barcodes.length === 0) return null;

    return {
      barcode: barcodes[0].rawValue ?? '',
      format: barcodes[0].format,
    };
  } catch (err) {
    console.error('[Scanner] Native scan failed:', err);
    return null;
  }
}

/** Web fallback — uses html5-qrcode in a modal */
async function scanWeb(): Promise<ScanResult | null> {
  return new Promise((resolve) => {
    // Dynamically import to avoid bundling in native build
    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      // Create scanner container
      const container = document.createElement('div');
      container.id = 'estoqui-scanner-container';
      container.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.85);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999; flex-direction: column; gap: 16px;
      `;

      const scannerDiv = document.createElement('div');
      scannerDiv.id = 'estoqui-qr-reader';
      scannerDiv.style.cssText = 'background: white; border-radius: 12px; overflow: hidden; width: 320px;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        background: white; border: none; padding: 10px 28px;
        border-radius: 8px; font-size: 15px; cursor: pointer; color: #374151;
      `;

      container.appendChild(scannerDiv);
      container.appendChild(cancelBtn);
      document.body.appendChild(container);

      const scanner = new Html5QrcodeScanner('estoqui-qr-reader', {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true,
        supportedScanTypes: [],
      }, false);

      const cleanup = () => {
        scanner.clear().catch(() => {});
        document.body.removeChild(container);
      };

      scanner.render(
        (decodedText, result) => {
          cleanup();
          resolve({ barcode: decodedText, format: result.result?.format?.formatName || 'QR_CODE' });
        },
        () => {} // ignore errors during scanning
      );

      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
    }).catch(() => {
      resolve(null);
    });
  });
}
