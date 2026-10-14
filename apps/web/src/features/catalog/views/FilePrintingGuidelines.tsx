function GuidelineList({ items }: { items: string[] }) {
  return (
    <ul className="pd-guidelines-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Static artwork / print guidelines shown on every product detail page. */
export function FilePrintingGuidelines() {
  return (
    <div className="pd-guidelines">
      <p className="pd-guidelines-intro">
        To ensure the best print and embroidery results, please follow the guidelines below when
        submitting your artwork.
      </p>

      <section className="pd-guidelines-section">
        <h3 className="pd-guidelines-heading">General Artwork Guidelines</h3>
        <GuidelineList
          items={[
            "We accept most common artwork formats. Vector files (AI, PDF, EPS) are strongly preferred for best quality.",
            "Raster formats such as PNG or JPEG are accepted.",
            "Recommended resolution: 300 DPI at actual print size.",
            "Simply increasing the resolution of a low-quality image will not improve print quality. Create your design at the correct size and resolution from the beginning.",
            "Maximum upload size: Up to 200 MB per file.",
            "If your design requires transparency, use PNG format.",
          ]}
        />
      </section>

      <section className="pd-guidelines-section">
        <h3 className="pd-guidelines-heading">Print Size &amp; Image Size</h3>
        <GuidelineList
          items={[
            "Print size refers to how large your design will appear on the garment (measured in inches or centimeters).",
            "This may differ from your digital image dimensions.",
            "You can view and adjust the print size inside the design tool before finalising your order.",
            "Image file size (MB or KB) refers only to storage size and does not determine print dimensions.",
          ]}
        />
      </section>

      <section className="pd-guidelines-section">
        <h3 className="pd-guidelines-heading">DTF Printing Guidelines</h3>
        <GuidelineList
          items={[
            "Use high-resolution artwork at 300 DPI for best results.",
            "Avoid very thin lines below 0.5 pt thickness.",
            "Avoid dark designs on dark garments, as contrast may be reduced.",
            "Neon colours may not reproduce exactly as seen on screen.",
            "Ensure your artwork is sized correctly before upload.",
          ]}
        />
      </section>

      <section className="pd-guidelines-section">
        <h3 className="pd-guidelines-heading">Embroidery Guidelines</h3>
        <GuidelineList
          items={[
            "Preferred formats: PNG, AI, PDF, DST (if available)",
            "Minimum text height: 0.25 inches",
            "Minimum line thickness: 0.05 inches",
            "Avoid gradients. Embroidery works best with solid colours.",
            "Do not use photographs. Clean vector graphics give the best results.",
            "Use simple, legible fonts and avoid overly intricate letterforms.",
            "Limit colour changes for cleaner stitching and better finish.",
          ]}
        />
      </section>

      <section className="pd-guidelines-section">
        <h3 className="pd-guidelines-heading">Laser Engraving Guidelines</h3>
        <p className="pd-guidelines-lead">
          To achieve sharp and precise engraving results, please follow the guidelines below when
          submitting your artwork:
        </p>
        <GuidelineList
          items={[
            "Accepted file formats: PNG or SVG",
            "Artwork must be solid black only on a transparent background",
            "Do not include any white or coloured background",
            "Minimum line thickness: 0.2 mm (0.008 inches)",
            "Minimum text height: 1.5 mm (0.06 inches)",
            "Avoid colour, grayscale pixels, gradients, shadows, glows, or soft effects",
          ]}
        />
        <p className="pd-guidelines-note">
          Laser engraving works best with clean, high-contrast vector designs. Simple, bold artwork
          ensures the most accurate and professional finish.
        </p>
      </section>

      <section className="pd-guidelines-section">
        <h3 className="pd-guidelines-heading">Important Notes</h3>
        <GuidelineList
          items={[
            "Final output may vary slightly depending on garment colour and fabric texture.",
            "Our production team may contact you if adjustments are required for optimal results.",
            "By uploading artwork, you confirm you have the rights to use the design.",
          ]}
        />
      </section>
    </div>
  );
}
