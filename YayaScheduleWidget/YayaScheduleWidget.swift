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
        VStack(alignment: .leading, spacing: spacing) {
            header
            ddlCard(compact: true)
            scheduleTimelineCard(compact: true)
        }
    }

    private var mediumContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            ddlCard(compact: false)
                .frame(width: 228, alignment: .leading)
            scheduleTimelineCard(compact: false)
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
        HStack(alignment: .center, spacing: 8) {
            ZStack {
                Circle().fill(Color.white.opacity(0.34))
                Circle()
                    .fill(entry.data.isFresh ? palette.warm : palette.muted.opacity(0.52))
                    .frame(width: 7, height: 7)
            }
            .frame(width: 18, height: 18)

            VStack(alignment: .leading, spacing: 0) {
                Text("鸦鸦日程")
                    .font(.system(size: family == .systemSmall ? 15 : 17, weight: .black, design: .rounded))
                    .foregroundColor(palette.ink)
                    .lineLimit(1)
                if family != .systemSmall {
                    Text(dayText)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(palette.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func ddlCard(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: compact ? 4 : 5) {
            HStack(spacing: 6) {
                Capsule()
                    .fill(palette.accent)
                    .frame(width: 5, height: compact ? 14 : 16)
                Text("最近 DDL")
                    .font(.system(size: compact ? 10 : 11, weight: .black, design: .rounded))
                    .foregroundColor(palette.ink)
                    .lineLimit(1)
            }
            Text(entry.data.ddlTitle.isEmpty ? "暂无 DDL" : entry.data.ddlTitle)
                .font(.system(size: compact ? 16 : 17, weight: .black, design: .rounded))
                .foregroundColor(palette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            if !entry.data.ddlTime.isEmpty {
                Text(entry.data.ddlTime)
                    .font(.system(size: compact ? 11 : 12, weight: .semibold, design: .rounded))
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
            }
        }
        .padding(compact ? 10 : 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: palette.radius, style: .continuous)
                .fill(palette.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: palette.radius, style: .continuous)
                        .stroke(palette.border, lineWidth: 1)
                )
                .shadow(color: palette.shadow, radius: 12, x: 0, y: 8)
        )
    }

    private func scheduleTimelineCard(compact: Bool, tall: Bool = false) -> some View {
        HStack(alignment: .top, spacing: compact ? 9 : 13) {
            VStack(alignment: .leading, spacing: compact ? 6 : 8) {
                HStack(spacing: 6) {
                    Capsule()
                        .fill(palette.warm)
                        .frame(width: 5, height: compact ? 16 : 18)
                    Text(scheduleLabel)
                        .font(.system(size: compact ? 10 : 11, weight: .black, design: .rounded))
                        .foregroundColor(palette.muted)
                        .lineLimit(1)
                }

                Text(entry.data.scheduleTitle.isEmpty ? "暂无安排" : entry.data.scheduleTitle)
                    .font(.system(size: compact ? 15 : (tall ? 24 : 21), weight: .black, design: .rounded))
                    .foregroundColor(palette.ink)
                    .lineLimit(tall ? 2 : 1)
                    .minimumScaleFactor(0.82)

                scheduleTimeText
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            timelineRail(compact: compact, tall: tall)
        }
        .padding(compact ? 11 : 16)
        .frame(maxWidth: .infinity, minHeight: tall ? 180 : nil, alignment: .topLeading)
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
                    .font(.system(size: family == .systemSmall ? 10 : 12, weight: .semibold, design: .rounded))
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
            }
        }
    }

    private func timelineRail(compact: Bool, tall: Bool) -> some View {
        GeometryReader { proxy in
            let height = proxy.size.height
            let cursorSize: CGFloat = compact ? 9 : 11
            let travel = max(1, height - cursorSize)
            let y = travel * CGFloat(progress)
            ZStack(alignment: .top) {
                Capsule()
                    .fill(Color.white.opacity(0.34))
                    .frame(width: compact ? 4 : 5)

                Rectangle()
                    .fill(LinearGradient(
                        colors: [
                            Color.clear,
                            palette.warm.opacity(entry.data.scheduleActive ? 0.18 : 0.08),
                            Color.clear
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ))
                    .frame(width: compact ? 24 : 34)
                    .offset(y: max(-18, y - 22))

                Capsule()
                    .fill(palette.warm.opacity(entry.data.scheduleActive ? 0.76 : 0.28))
                    .frame(width: compact ? 4 : 5, height: compact ? 34 : 46)
                    .offset(y: max(0, y - (compact ? 18 : 24)))

                Circle()
                    .fill(palette.ink.opacity(entry.data.scheduleActive ? 0.84 : 0.36))
                    .frame(width: cursorSize, height: cursorSize)
                    .offset(y: y)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(width: compact ? 26 : 36, minHeight: tall ? 130 : (compact ? 70 : 86))
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

    private var widgetPadding: CGFloat {
        family == .systemSmall ? 12 : 14
    }

    private var spacing: CGFloat {
        family == .systemSmall ? 8 : 10
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
