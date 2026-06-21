import QRCode from 'qrcode';

// Render `text` as a PNG QR code, returned as a Buffer (sent via InputFile).
export async function checkinQrPng(text) {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
