import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function createAndAnalyze() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([500, 500]);
  
  page.drawText('Red Text Here', { x: 50, y: 400, size: 24, color: rgb(1, 0, 0) });
  page.drawText('Green Text Here', { x: 50, y: 350, size: 24, color: rgb(0, 1, 0) });
  page.drawText('Blue Text Here', { x: 50, y: 300, size: 24, color: rgb(0, 0, 1) });
  
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('test.pdf', pdfBytes);
  
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
  const doc = await loadingTask.promise;
  const pdfPage = await doc.getPage(1);
  
  const textContent = await pdfPage.getTextContent();
  console.log('--- getTextContent.items ---');
  textContent.items.forEach(item => {
    console.log(item.str, item.color, item.hasTextContent);
  });
  
  const opList = await pdfPage.getOperatorList();
  console.log('\n--- Operator List ---');
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    const fnName = Object.keys(pdfjsLib.OPS).find(key => pdfjsLib.OPS[key] === fn);
    if (fnName && (fnName.includes('Color') || fnName.toLowerCase().includes('text'))) {
      console.log(`Op: ${fnName}, Args:`, args);
    }
  }
}

createAndAnalyze().catch(console.error);
