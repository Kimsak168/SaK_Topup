import QRCode from 'qrcode';
import sharp from 'sharp';
import jsQR from 'jsqr';

async function testQrWithLogo() {
  const qrString = '00020101021230510016abaakhppxxx@abaa01151260918004759410208ABA Bank52048999530384054040.345802KH5911SOK KOEMSAK6010PHNOM PENH625568510010PAYWAY@ABA0115552236-3586396602090425289570301199670013179455605260801131794557852608672100170013F1BF016411FDA6804PLIK6304611D';

  const qrBuffer = await QRCode.toBuffer(qrString, {
    errorCorrectionLevel: 'H',
    margin: 3,
    width: 640,
    color: { dark: '#000000', light: '#ffffff' },
  });

  const logoSize = 96;
  const logoPadding = 8;
  const totalLogoSize = logoSize + (logoPadding * 2); // 112x112 (17.5% of 640)

  const badgeSvg = Buffer.from(`
    <svg width="${totalLogoSize}" height="${totalLogoSize}">
      <rect x="0" y="0" width="${totalLogoSize}" height="${totalLogoSize}" rx="20" ry="20" fill="#ffffff" />
    </svg>
  `);

  const resizedLogo = await sharp('public/images/aba-logo.webp')
    .resize(logoSize, logoSize, { fit: 'contain' })
    .toBuffer();

  const logoComposite = await sharp(badgeSvg)
    .composite([{ input: resizedLogo, top: logoPadding, left: logoPadding }])
    .png()
    .toBuffer();

  const finalQr = await sharp(qrBuffer)
    .composite([{
      input: logoComposite,
      top: Math.round((640 - totalLogoSize) / 2),
      left: Math.round((640 - totalLogoSize) / 2),
    }])
    .png()
    .toBuffer();

  const { data, info } = await sharp(finalQr).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);

  console.log('Decoded successfully?:', Boolean(result && result.data === qrString));
  if (result) {
    console.log('Decoded data matches 100%!');
  }
}

testQrWithLogo().catch(console.error);
