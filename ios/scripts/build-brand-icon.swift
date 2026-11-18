import AppKit

// The already approved Android Atha icon is the only branding source.
guard CommandLine.arguments.count == 3 else { fatalError("Specify approved source webp and output png") }
let from = CommandLine.arguments[1], to = CommandLine.arguments[2]
guard let image = NSImage(contentsOfFile: from), image.isValid else {
    fatalError("Approved Android icon could not be decoded; do not invent a substitute")
}
let canvas = NSImage(size: NSSize(width: 1024, height: 1024))
canvas.lockFocus()
NSColor(calibratedRed: 8/255, green: 27/255, blue: 34/255, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1024, height: 1024)).fill()
image.draw(in: NSRect(x: 44, y: 44, width: 936, height: 936),
           from: NSRect(origin: .zero, size: image.size), operation: .sourceOver, fraction: 1)
canvas.unlockFocus()
guard let data = canvas.tiffRepresentation,
      let rep = NSBitmapImageRep(data: data),
      let png = rep.representation(using: .png, properties: [:]) else { fatalError("Icon export failed") }
try png.write(to: URL(fileURLWithPath: to), options: .atomic)
