import { useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export type QrScannerHandle = {
  startScan: () => void;
  stopScan: () => void;
};

type Props = {
  onScanSuccess: (decodedText: string) => void;
};

const QrScanner = forwardRef<QrScannerHandle, Props>(
  ({ onScanSuccess }, ref) => {
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);

    const qrCodeRegionId = "qr-reader";

    async function requestCameraAccess(): Promise<boolean> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        // Jika berhasil, stop stream agar kamera tidak langsung dipakai
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch (err) {
        console.error("User denied camera access or no camera available:", err);
        return false;
      }
    }

    const startScan = async () => {
      if (html5QrCodeRef.current || isScanning) return;

      const granted = await requestCameraAccess();
      if (!granted) {
        alert("Akses kamera diperlukan untuk melakukan scan QR.");
        return;
      }

      setIsScanning(true);

      setTimeout(async () => {
        const qrCode = new Html5Qrcode(qrCodeRegionId);
        html5QrCodeRef.current = qrCode;

        try {
          await qrCode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
            },
            (decodedText) => {
              onScanSuccess(decodedText);
              stopScan();
            },
            () => {},
          );
        } catch (err) {
          console.error("Start Scan Error:", err);
          stopScan();
        }
      }, 100); // beri waktu 100ms agar DOM siap
    };

    const stopScan = async () => {
      const qrCode = html5QrCodeRef.current;
      if (qrCode) {
        await qrCode.stop();
        await qrCode.clear();
        html5QrCodeRef.current = null;
      }
      setIsScanning(false);
    };

    useImperativeHandle(ref, () => ({
      startScan,
      stopScan,
    }));

    return (
      <div>
        <div
          className={`fixed inset-0 z-50 bg-black/90 bg-opacity-90 flex items-center justify-center transition-opacity duration-300 ${
            isScanning ? "opacity-100 visible" : "opacity-0 invisible"
          }`}
        >
          <div className="absolute top-4 right-4">
            <button
              onClick={stopScan}
              className="text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm"
            >
              ✕ Close
            </button>
          </div>

          <div className="w-full max-w-sm">
            <div
              id={qrCodeRegionId}
              className="aspect-square w-full max-w-xs mx-auto rounded-md"
            />
          </div>
        </div>
      </div>
    );
  },
);

export default QrScanner;
