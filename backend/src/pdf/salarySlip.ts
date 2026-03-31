import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { lookupTaxTable } from '../taxTable31';

export interface SalarySlipData {
  // Employee info
  employeeName: string;
  employeeNumber: string;
  employeeAddress?: string;
  // Period
  year: number;
  month: number;
  paymentDate: string;
  // Salary details
  hours: number;
  hourlyRate: number;
  monthlySalary: number;
  employmentType: string;
  // Benefits/deductions
  healthInsuranceBenefit: number;
  carDeduction: number;
  // Calculations
  grossSalary: number;
  holidayCompensation: number;
  totalBrutto: number;
  taxAmount: number;
  taxRate: number;       // engångsskatt
  tabellskattRate: number;
  taxTable: number;
  employerAvgift: number;
  netSalary: number;
  // YTD
  ytdGross: number;
  ytdTax: number;
  ytdHealthInsurance: number;
}

export interface SalaryCalculation {
  grossSalary: number;
  holidayCompensation: number;
  totalBrutto: number;
  taxAmount: number;
  employerAvgift: number;
  netSalary: number;
}

export function getBirthYearFromPersonnummer(pnr: string): number | null {
  if (!pnr) return null;
  const hasPlusSeparator = pnr.includes('+');
  const clean = pnr.replace(/[\s\-+]/g, '');
  if (clean.length === 12) {
    return parseInt(clean.substring(0, 4), 10);
  }
  if (clean.length === 10) {
    const yy = parseInt(clean.substring(0, 2), 10);
    if (hasPlusSeparator) return 1900 + yy;
    const currentYY = new Date().getFullYear() % 100;
    return yy <= currentYY ? 2000 + yy : 1900 + yy;
  }
  return null;
}

function getEmployerAvgiftRate(birthYear: number | null, payrollYear: number): number {
  if (birthYear === null) return 0.3142;
  const age = payrollYear - birthYear;
  if (age >= 66) return 0.1021;
  if (age <= 25) return 0.1973;
  return 0.3142;
}

export function calculateSalary(
  hours: number,
  hourlyRate: number,
  taxRate: number,           // engångsskatt — used for hourly income and one-time benefits
  healthInsuranceBenefit: number,
  carDeduction: number,
  birthYear: number | null = null,
  payrollYear: number = new Date().getFullYear(),
  employmentType: string = 'hourly',
  monthlySalary: number = 0,
  tabellskattRate: number = taxRate,  // fallback flat rate if table lookup unavailable
  taxTable: number = 31
): SalaryCalculation {
  const grossSalary = employmentType === 'monthly' ? monthlySalary : hours * hourlyRate;
  // Monthly employees have paid vacation included — no semesterersättning
  const holidayCompensation = employmentType === 'monthly' ? 0 : grossSalary * 0.12;
  const totalBrutto = grossSalary + holidayCompensation;
  // Monthly: table lookup (or fallback flat rate) on salary, engångsskatt on benefits
  // Hourly: engångsskatt on everything
  let taxAmount: number;
  if (employmentType === 'monthly') {
    const tableTax = lookupTaxTable(taxTable, grossSalary) ?? Math.round(grossSalary * tabellskattRate);
    const benefitTax = Math.round(healthInsuranceBenefit * taxRate);
    taxAmount = tableTax + benefitTax;
  } else {
    taxAmount = Math.round((totalBrutto + healthInsuranceBenefit) * taxRate);
  }
  const avgiftRate = getEmployerAvgiftRate(birthYear, payrollYear);
  const employerAvgift = totalBrutto * avgiftRate;
  const netSalary = totalBrutto - taxAmount - carDeduction;

  return {
    grossSalary: Math.round(grossSalary * 100) / 100,
    holidayCompensation: Math.round(holidayCompensation * 100) / 100,
    totalBrutto: Math.round(totalBrutto * 100) / 100,
    taxAmount,
    employerAvgift: Math.round(employerAvgift * 100) / 100,
    netSalary: Math.round(netSalary * 100) / 100,
  };
}

function formatAmount(amount: number): string {
  if (amount === 0) return '-';
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(year: number, month: number): string {
  const m = String(month).padStart(2, '0');
  return `${year}-${m}`;
}

function getLastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getFirstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function generateSalarySlipPDF(data: SalarySlipData, res: Response): void {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="lonebesked-${data.employeeNumber}-${data.year}-${String(data.month).padStart(2, '0')}.pdf"`
  );

  doc.pipe(res);

  const pageWidth = 515; // 595 - 2*40
  const left = 40;

  // ─── HEADER ───────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(22).text('Kaellhammarone AB', left, 40);
  doc.font('Helvetica').fontSize(14);
  const loneTitle = 'Lönebesked';
  const loneTitleWidth = doc.widthOfString(loneTitle);
  doc.text(loneTitle, left + pageWidth - loneTitleWidth, 48);

  // Horizontal rule
  doc.moveTo(left, 75).lineTo(left + pageWidth, 75).strokeColor('#cccccc').stroke();

  // ─── EMPLOYEE INFO BLOCK ──────────────────────────────────────────────────
  const infoY = 85;
  const labelFont = 'Helvetica-Bold';
  const valueFont = 'Helvetica';
  const labelSize = 9;
  const valueSize = 9;
  const lineHeight = 16;

  const periodStart = getFirstDayOfMonth(data.year, data.month);
  const periodEnd = getLastDayOfMonth(data.year, data.month);
  const avvikelser = getLastDayOfMonth(
    data.month === 1 ? data.year - 1 : data.year,
    data.month === 1 ? 12 : data.month - 1
  );

  // Left column
  const leftInfoX = left;
  const leftValueX = left + 110;
  const rightNameX = left + 300;

  const infoRows = [
    ['Anställningsnummer:', data.employeeNumber || ''],
    ['Löneperiod:', `${periodStart} - ${periodEnd}`],
    ['Avvikelser t o m:', avvikelser],
    ['Kontantutbetalning', ''],
  ];

  infoRows.forEach(([label, value], i) => {
    const y = infoY + i * lineHeight;
    doc.font(labelFont).fontSize(labelSize).text(label, leftInfoX, y);
    if (value) doc.font(valueFont).fontSize(valueSize).text(value, leftValueX, y);
  });

  // Right column — employee name and address
  doc.font(labelFont).fontSize(10).text(data.employeeName, rightNameX, infoY);
  if (data.employeeAddress) {
    const addressLines = data.employeeAddress.split('\n');
    addressLines.forEach((line, i) => {
      doc.font(valueFont).fontSize(9).text(line, rightNameX, infoY + (i + 1) * lineHeight);
    });
  }

  // ─── LINE ITEMS TABLE ─────────────────────────────────────────────────────
  const tableY = infoY + 5 * lineHeight + 10;

  // Column definitions
  const cols = [
    { label: 'Löneart', x: left, w: 50, align: 'left' as const },
    { label: 'Benämning', x: left + 50, w: 155, align: 'left' as const },
    { label: 'Datum', x: left + 205, w: 75, align: 'left' as const },
    { label: 'Kvantitet', x: left + 280, w: 55, align: 'right' as const },
    { label: 'Enhet', x: left + 335, w: 45, align: 'left' as const },
    { label: 'A-pris', x: left + 380, w: 60, align: 'right' as const },
    { label: 'Belopp', x: left + 440, w: 75, align: 'right' as const },
  ];

  // Table header background
  doc.rect(left, tableY, pageWidth, 18).fill('#e8e8e8');

  cols.forEach(col => {
    doc.font(labelFont).fontSize(8).fillColor('#000000');
    doc.text(col.label, col.x + 3, tableY + 5, { width: col.w - 6, align: col.align });
  });

  // Build line items
  interface LineItem {
    loeneart: string;
    description: string;
    datum: string;
    datumWidth?: number;  // override width if datum should span empty columns
    kvantitet: string;
    enhet: string;
    apris: string;
    belopp: string;
    isDeduction?: boolean;
  }

  const lineItems: LineItem[] = [];

  if (data.employmentType === 'monthly') {
    // 1101 Månadslön
    // datumWidth spans Datum + Kvantitet + Enhet + A-pris (75+55+45+60)
    lineItems.push({
      loeneart: '1101',
      description: 'Månadslön',
      datum: `${getFirstDayOfMonth(data.year, data.month)} - ${getLastDayOfMonth(data.year, data.month)}`,
      datumWidth: 75 + 55 + 45 + 60,
      kvantitet: '',
      enhet: '',
      apris: '',
      belopp: data.grossSalary.toFixed(2),
    });
  } else {
    // 1106 Timlön
    lineItems.push({
      loeneart: '1106',
      description: 'Timlön',
      datum: '',
      kvantitet: data.hours.toFixed(2),
      enhet: 'Timmar',
      apris: data.hourlyRate.toFixed(2),
      belopp: data.grossSalary.toFixed(2),
    });

    // 9104 Semesterersättning
    lineItems.push({
      loeneart: '9104',
      description: 'Semesterersättning, tabellskatt',
      datum: `${String(data.year).slice(2)}${String(data.month).padStart(2, '0')}${String(new Date(data.year, data.month, 0).getDate()).padStart(2, '0')} - ${String(data.year).slice(2)}${String(data.month).padStart(2, '0')}${String(new Date(data.year, data.month, 0).getDate()).padStart(2, '0')}`,
      kvantitet: '',
      enhet: '',
      apris: '',
      belopp: data.holidayCompensation.toFixed(2),
    });
  }

  // 21201 Health insurance (if any)
  if (data.healthInsuranceBenefit > 0) {
    lineItems.push({
      loeneart: '21201',
      description: 'Förmån sjukvårdsförsäkring',
      datum: '',
      kvantitet: '1,00',
      enhet: '',
      apris: '',
      belopp: `(${data.healthInsuranceBenefit.toFixed(2)})`,
      isDeduction: true,
    });
  }

  // 13051 Car deduction (if any)
  if (data.carDeduction > 0) {
    lineItems.push({
      loeneart: '13051',
      description: 'Nettolöneavdrag bil',
      datum: '',
      kvantitet: '',
      enhet: 'Kronor',
      apris: '',
      belopp: `-${data.carDeduction.toFixed(2)}`,
      isDeduction: true,
    });
  }

  // Render line items
  let rowY = tableY + 20;
  const rowH = 18;

  lineItems.forEach((item, i) => {
    if (i % 2 === 1) {
      doc.rect(left, rowY, pageWidth, rowH).fill('#f8f8f8');
    }

    doc.font(valueFont).fontSize(9).fillColor('#000000');

    const renderCell = (col: typeof cols[0], value: string) => {
      doc.text(value, col.x + 3, rowY + 5, { width: col.w - 6, align: col.align });
    };

    renderCell(cols[0], item.loeneart);
    renderCell(cols[1], item.description);
    // Use overridden width if provided (e.g. monthly rows span empty columns)
    if (item.datumWidth) {
      doc.text(item.datum, cols[2].x + 3, rowY + 5, { width: item.datumWidth - 6, align: 'left' });
    } else {
      renderCell(cols[2], item.datum);
    }
    renderCell(cols[3], item.kvantitet);
    renderCell(cols[4], item.enhet);
    renderCell(cols[5], item.apris);
    renderCell(cols[6], item.belopp);

    rowY += rowH;
  });

  // ─── SUMMARY SECTION ─────────────────────────────────────────────────────
  // Draw horizontal rule above summary
  const summaryY = Math.max(rowY + 20, tableY + 6 * rowH + 20);

  doc.moveTo(left, summaryY - 5).lineTo(left + pageWidth, summaryY - 5).strokeColor('#cccccc').stroke();

  const colW = 128;
  const gap = 1;
  const boxH = 130;
  const colPositions = [left, left + colW + gap, left + 2 * (colW + gap), left + 3 * (colW + gap)];

  // Draw column borders
  colPositions.forEach((x, i) => {
    doc.rect(x, summaryY, colW, boxH).stroke('#cccccc');
  });

  const summaryLabelFont = valueFont;
  const summaryLabelSize = 8;
  const summaryValueSize = 8;
  const summaryLineH = 14;

  function renderSummaryRow(colIdx: number, label: string, value: string, y: number, bold = false) {
    const x = colPositions[colIdx];
    doc.font(summaryLabelFont).fontSize(summaryLabelSize).fillColor('#555555');
    doc.text(label, x + 4, y);
    doc.font(bold ? 'Helvetica-Bold' : valueFont).fontSize(summaryValueSize).fillColor('#000000');
    if (value) {
      doc.text(value, x + 4, y, { width: colW - 8, align: 'right' });
    }
  }

  // Column 1: Tidssaldo
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000').text('Tidssaldo', colPositions[0] + 4, summaryY + 5);
  doc.font(valueFont).fontSize(8).text('Komptid', colPositions[0] + 4, summaryY + 5 + summaryLineH);
  doc.text('-', colPositions[0] + 4, summaryY + 5 + summaryLineH, { width: colW - 8, align: 'right' });

  // Column 2: Totalt i år
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000').text('Totalt i år', colPositions[1] + 4, summaryY + 5);
  const ytdTotalHealthInsurance = data.ytdHealthInsurance + data.healthInsuranceBenefit;
  const ytdRows = [
    ['Bruttolön', formatAmount(data.ytdGross + data.totalBrutto)],
    ['Förmån', ytdTotalHealthInsurance > 0 ? formatAmount(ytdTotalHealthInsurance) : '-'],
    ['Skatt', formatAmount(data.ytdTax + data.taxAmount)],
  ];
  ytdRows.forEach(([label, value], i) => {
    renderSummaryRow(1, label, value, summaryY + 5 + (i + 1) * summaryLineH);
  });

  // Column 3: Skatt beräknad på
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000').text('Skatt beräknad på', colPositions[2] + 4, summaryY + 5);
  const taxRows: [string, string][] = [
    ['Bruttolön', formatAmount(data.totalBrutto)],
    ['Förmån', data.healthInsuranceBenefit > 0 ? formatAmount(data.healthInsuranceBenefit) : '-'],
    ['Tabell', String(data.taxTable)],
  ];
  taxRows.push(['Engångsskatt %', `${(data.taxRate * 100).toFixed(0)},00`]);
  taxRows.forEach(([label, value], i) => {
    renderSummaryRow(2, label, value, summaryY + 5 + (i + 1) * summaryLineH);
  });
  const avgiftRowOffset = taxRows.length + 1;
  doc.font(summaryLabelFont).fontSize(summaryLabelSize).fillColor('#555555');
  doc.text('Preliminär', colPositions[2] + 4, summaryY + 5 + avgiftRowOffset * summaryLineH);
  doc.text('arbetsgivaravgift', colPositions[2] + 4, summaryY + 5 + (avgiftRowOffset + 1) * summaryLineH);
  doc.font(valueFont).fontSize(summaryValueSize).fillColor('#000000');
  doc.text(formatAmount(data.employerAvgift), colPositions[2] + 4, summaryY + 5 + (avgiftRowOffset + 1) * summaryLineH, { width: colW - 8, align: 'right' });

  // Column 4: Utbetalning
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000').text('Utbetalning', colPositions[3] + 4, summaryY + 5);
  const payRows = [
    ['Bruttolön', formatAmount(data.totalBrutto)],
    ['Skatt', formatAmount(data.taxAmount)],
    ['Övriga avdrag', data.carDeduction > 0 ? `-${formatAmount(data.carDeduction)}` : '-'],
    ['Ersättning', '-'],
  ];
  payRows.forEach(([label, value], i) => {
    renderSummaryRow(3, label, value, summaryY + 5 + (i + 1) * summaryLineH);
  });

  // Utbetalas row — highlighted
  const utbetY = summaryY + boxH + 5;
  doc.rect(left, utbetY, pageWidth, 22).fill('#e8e8e8');
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
  doc.text(`Utbetalas  ${data.paymentDate}`, left + 10, utbetY + 6);
  doc.text(formatAmount(data.netSalary), left + 10, utbetY + 6, { width: pageWidth - 20, align: 'right' });

  // ─── FOOTER ───────────────────────────────────────────────────────────────
  const footerY = 760;
  doc.moveTo(left, footerY).lineTo(left + pageWidth, footerY).strokeColor('#cccccc').stroke();

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000')
    .text('Adress: ', left, footerY + 6, { continued: true, width: pageWidth });
  doc.font(valueFont).fontSize(8)
    .text('Kaellhammarone AB, Saltsjövägen 35, 181 62 Lidingö     ', { continued: true });
  doc.font('Helvetica-Bold').fontSize(8)
    .text('Tel: ', { continued: true });
  doc.font(valueFont).fontSize(8)
    .text('0735023651     ', { continued: true });
  doc.font('Helvetica-Bold').fontSize(8)
    .text('Org.nr: ', { continued: true });
  doc.font(valueFont).fontSize(8)
    .text('559123-2144     ', { continued: true });
  doc.font('Helvetica-Bold').fontSize(8)
    .text('E-post: ', { continued: true });
  doc.font(valueFont).fontSize(8)
    .text('victoria@xent.se');

  doc.end();
}
