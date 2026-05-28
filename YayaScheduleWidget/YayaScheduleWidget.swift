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
    private static let decoder = JSONDecoder()

    func placeholder(in context: Context) -> YayaWidgetEntry {
        YayaWidgetEntry(date: Date(), data: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (YayaWidgetEntry) -> Void) {
        completion(YayaWidgetEntry(date: Date(), data: readData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<YayaWidgetEntry>) -> Void) {
        let data = readData()
        let now = Date()
        let entries: [YayaWidgetEntry]
        let refreshMinutes: Int

        if data.scheduleActive {
            entries = (0..<12).map { offset in
                YayaWidgetEntry(date: now.addingTimeInterval(TimeInterval(offset * 300)), data: data)
            }
            refreshMinutes = 60
        } else {
            entries = [YayaWidgetEntry(date: now, data: data)]
            refreshMinutes = 90
        }

        let refresh = Calendar.current.date(byAdding: .minute, value: refreshMinutes, to: now)
            ?? now.addingTimeInterval(TimeInterval(refreshMinutes * 60))
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }

    private func readData() -> YayaWidgetData {
        guard let data = UserDefaults(suiteName: appGroupIdentifier)?.data(forKey: widgetPayloadKey),
              let payload = try? Self.decoder.decode(YayaWidgetData.self, from: data) else {
            return .empty
        }
        return payload
    }
}

struct YayaScheduleWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: YayaWidgetEntry
    private let palette: YayaWidgetPalette

    init(entry: YayaWidgetEntry) {
        self.entry = entry
        self.palette = YayaWidgetPalette.from(entry.data.resolvedTheme)
    }

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
            } else {
                mediumContent
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

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            ZStack {
                Circle().fill(Color.white.opacity(0.34))
                Circle()
                    .fill(entry.data.isFresh ? palette.warm : palette.muted.opacity(0.52))
                    .frame(width: 6, height: 6)
            }
            .frame(width: 16, height: 16)

            VStack(alignment: .leading, spacing: 0) {
                Text("鸦鸦日程")
                    .font(.system(size: family == .systemSmall ? 13 : 15, weight: .black, design: .rounded))
                    .foregroundColor(palette.ink)
                    .lineLimit(1)
                if family != .systemSmall {
                    Text(dayText)
                        .font(.system(size: 9, weight: .bold, design: .rounded))
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

    private func scheduleTimelineCard(compact: Bool) -> some View {
        ZStack(alignment: .leading) {
            movingScheduleLine(compact: compact)
                .padding(.horizontal, compact ? 12 : 14)
                .padding(.vertical, compact ? 8 : 10)

            VStack(alignment: .leading, spacing: compact ? 2 : 3) {
                HStack(spacing: 5) {
                    Capsule()
                        .fill(palette.warm)
                        .frame(width: 4, height: compact ? 16 : 18)
                    Text(scheduleLabel)
                        .font(.system(size: compact ? 8 : 9, weight: .black, design: .rounded))
                        .foregroundColor(palette.muted)
                        .lineLimit(1)
                }

                Text(entry.data.scheduleTitle.isEmpty ? "暂无安排" : entry.data.scheduleTitle)
                    .font(.system(size: compact ? 13 : 16, weight: .black, design: .rounded))
                    .foregroundColor(palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)

                scheduleTimeBlock(compact: compact)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, compact ? 11 : 14)
            .padding(.vertical, compact ? 7 : 10)
        }
        .frame(maxWidth: .infinity, minHeight: compact ? 72 : 82, maxHeight: compact ? 72 : 82, alignment: .leading)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: palette.radius, style: .continuous)
                    .fill(palette.scheduleFill)
                RoundedRectangle(cornerRadius: palette.radius, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.24),
                                palette.warm.opacity(0.06),
                                Color.clear
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .blendMode(.screen)
                RoundedRectangle(cornerRadius: palette.radius, style: .continuous)
                    .stroke(palette.border, lineWidth: 1)
                    .shadow(color: palette.shadow, radius: 14, x: 0, y: 9)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: palette.radius, style: .continuous))
    }

    private func scheduleTimeBlock(compact: Bool) -> some View {
        let parts = [entry.data.scheduleTime, entry.data.schedulePlace].filter { !$0.isEmpty }
        return Group {
            if !parts.isEmpty {
                Text(parts.joined(separator: " · "))
                    .font(.system(size: 8, weight: .semibold, design: .rounded))
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.76)
                    .padding(.horizontal, compact ? 7 : 8)
                    .padding(.vertical, compact ? 3 : 4)
                    .background(
                        Capsule(style: .continuous)
                            .fill(Color.white.opacity(0.28))
                            .overlay(
                                Capsule(style: .continuous)
                                    .stroke(Color.white.opacity(0.46), lineWidth: 0.8)
                            )
                    )
            }
        }
    }

    private func movingScheduleLine(compact: Bool) -> some View {
        GeometryReader { proxy in
            let width = max(1, proxy.size.width)
            let height = max(1, proxy.size.height)
            let rawX = width * CGFloat(scheduleLineProgress)
            let lineX = min(max(rawX, 0.6), width - 0.6)
            let tintWidth = max(lineX, 0.1)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: max(10, palette.radius * 0.72), style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                palette.warm.opacity(entry.data.scheduleActive ? 0.085 : 0.035),
                                palette.accent.opacity(entry.data.scheduleActive ? 0.05 : 0.024),
                                Color.white.opacity(entry.data.scheduleActive ? 0.03 : 0.014)
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .overlay(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(entry.data.scheduleActive ? 0.075 : 0.035),
                                Color.clear
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .mask(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.78),
                                Color.white.opacity(0.48),
                                Color.white.opacity(0.16)
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: tintWidth, height: height)

                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.clear,
                                palette.warm.opacity(entry.data.scheduleActive ? 0.11 : 0.05),
                                Color.white.opacity(entry.data.scheduleActive ? 0.08 : 0.04),
                                Color.clear
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: compact ? 22 : 28, height: height)
                    .position(x: lineX, y: height / 2)

                Path { path in
                    path.move(to: CGPoint(x: lineX, y: 0))
                    path.addLine(to: CGPoint(x: lineX, y: height))
                }
                .stroke(
                    palette.warm.opacity(entry.data.scheduleActive ? 0.36 : 0.2),
                    style: StrokeStyle(lineWidth: compact ? 0.8 : 0.95, lineCap: .round, dash: [2, 5])
                )

                Path { path in
                    path.move(to: CGPoint(x: lineX + 1.8, y: 0))
                    path.addLine(to: CGPoint(x: lineX + 1.8, y: height))
                }
                .stroke(
                    Color.white.opacity(entry.data.scheduleActive ? 0.36 : 0.2),
                    style: StrokeStyle(lineWidth: 0.7, lineCap: .round, dash: [2, 5])
                )
            }
        }
    }

    private var scheduleLineProgress: Double {
        if entry.data.scheduleActive,
           let range = scheduleTimeRange,
           let start = clockMinutes(range.start),
           let end = clockMinutes(range.end),
           end > start {
            let parts = Calendar.current.dateComponents([.hour, .minute], from: entry.date)
            let now = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
            return min(max(Double(now - start) / Double(end - start), 0), 1)
        }
        return progress
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

    private var scheduleLabel: String {
        entry.data.scheduleLabel.isEmpty ? "最近日程" : entry.data.scheduleLabel
    }

    private var progress: Double {
        min(max(entry.data.scheduleProgress, 0), 100) / 100
    }

    private func clockMinutes(_ value: String) -> Int? {
        let parts = value.split(separator: ":")
        guard parts.count == 2,
              let hour = Int(parts[0]),
              let minute = Int(parts[1]) else { return nil }
        return hour * 60 + minute
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
        8
    }

    private var dayText: String {
        YayaWidgetFormatters.dayText(from: entry.date)
    }
}

private enum YayaWidgetFormatters {
    static let locale = Locale(identifier: "zh_CN")

    static func dayText(from date: Date) -> String {
        let monthDay = date.formatted(.dateTime.locale(locale).month(.defaultDigits).day())
        let weekday = date.formatted(.dateTime.locale(locale).weekday(.wide))
        return "\(monthDay) \(weekday)"
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
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
