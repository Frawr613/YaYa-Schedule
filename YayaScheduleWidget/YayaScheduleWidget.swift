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
        content
            .padding(family == .systemSmall ? 12 : 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .yayaWidgetBackground(widgetBackground)
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 8 : 10) {
            if family == .systemMedium {
                HStack(spacing: 10) {
                    widgetSection(label: "DDL", title: entry.data.ddlTitle, detail: entry.data.ddlTime, warm: true)
                    widgetSection(
                        label: entry.data.scheduleLabel.isEmpty ? "最近日程" : entry.data.scheduleLabel,
                        title: entry.data.scheduleTitle,
                        detail: scheduleDetail,
                        warm: false
                    )
                }
            } else {
                widgetSection(label: "DDL", title: entry.data.ddlTitle, detail: entry.data.ddlTime, warm: true)
                widgetSection(
                    label: entry.data.scheduleLabel.isEmpty ? "最近日程" : entry.data.scheduleLabel,
                    title: entry.data.scheduleTitle,
                    detail: scheduleDetail,
                    warm: false
                )
            }
            if entry.data.scheduleActive {
                ProgressView(value: min(max(entry.data.scheduleProgress, 0), 100), total: 100)
                    .tint(Color.white)
                    .scaleEffect(x: 1, y: 0.65, anchor: .center)
            }
        }
    }

    private var widgetBackground: some View {
        LinearGradient(
            colors: [
                Color(red: 0.22, green: 0.42, blue: 0.95),
                Color(red: 0.42, green: 0.28, blue: 0.82),
                Color(red: 0.07, green: 0.64, blue: 0.56)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var scheduleDetail: String {
        [entry.data.scheduleTime, entry.data.schedulePlace]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private func widgetSection(label: String, title: String, detail: String, warm: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .foregroundColor(.white)
                .background(warm ? Color.orange.opacity(0.82) : Color.white.opacity(0.2))
                .clipShape(Capsule())
            Text(title.isEmpty ? "暂无内容" : title)
                .font(.headline.weight(.bold))
                .lineLimit(1)
                .foregroundColor(.white)
            Text(detail.isEmpty ? "打开鸦鸦日程同步" : detail)
                .font(.caption)
                .lineLimit(1)
                .foregroundColor(.white.opacity(0.82))
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.16))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
        .description("显示最近 DDL 和最近课程/日程。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
