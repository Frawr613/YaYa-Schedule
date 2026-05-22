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
    let updatedAt: Double

    static let empty = YayaWidgetData(
        ddlTitle: "暂无 DDL",
        ddlTime: "打开鸦鸦日程同步",
        scheduleTitle: "暂无课程或日程",
        scheduleTime: "打开鸦鸦日程同步",
        schedulePlace: "",
        scheduleLabel: "最近日程",
        scheduleProgress: 0,
        scheduleActive: false,
        updatedAt: 0
    )

    var isFresh: Bool {
        guard updatedAt > 0 else { return false }
        return Date().timeIntervalSince1970 - updatedAt < 60 * 60 * 12
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
        VStack(alignment: .leading, spacing: spacing) {
            header
            if family == .systemMedium {
                HStack(spacing: 10) {
                    summaryCard(
                        label: "DDL",
                        title: entry.data.ddlTitle,
                        detail: entry.data.ddlTime,
                        tint: Color(red: 0.92, green: 0.96, blue: 1.0),
                        accent: Color(red: 0.35, green: 0.52, blue: 0.96)
                    )
                    summaryCard(
                        label: scheduleLabel,
                        title: entry.data.scheduleTitle,
                        detail: scheduleDetail,
                        tint: Color(red: 0.88, green: 0.98, blue: 0.98),
                        accent: Color(red: 0.16, green: 0.68, blue: 0.72)
                    )
                }
            } else {
                summaryCard(
                    label: "DDL",
                    title: entry.data.ddlTitle,
                    detail: entry.data.ddlTime,
                    tint: Color(red: 0.92, green: 0.96, blue: 1.0),
                    accent: Color(red: 0.35, green: 0.52, blue: 0.96)
                )
                summaryCard(
                    label: scheduleLabel,
                    title: entry.data.scheduleTitle,
                    detail: scheduleDetail,
                    tint: Color(red: 0.88, green: 0.98, blue: 0.98),
                    accent: Color(red: 0.16, green: 0.68, blue: 0.72)
                )
            }
            if family != .systemSmall {
                footer
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            ZStack {
                Circle().fill(Color.white.opacity(0.34))
                Circle()
                    .fill(entry.data.isFresh ? Color(red: 0.21, green: 0.78, blue: 0.68) : Color.white.opacity(0.52))
                    .frame(width: 7, height: 7)
            }
            .frame(width: 18, height: 18)

            VStack(alignment: .leading, spacing: 0) {
                Text("鸦鸦日程")
                    .font(.system(size: family == .systemSmall ? 15 : 17, weight: .black, design: .rounded))
                    .foregroundColor(Color(red: 0.06, green: 0.09, blue: 0.15))
                    .lineLimit(1)
                if family != .systemSmall {
                    Text(dayText)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(Color(red: 0.13, green: 0.18, blue: 0.29).opacity(0.68))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if entry.data.scheduleActive {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.34))
                        Capsule()
                            .fill(LinearGradient(
                                colors: [Color(red: 0.32, green: 0.50, blue: 0.95), Color(red: 0.11, green: 0.70, blue: 0.72)],
                                startPoint: .leading,
                                endPoint: .trailing
                            ))
                            .frame(width: proxy.size.width * CGFloat(progress))
                    }
                }
                .frame(height: 7)
            }
            Text(entry.data.isFresh ? "本地缓存已同步" : "打开 App 同步最新日程")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(red: 0.10, green: 0.14, blue: 0.24).opacity(0.7))
                .lineLimit(1)
        }
    }

    private func summaryCard(label: String, title: String, detail: String, tint: Color, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 4 : 6) {
            HStack(spacing: 6) {
                Capsule()
                    .fill(accent)
                    .frame(width: 5, height: 16)
                Text(label)
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .foregroundColor(Color(red: 0.08, green: 0.12, blue: 0.20))
                    .lineLimit(1)
            }
            Text(title.isEmpty ? "暂无内容" : title)
                .font(.system(size: family == .systemSmall ? 14 : 16, weight: .black, design: .rounded))
                .foregroundColor(Color(red: 0.05, green: 0.07, blue: 0.12))
                .lineLimit(1)
            Text(detail.isEmpty ? "打开鸦鸦日程同步" : detail)
                .font(.system(size: family == .systemSmall ? 11 : 12, weight: .semibold, design: .rounded))
                .foregroundColor(Color(red: 0.15, green: 0.20, blue: 0.31).opacity(0.72))
                .lineLimit(1)
        }
        .padding(family == .systemSmall ? 9 : 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(tint.opacity(0.62))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.white.opacity(0.72), lineWidth: 1)
                )
                .shadow(color: Color(red: 0.16, green: 0.30, blue: 0.55).opacity(0.12), radius: 12, x: 0, y: 8)
        )
    }

    private var widgetBackground: some View {
        LinearGradient(
            colors: [
                Color(red: 0.92, green: 0.96, blue: 1.0),
                Color(red: 0.78, green: 0.88, blue: 0.98),
                Color(red: 0.70, green: 0.84, blue: 0.94)
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
                .fill(Color(red: 0.19, green: 0.50, blue: 0.96).opacity(0.16))
                .blur(radius: 28)
                .offset(x: 56, y: 48)
        }
    }

    private var scheduleLabel: String {
        entry.data.scheduleLabel.isEmpty ? "最近日程" : entry.data.scheduleLabel
    }

    private var scheduleDetail: String {
        [entry.data.scheduleTime, entry.data.schedulePlace]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
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
        .description("显示最近 DDL、当前课程或日程，并跟随 App 的本地缓存刷新。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
