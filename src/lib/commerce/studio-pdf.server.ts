import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import logo from "@/data/studio-logo.json";
import type { StudioRow, InvoiceBody, ProofBody } from "./studio-schemas";
import { money } from "./types";
/** Letter-size, persisted business data. No browser rendering or remote image fetch. */
export async function studioPdf(
  doc: StudioRow,
  images: { bytes: Uint8Array; mime: string }[] = [],
) {
  const pdf = await PDFDocument.create(),
    regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    serif = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  pdf.setTitle(
    `${doc.kind === "invoice" ? "Invoice" : "Design Proof"} ${doc.number} - REC Mama Made`,
  );
  pdf.setProducer("REC Mama Made Signature Studio");
  const rose = rgb(0.64, 0.435, 0.392),
    ink = rgb(0.157, 0.145, 0.137),
    muted = rgb(0.46, 0.43, 0.4),
    peach = rgb(0.953, 0.89, 0.86),
    cream = rgb(1, 0.988, 0.976);
  const brand = await pdf.embedJpg(Buffer.from(logo.data, "base64"));
  let page!: PDFPage;
  let y = 0;
  const clean = (s: string) =>
    Array.from(s, (c) => {
      if (c.charCodeAt(0) < 32 && c !== "\n" && c !== "\t") return "";
      try {
        regular.encodeText(c);
        return c;
      } catch {
        return "?";
      }
    }).join("");
  function newPage() {
    page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: cream });
    page.drawRectangle({ x: 0, y: 786, width: 612, height: 6, color: rose });
    page.drawImage(brand, { x: 44, y: 700, width: 61, height: 61 });
    page.drawText("REC MAMA MADE", { x: 118, y: 738, size: 17, font: bold, color: ink });
    page.drawText("Signature Studio", {
      x: 118,
      y: 719,
      size: 10,
      font: regular,
      color: rose,
    });
    page.drawText(doc.kind === "invoice" ? "INVOICE" : "DESIGN PROOF", {
      x: doc.kind === "invoice" ? 466 : 415,
      y: 738,
      size: doc.kind === "invoice" ? 21 : 17,
      font: bold,
      color: rose,
    });
    page.drawText(
      `${doc.kind === "invoice" ? "INV" : "P"}-${String(doc.number).padStart(5, "0")}${doc.kind === "proof" ? " / VERSION " + doc.proof_version : ""}`,
      { x: 118, y: 702, size: 10, font: regular, color: muted },
    );
    page.drawLine({ start: { x: 44, y: 686 }, end: { x: 568, y: 686 }, color: rose, thickness: 1 });
    y = 665;
  }
  function space(h: number) {
    if (y - h < 66) newPage();
  }
  function line(s: string, size = 10, color = ink, font = regular, x = 44, width = 524) {
    const paragraphs = clean(s).split("\n");
    for (const paragraph of paragraphs) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        let pieces = [word];
        if (font.widthOfTextAtSize(word, size) > width) {
          pieces = [];
          let piece = "";
          for (const c of word) {
            if (font.widthOfTextAtSize(piece + c, size) > width) {
              pieces.push(piece);
              piece = "";
            }
            piece += c;
          }
          if (piece) pieces.push(piece);
        }
        for (const piece of pieces) {
          if (current && font.widthOfTextAtSize(current + " " + piece, size) > width) {
            space(size + 7);
            page.drawText(current, { x, y, size, font, color });
            y -= size + 6;
            current = piece;
          } else current += (current ? " " : "") + piece;
        }
      }
      space(size + 7);
      page.drawText(current, { x, y, size, font, color });
      y -= size + 6;
    }
  }
  newPage();
  const b = doc.body,
    invoice = doc.kind === "invoice",
    ib = b as InvoiceBody,
    pb = b as ProofBody;
  line(invoice ? "BILL TO" : "PREPARED FOR", 9, rose, bold);
  line(
    invoice
      ? ib.customerName
      : ((b as unknown as { customerName?: string }).customerName ?? "Order customer"),
    12,
    ink,
    bold,
  );
  if (invoice) {
    line(ib.customerEmail);
    if (ib.billingAddress) line(ib.billingAddress);
    if (ib.shippingAddress) line("Ship to: " + ib.shippingAddress);
    line(
      `Created: ${new Date(doc.created_at).toISOString().slice(0, 10)}   Issued: ${doc.issued_at ? new Date(doc.issued_at).toISOString().slice(0, 10) : "Draft"}   Due: ${ib.dueDate}`,
    );
    line(`Status at issue: ${doc.state === "draft" ? "Draft" : "Unpaid"} | USD`, 9, muted);
  } else
    line(
      `Status at issue: ${doc.state.replaceAll("_", " ")}    Version: ${doc.proof_version ?? "Draft"}`,
    );
  if (doc.sender) {
    line(
      [doc.sender.name, doc.sender.email, doc.sender.phone, doc.sender.address]
        .filter(Boolean)
        .join(" | "),
      9,
      muted,
    );
  }
  y -= 12;
  if (invoice) {
    space(34);
    page.drawRectangle({ x: 44, y: y - 24, width: 524, height: 32, color: peach });
    page.drawText("DESCRIPTION", {
      x: 55,
      y: y - 12,
      size: 9,
      font: bold,
      color: rose,
    });
    for (const [title, x] of [
      ["QTY", 365],
      ["UNIT", 425],
      ["AMOUNT", 500],
    ] as const)
      page.drawText(title, { x, y: y - 12, size: 9, font: bold, color: rose });
    y -= 45;
    for (const item of ib.lines) {
      space(64);
      const top = y,
        rowPage = page;
      // Values stay with the title; long descriptions can continue to a new page.
      rowPage.drawText(String(item.quantity), {
        x: 365,
        y: top,
        size: 10,
        font: regular,
        color: ink,
      });
      rowPage.drawText(money(item.unitAmount), {
        x: 420,
        y: top,
        size: 10,
        font: regular,
        color: ink,
      });
      const value = money(item.quantity * item.unitAmount);
      rowPage.drawText(value, {
        x: 568 - regular.widthOfTextAtSize(value, 10),
        y: top,
        size: 10,
        font: regular,
        color: ink,
      });
      line(item.title, 11, ink, bold, 44, 300);
      if (item.specifications) line(item.specifications, 9, muted, regular, 44, 300);
      y = (rowPage === page ? Math.min(y, top - 32) : y) - 12;
    }
    space(140);
    for (const [name, amount] of [
      ["Subtotal", doc.subtotal],
      ["Discount", -ib.discount],
      ["Shipping", ib.shipping],
      ["Tax (recorded)", ib.tax],
    ] as const)
      line(`${name}: ${money(amount)}`, 11, ink, regular, 370, 198);
    line(`TOTAL: ${money(doc.total)}`, 18, rose, bold, 370, 198);
    line("Payments and remaining balance are shown on your secure invoice page.", 9, muted);
    if (ib.terms) {
      y -= 8;
      line("PAYMENT TERMS", 10, rose, bold);
      line(ib.terms);
    }
    if (ib.notes) {
      y -= 8;
      line("NOTES", 10, rose, bold);
      line(ib.notes);
    }
    y -= 12;
    line("SECURE ONLINE PAYMENT", 10, rose, bold);
    line(
      "Use the private invoice link supplied with your invoice. Payment status is confirmed only after provider verification.",
      10,
    );
    line("Thank you for supporting REC Mama Made.", 12, rose, serif);
  } else {
    line(pb.title, 12, ink, bold);
    for (const image of images) {
      const png = await sharp(image.bytes).rotate().png().toBuffer();
      const embedded = await pdf.embedPng(png);
      const factor = Math.min(524 / embedded.width, 340 / embedded.height);
      const h = embedded.height * factor;
      space(h + 18);
      page.drawImage(embedded, {
        x: 44 + (524 - embedded.width * factor) / 2,
        y: y - h,
        width: embedded.width * factor,
        height: h,
      });
      y -= h + 20;
    }
    line("DESIGN DETAILS", 11, rose, bold);
    for (const d of pb.details) line(`${d.label}: ${d.value}`);
    if (pb.notes) line(pb.notes);
    y -= 10;
    line("SEPARATE CUSTOMER APPROVAL", 11, rose, bold);
    line(
      "Review this exact version using your separate private proof link. Approve it or request changes there. Payment does not approve artwork; approval does not record a payment.",
    );
    line("Original production artwork is kept separately from these preview images.", 9, muted);
  }
  pdf.getPages().forEach((p, i) => {
    p.drawLine({ start: { x: 44, y: 46 }, end: { x: 568, y: 46 }, color: peach, thickness: 1 });
    p.drawText(
      `REC Mama Made | ${invoice ? "Invoice" : "Separate Design Proof"} | ${i + 1} / ${pdf.getPageCount()}`,
      { x: 44, y: 30, size: 8, font: regular, color: muted },
    );
  });
  return Buffer.from(await pdf.save());
}

/** Add a current ledger/response statement without rewriting the issued snapshot. */
export async function appendStudioStatement(bytes: Uint8Array, heading: string, entries: string[]) {
  const pdf = await PDFDocument.load(bytes),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page!: PDFPage,
    y = 0;
  function add() {
    page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 0.988, 0.976) });
    page.drawRectangle({ x: 0, y: 786, width: 612, height: 6, color: rgb(0.64, 0.435, 0.392) });
    page.drawText("REC MAMA MADE", { x: 44, y: 737, size: 17, font: bold });
    page.drawText(heading, { x: 44, y: 705, size: 14, font: bold, color: rgb(0.64, 0.435, 0.392) });
    page.drawText("Statement appended to the preserved issued document", {
      x: 44,
      y: 680,
      size: 9,
      font,
    });
    y = 649;
  }
  add();
  for (const entry of entries) {
    let line = "";
    for (const raw of entry.split(/\s+/)) {
      const word = Array.from(raw, (c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      }).join("");
      for (const piece of word.match(/.{1,75}/g) ?? [""]) {
        if (line && font.widthOfTextAtSize(line + " " + piece, 10) > 520) {
          if (y < 65) add();
          page.drawText(line, { x: 44, y, size: 10, font });
          y -= 16;
          line = piece;
        } else line += (line ? " " : "") + piece;
      }
    }
    if (y < 65) add();
    page.drawText(line, { x: 44, y, size: 10, font });
    y -= 24;
  }
  return Buffer.from(await pdf.save());
}
