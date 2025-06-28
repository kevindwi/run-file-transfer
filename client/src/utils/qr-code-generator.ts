import QRCode from "qrcode";

export const generateQRCode = async (data: string, elementId: string) => {
  try {
    const canvasElement = document.getElementById(
      elementId,
    ) as HTMLCanvasElement;
    if (canvasElement) {
      await QRCode.toCanvas(canvasElement, data);
    }
    const room = document.getElementById("roomId") as HTMLHeadElement;
    room.innerHTML = data;
  } catch (err) {
    console.error("Error generating QR code:", err);
  }
};
