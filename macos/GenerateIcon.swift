import Cocoa
import CoreGraphics
import CoreText

func drawMuseoIcon(size: Int) -> NSImage {
    let cgSize = CGSize(width: size, height: size)
    let image = NSImage(size: cgSize)
    image.lockFocus()
    guard let ctx = NSGraphicsContext.current?.cgContext else {
        image.unlockFocus()
        return image
    }

    let s = CGFloat(size)
    let pad = s * 0.055
    let rect = CGRect(x: pad, y: pad, width: s - pad * 2, height: s - pad * 2)
    let cornerRadius = rect.width * 0.225

    // Drop shadow
    ctx.saveGState()
    let bgPath = CGPath(roundedRect: rect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)
    ctx.addPath(bgPath)
    ctx.clip()

    // Deep Adobe-style dark plum/indigo background gradient (#1D0733 -> #11031F)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bgColors = [
        CGColor(red: 0.13, green: 0.03, blue: 0.22, alpha: 1.0),
        CGColor(red: 0.07, green: 0.015, blue: 0.12, alpha: 1.0)
    ] as CFArray
    if let grad = CGGradient(colorsSpace: colorSpace, colors: bgColors, locations: [0.0, 1.0]) {
        ctx.drawLinearGradient(
            grad,
            start: CGPoint(x: rect.minX, y: rect.maxY),
            end: CGPoint(x: rect.maxX, y: rect.minY),
            options: []
        )
    }

    // Subtle ambient glow in upper right
    let glowColors = [
        CGColor(red: 0.78, green: 0.43, blue: 1.0, alpha: 0.25),
        CGColor(red: 0.78, green: 0.43, blue: 1.0, alpha: 0.0)
    ] as CFArray
    if let glowGrad = CGGradient(colorsSpace: colorSpace, colors: glowColors, locations: [0.0, 1.0]) {
        let glowCenter = CGPoint(x: rect.maxX - rect.width * 0.22, y: rect.maxY - rect.height * 0.20)
        ctx.drawRadialGradient(
            glowGrad,
            startCenter: glowCenter,
            startRadius: 0,
            endCenter: glowCenter,
            endRadius: rect.width * 0.65,
            options: []
        )
    }
    ctx.restoreGState()

    // Signature Adobe Creative Cloud style inset neon border (#C06EFF)
    let borderWidth = max(1.5, s * 0.042)
    let borderRect = rect.insetBy(dx: borderWidth * 0.5, dy: borderWidth * 0.5)
    let borderRadius = max(2.0, cornerRadius - borderWidth * 0.5)
    let borderPath = CGPath(roundedRect: borderRect, cornerWidth: borderRadius, cornerHeight: borderRadius, transform: nil)
    ctx.saveGState()
    ctx.addPath(borderPath)
    ctx.setStrokeColor(CGColor(red: 0.753, green: 0.431, blue: 1.0, alpha: 1.0))
    ctx.setLineWidth(borderWidth)
    ctx.strokePath()
    ctx.restoreGState()

    // Draw "Mu" geometric monogram
    let fontSize = s * 0.43
    let font = NSFont.systemFont(ofSize: fontSize, weight: .heavy)

    let mAttr: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor(calibratedRed: 0.965, green: 0.933, blue: 1.0, alpha: 1.0),
        .kern: -fontSize * 0.035
    ]
    let uAttr: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor(calibratedRed: 0.851, green: 0.608, blue: 1.0, alpha: 1.0),
        .kern: -fontSize * 0.035
    ]

    let combo = NSMutableAttributedString(string: "M", attributes: mAttr)
    combo.append(NSAttributedString(string: "u", attributes: uAttr))

    let strSize = combo.size()
    let textX = (s - strSize.width) * 0.5
    let textY = (s - strSize.height) * 0.5 - s * 0.01
    combo.draw(at: NSPoint(x: textX, y: textY))

    image.unlockFocus()
    return image
}

func savePNG(_ image: NSImage, to path: String, pixelSize: Int) {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else {
        return
    }
    try? png.write(to: URL(fileURLWithPath: path))
}

let args = CommandLine.arguments
let outDir = args.count > 1 ? args[1] : "."
let iconsetDir = "\(outDir)/Museo.iconset"
try? FileManager.default.createDirectory(atPath: iconsetDir, withIntermediateDirectories: true)

let sizes: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for (name, px) in sizes {
    let img = drawMuseoIcon(size: px)
    savePNG(img, to: "\(iconsetDir)/\(name)", pixelSize: px)
}

let previewImg = drawMuseoIcon(size: 512)
savePNG(previewImg, to: "\(outDir)/assets/museo-icon.png", pixelSize: 512)
print("Generated iconset in \(iconsetDir)")
