import Foundation
import SwiftUI
import WidgetKit

private let appGroupIdentifier = "group.com.xuyunfan.yayaschedule"
private let widgetPayloadKey = "homeWidgetPayload"

struct YayaWidgetData: Decodable {
    let ddlTitle: String
    let ddlTime: String
    let scheduleTitle: String
    let scheduleTime: String
    let schedulePlace: String
    let scheduleLabel: String
    let scheduleProgress: Double
    let scheduleActive: Bool
    let theme: YayaWidgetTheme?
    let updatedAt: Double

    static let empty = YayaWidgetData(
        ddlTitle: "暂无 DDL",
        ddlTime: "",
        scheduleTitle: "暂无课程或日程",
        scheduleTime: "",
        schedulePlace: "",
        scheduleLabel: "最近日程",
        scheduleProgress: 0,
        scheduleActive: false,
        theme: .fallback,
        updatedAt: 0
    )

    var resolvedTheme: YayaWidgetTheme {
        theme ?? .fallback
    }

    var isFresh: Bool {
        guard updatedAt > 0 else { return false }
        return Date().timeIntervalSince1970 - updatedAt < 60 * 60 * 12
    }
}

struct YayaWidgetTheme: Decodable {
    let themeId: String
    let accent: String
    let warm: String
    let bg: String
    let ink: String
    let muted: String
    let glassAlpha: Double?
    let radius: Double?

    static let fallback = YayaWidgetTheme(
        themeId: "coolGlass",
        accent: "#2563eb",
        warm: "#14b8a6",
        bg: "#edf5ff",
        ink: "#14213d",
        muted: "#64748b",
        glassAlpha: 68,
        radius: 18
    )
}

private struct YayaRGB {
    let r: Double
    let g: Double
    let b: Double

    static let white = YayaRGB(r: 1, g: 1, b: 1)
    static let black = YayaRGB(r: 0, g: 0, b: 0)

    static func hex(_ value: String, fallback: YayaRGB) -> YayaRGB {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.hasPrefix("#"), text.count == 7 else { return fallback }
        let hex = String(text.dropFirst())
        guard let intValue = Int(hex, radix: 16) else { return fallback }
        return YayaRGB(
            r: Double((intValue >> 16) & 0xff) / 255,
            g: Double((intValue >> 8) & 0xff) / 255,
            b: Double(intValue & 0xff) / 255
        )
    }

    func color(alpha: Double = 1) -> Color {
        Color(red: r, green: g, blue: b).opacity(alpha)
    }

    func mixed(with other: YayaRGB, amount: Double) -> YayaRGB {
        let value = min(max(amount, 0), 1)
        return YayaRGB(
            r: r * (1 - value) + other.r * value,
            g: g * (1 - value) + other.g * value,
            b: b * (1 - value) + other.b * value
        )
    }

    var luminance: Double {
        func channel(_ value: Double) -> Double {
            value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
}

private struct YayaWidgetPalette {
    let bgTop: Color
    let bgMid: Color
    let bgBottom: Color
    let accent: Color
    let warm: Color
    let ink: Color
    let muted: Color
    let cardFill: Color
    let scheduleFill: Color
    let border: Color
    let shadow: Color
    let glow: Color
    let radius: CGFloat

    static func from(_ theme: YayaWidgetTheme) -> YayaWidgetPalette {
        let fallback = YayaWidgetTheme.fallback
        let accent = YayaRGB.hex(theme.accent, fallback: YayaRGB.hex(fallback.accent, fallback: .black))
        let warm = YayaRGB.hex(theme.warm, fallback: YayaRGB.hex(fallback.warm, fallback: .black))
        let bg = YayaRGB.hex(theme.bg, fallback: YayaRGB.hex(fallback.bg, fallback: .white))
        let ink = YayaRGB.hex(theme.ink, fallback: YayaRGB.hex(fallback.ink, fallback: .black))
        let muted = YayaRGB.hex(theme.muted, fallback: YayaRGB.hex(fallback.muted, fallback: .black))
        let isDark = bg.luminance < 0.32 || ink.luminance > 0.72
        let glassAlpha = min(max(theme.glassAlpha ?? 68, 24), 96) / 100
        let radius = CGFloat(min(max(theme.radius ?? 18, 12), 30))

        if isDark {
            return YayaWidgetPalette(
                bgTop: bg.mixed(with: accent, amount: 0.18).color(),
                bgMid: bg.color(),
                bgBottom: bg.mixed(with: warm, amount: 0.22).color(),
                accent: accent.color(),
                warm: warm.color(),
                ink: Color.white.opacity(0.92),
                muted: Color.white.opacity(0.68),
                cardFill: Color.white.opacity(max(0.12, glassAlpha * 0.22)),
                scheduleFill: warm.mixed(with: YayaRGB.white, amount: 0.12).color(alpha: max(0.12, glassAlpha * 0.2)),
                border: Color.white.opacity(0.24),
                shadow: Color.black.opacity(0.24),
                glow: accent.color(alpha: 0.22),
                radius: radius
            )
        }

        return YayaWidgetPalette(
            bgTop: bg.mixed(with: YayaRGB.white, amount: 0.34).color(),
            bgMid: bg.mixed(with: accent, amount: 0.08).color(),
            bgBottom: bg.mixed(with: warm, amount: 0.12).color(),
            accent: accent.color(),
            warm: warm.color(),
            ink: ink.color(),
            muted: muted.color(alpha: 0.82),
            cardFill: YayaRGB.white.mixed(with: accent, amount: 0.08).color(alpha: max(0.48, glassAlpha * 0.78)),
            scheduleFill: YayaRGB.white.mixed(with: warm, amount: 0.1).color(alpha: max(0.48, glassAlpha * 0.76)),
            border: Color.white.opacity(max(0.5, glassAlpha * 0.88)),
            shadow: accent.color(alpha: 0.12),
            glow: accent.color(alpha: 0.16),
            radius: radius
        )
    }
}

struct YayaWidgetEntry: TimelineEntry {
    let date: Date
    let data: YayaWidgetData
}

struct YayaWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> YayaWidgetEntry {
        YayaWidgetEntry(date: Date(), data: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (YayaWidgetEntry) -> Void) {
        completion(YayaWidgetEntry(date: Date(), data: readData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<YayaWidgetEntry>) -> Void) {
        let entry = YayaWidgetEntry(date: Date(), data: readData())
        let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func readData() -> YayaWidgetData {
        guard let data = UserDefaults(suiteName: appGroupIdentifier)?.data(forKey: widgetPayloadKey),
              let payload = try? JSONDecoder().decode(YayaWidgetData.self, from: data) else {
            return .empty
        }
        return payload
    }
}

struct YayaScheduleWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: YayaWidgetEntry

    var body: some View {
        ZStack {
            widgetBackground
            glassGlow
            content
                .padding(widgetPadding)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .yayaWidgetBackground(widgetBackground)
    }

    private var content: some View {
        Group {
            if family == .systemSmall {
                smallContent
            } else if family == .systemMedium {
                mediumContent
            } else {
                largeContent
            }
        }
    }

    private var smallContent: some View {
        VStack(alignment: .leading, spacing: 5) {
            header
            ddlCard(compact: true)
            scheduleTimelineCard(compact: true)
        }
    }

    private var mediumContent: some View {
        VStack(alignment: .leading, spacing: 5) {
            header
            ddlCard(compact: true)
                .frame(width: 220, alignment: .leading)
            scheduleTimelineCard(compact: true)
        }
    }

    private var largeContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            ddlCard(compact: false)
                .frame(width: 246, alignment: .leading)
            scheduleTimelineCard(compact: false, tall: true)
        }
    }

    private var header: some View {
        let compactHeader = family != .systemLarge
        HStack(alignment: .center, spacing: 8) {
            ZStack {
                Circle().fill(Color.white.opacity(0.34))
                Circle()
                    .fill(entry.data.isFresh ? palette.warm : palette.muted.opacity(0.52))
                    .frame(width: compactHeader ? 6 : 7, height: compactHeader ? 6 : 7)
            }
            .frame(width: compactHeader ? 16 : 18, height: compactHeader ? 16 : 18)

            VStack(alignment: .leading, spacing: 0) {
                Text("鸦鸦日程")
                    .font(.system(size: family == .systemSmall ? 13 : (compactHeader ? 15 : 17), weight: .black, design: .rounded))
                    .foregroundColor(palette.ink)
                    .lineLimit(1)
                if family != .systemSmall {
                    Text(dayText)
                        .font(.system(size: compactHeader ? 9 : 11, weight: .bold, design: .rounded))
                        .foregroundColor(palette.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func ddlCard(compact: Bool) -> some View {
        Group {
            if compact {
                HStack(alignment: .center, spacing: 8) {
                    Capsule()
                        .fill(palette.accent)
                        .frame(width: 4, height: 24)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("最近 DDL")
                            .font(.system(size: 8, weight: .black, design: .rounded))
                            .foregroundColor(palette.ink)
                            .lineLimit(1)
                        Text(entry.data.ddlTitle.isEmpty ? "暂无 DDL" : entry.data.ddlTitle)
                            .font(.system(size: 13, weight: .black, design: .rounded))
                            .foregroundColor(palette.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)
                        if !entry.data.ddlTime.isEmpty {
                            Text(entry.data.ddlTime)
                                .font(.system(size: 8, weight: .semibold, design: .rounded))
                                .foregroundColor(palette.muted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 6) {
                        Capsule()
                            .fill(palette.accent)
                            .frame(width: 5, height: 16)
                        Text("最近 DDL")
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .foregroundColor(palette.ink)
                            .lineLimit(1)
                    }
                    Text(entry.data.ddlTitle.isEmpty ? "暂无 DDL" : entry.data.ddlTitle)
                        .font(.system(size: 17, weight: .black, design: .rounded))
                        .foregroundColor(palette.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                    if !entry.data.ddlTime.isEmpty {
                        Text(entry.data.ddlTime)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundColor(palette.muted)
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(.horizontal, compact ? 10 : 11)
        .padding(.vertical, compact ? 5 : 11)
        .frame(maxWidth: .infinity, minHeight: compact ? 44 : nil, maxHeight: compact ? 44 : nil, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: palette.radius, style: .continuous)
                .fill(palette.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: palette.radius, style: .continuous)
                        .stroke(palette.border, lineWidth: 1)
                )
                .shadow(color: palette.shadow, radius: compact ? 8 : 12, x: 0, y: compact ? 5 : 8)
        )
    }

    private func scheduleTimelineCard(compact: Bool, tall: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: compact ? 2 : 10) {
            HStack(spacing: compact ? 5 : 6) {
                Capsule()
                    .fill(palette.warm)
                    .frame(width: compact ? 4 : 5, height: compact ? 18 : 18)
                Text(scheduleLabel)
                    .font(.system(size: compact ? 8 : 11, weight: .black, design: .rounded))
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
            }

            Text(entry.data.scheduleTitle.isEmpty ? "暂无安排" : entry.data.scheduleTitle)
                .font(.system(size: compact ? 13 : (tall ? 24 : 21), weight: .black, design: .rounded))
                .foregroundColor(palette.ink)
                .lineLimit(tall ? 2 : 1)
                .minimumScaleFactor(0.82)

            scheduleTimeText

            scheduleTimeline(compact: compact, tall: tall)
        }
        .padding(.horizontal, compact ? 11 : 16)
        .padding(.vertical, compact ? 5 : 14)
        .frame(maxWidth: .infinity, minHeight: tall ? 180 : (compact ? 72 : 98), maxHeight: compact ? 72 : nil, alignment: tall ? .topLeading : .leading)
        .background(
            RoundedRectangle(cornerRadius: palette.radius + (tall ? CGFloat(4) : CGFloat(0)), style: .continuous)
                .fill(palette.scheduleFill)
                .overlay(
                    RoundedRectangle(cornerRadius: palette.radius + (tall ? CGFloat(4) : CGFloat(0)), style: .continuous)
                        .stroke(palette.border, lineWidth: 1)
                )
                .shadow(color: palette.shadow, radius: 14, x: 0, y: 9)
        )
    }

    private var scheduleTimeText: some View {
        let parts = [entry.data.scheduleTime, entry.data.schedulePlace].filter { !$0.isEmpty }
        return Group {
            if !parts.isEmpty {
                Text(parts.joined(separator: " · "))
                    .font(.system(size: family != .systemLarge ? 8 : 12, weight: .semibold, design: .rounded))
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.76)
            }
        }
    }

    private func scheduleTimeline(compact: Bool, tall: Bool) -> some View {
        GeometryReader { proxy in
            let width = max(1, proxy.size.width)
            let cursorSize: CGFloat = compact ? 8 : 11
            let lineY: CGFloat = compact ? 6 : 12
            let startX = cursorSize / 2
            let endX = width - cursorSize / 2
            let travel = max(1, endX - startX)
            let cursorX = startX + travel * CGFloat(progress)

            ZStack(alignment: .topLeading) {
                Path { path in
                    path.move(to: CGPoint(x: startX, y: lineY))
                    path.addLine(to: CGPoint(x: endX, y: lineY))
                }
                .stroke(
                    palette.muted.opacity(0.45),
                    style: StrokeStyle(lineWidth: compact ? 1.1 : 1.4, lineCap: .round, dash: [1.8, 5.2])
                )

                Circle()
                    .fill(palette.muted.opacity(0.52))
                    .frame(width: compact ? 5 : 7, height: compact ? 5 : 7)
                    .position(x: startX, y: lineY)

                Circle()
                    .fill(palette.muted.opacity(0.52))
                    .frame(width: compact ? 5 : 7, height: compact ? 5 : 7)
                    .position(x: endX, y: lineY)

                ZStack {
                    Circle()
                        .fill(palette.warm.opacity(entry.data.scheduleActive ? 0.24 : 0.12))
                        .frame(width: compact ? 18 : 24, height: compact ? 18 : 24)
                    Circle()
                        .fill(palette.warm.opacity(entry.data.scheduleActive ? 0.95 : 0.58))
                        .frame(width: cursorSize, height: cursorSize)
                        .overlay(
                            Circle()
                                .stroke(Color.white.opacity(0.88), lineWidth: 1)
                        )
                }
                .position(x: cursorX, y: lineY)

                if !compact, let range = scheduleTimeRange {
                    HStack {
                        Text(range.start)
                        Spacer(minLength: 0)
                        Text(range.end)
                    }
                    .font(.system(size: tall ? 10 : 9, weight: .bold, design: .rounded))
                    .foregroundColor(palette.muted.opacity(0.78))
                    .offset(y: lineY + 8)
                }
            }
        }
        .frame(height: compact ? 10 : (tall ? 32 : 28))
    }

    private var widgetBackground: some View {
        LinearGradient(
            colors: [
                palette.bgTop,
                palette.bgMid,
                palette.bgBottom
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var glassGlow: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.38))
                .blur(radius: 24)
                .offset(x: -48, y: -36)
            Circle()
                .fill(palette.glow)
                .blur(radius: 28)
                .offset(x: 56, y: 48)
        }
    }

    private var palette: YayaWidgetPalette {
        YayaWidgetPalette.from(entry.data.resolvedTheme)
    }

    private var scheduleLabel: String {
        entry.data.scheduleLabel.isEmpty ? "最近日程" : entry.data.scheduleLabel
    }

    private var progress: Double {
        min(max(entry.data.scheduleProgress, 0), 100) / 100
    }

    private var scheduleTimeRange: (start: String, end: String)? {
        let text = entry.data.scheduleTime
            .replacingOccurrences(of: "–", with: "-")
            .replacingOccurrences(of: "—", with: "-")
            .replacingOccurrences(of: "至", with: "-")
            .replacingOccurrences(of: "~", with: "-")
        let parts = text
            .components(separatedBy: "-")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard parts.count >= 2 else { return nil }
        return (start: parts[0], end: parts[1])
    }

    private var widgetPadding: CGFloat {
        family == .systemLarge ? 14 : 8
    }

    private var dayText: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日 EEEE"
        return formatter.string(from: entry.date)
    }
}

private extension View {
    @ViewBuilder
    func yayaWidgetBackground<Background: View>(_ background: Background) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) {
                background
            }
        } else {
            ZStack {
                background
                self
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

@main
struct YayaScheduleWidget: Widget {
    let kind = "YayaScheduleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: YayaWidgetProvider()) { entry in
            YayaScheduleWidgetView(entry: entry)
        }
        .configurationDisplayName("鸦鸦日程")
        .description("显示最近 DDL 与最近日程。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
