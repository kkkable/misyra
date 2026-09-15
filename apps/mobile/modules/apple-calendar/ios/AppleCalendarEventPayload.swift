import EventKit
import Foundation

/// Provider-owned EventKit write boundary. App-owned mission state is intentionally absent.
enum AppleCalendarEventPayload {
  static let providerOwnedFieldNames = [
    "title",
    "schedule",
    "recurrence",
    "location",
    "providerNotes",
  ]

  static func apply(
    _ payload: [String: Any],
    to event: EKEvent,
    recurrenceMapper: AppleCalendarRecurrenceMapper.Type = AppleCalendarRecurrenceMapper.self
  ) throws {
    guard let title = payload["title"] as? String else {
      throw AppleCalendarPayloadError.invalidField("title")
    }
    guard let schedule = payload["schedule"] as? [String: Any] else {
      throw AppleCalendarPayloadError.invalidField("schedule")
    }

    event.title = title
    event.location = payload["location"] as? String
    event.notes = payload["providerNotes"] as? String
    try applySchedule(schedule, to: event)

    if let canonical = payload["recurrence"] as? [String: Any] {
      event.recurrenceRules = [
        try recurrenceMapper.eventKitRule(
          from: canonical,
          eventStart: event.startDate,
          eventTimeZone: event.timeZone
        )
      ]
    } else {
      event.recurrenceRules = nil
    }
  }

  private static func applySchedule(_ schedule: [String: Any], to event: EKEvent) throws {
    guard let type = schedule["type"] as? String else {
      throw AppleCalendarPayloadError.invalidField("schedule.type")
    }

    switch type {
    case "timed":
      guard
        let startText = schedule["startInstant"] as? String,
        let finishText = schedule["finishInstant"] as? String,
        let start = AppleCalendarDateCodec.instant(startText),
        let finish = AppleCalendarDateCodec.instant(finishText),
        finish > start
      else {
        throw AppleCalendarPayloadError.invalidField("schedule")
      }
      guard
        let zoneName = schedule["timeZone"] as? String,
        let zone = TimeZone(identifier: zoneName)
      else {
        throw AppleCalendarPayloadError.invalidField("schedule.timeZone")
      }
      event.isAllDay = false
      event.startDate = start
      event.endDate = finish
      event.timeZone = zone

    case "all_day":
      guard
        let startText = schedule["startLocalDate"] as? String,
        let endText = schedule["endLocalDateExclusive"] as? String,
        let zoneName = schedule["timeZone"] as? String,
        let zone = TimeZone(identifier: zoneName),
        let start = AppleCalendarDateCodec.localDate(startText, timeZone: zone),
        let finish = AppleCalendarDateCodec.localDate(endText, timeZone: zone),
        finish > start
      else {
        throw AppleCalendarPayloadError.invalidField("schedule")
      }
      event.isAllDay = true
      event.startDate = start
      event.endDate = finish
      event.timeZone = zone

    default:
      throw AppleCalendarPayloadError.invalidField("schedule.type")
    }
  }
}

enum AppleCalendarPayloadError: LocalizedError {
  case invalidField(String)

  var errorDescription: String? {
    switch self {
    case .invalidField(let field):
      return "Invalid Apple Calendar provider field: \(field)"
    }
  }
}

enum AppleCalendarDateCodec {
  private static let instantFormatter = ISO8601DateFormatter()

  static func instant(_ value: String) -> Date? {
    instantFormatter.date(from: value)
  }

  static func instantString(_ value: Date) -> String {
    instantFormatter.string(from: value)
  }

  static func localDate(_ value: String, timeZone: TimeZone) -> Date? {
    let parts = value.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }
}
