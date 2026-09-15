import EventKit
import Foundation

/// Converts EventKit recurrence to and from Misyra's canonical six-pattern recurrence model.
enum AppleCalendarRecurrenceMapper {
  static func canonical(from rule: EKRecurrenceRule) throws -> [String: Any] {
    let pattern: [String: Any]

    switch rule.frequency {
    case .daily:
      pattern = ["type": "daily", "interval": rule.interval]

    case .weekly:
      let weekdays = (rule.daysOfTheWeek ?? []).map { canonicalWeekday($0.dayOfTheWeek) }
      let defaultWeekStartsOn = normalizedPhoneRegionWeekStart()
      let firstDay = canonicalWeekStart(
        firstDayOfTheWeek: rule.firstDayOfTheWeek,
        defaultWeekStartsOn: defaultWeekStartsOn
      )
      pattern = [
        "type": "weekly",
        "interval": rule.interval,
        "weekdays": weekdays,
        "weekStartsOn": firstDay,
      ]

    case .monthly:
      if let day = rule.daysOfTheMonth?.first?.intValue, day > 0 {
        pattern = [
          "type": "monthly-date",
          "interval": rule.interval,
          "dayOfMonth": day,
        ]
      } else if let recurrenceDay = rule.daysOfTheWeek?.first {
        pattern = [
          "type": "monthly-ordinal",
          "interval": rule.interval,
          "ordinal": canonicalOrdinal(rule, recurrenceDay: recurrenceDay),
          "weekday": canonicalWeekday(recurrenceDay.dayOfTheWeek),
        ]
      } else {
        throw AppleCalendarRecurrenceError.unsupportedRule("monthly")
      }

    case .yearly:
      guard let month = rule.monthsOfTheYear?.first?.intValue else {
        throw AppleCalendarRecurrenceError.unsupportedRule("yearly-month")
      }
      if let day = rule.daysOfTheMonth?.first?.intValue, day > 0 {
        pattern = [
          "type": "yearly-date",
          "interval": rule.interval,
          "month": month,
          "day": day,
        ]
      } else if let recurrenceDay = rule.daysOfTheWeek?.first {
        pattern = [
          "type": "yearly-ordinal",
          "interval": rule.interval,
          "month": month,
          "ordinal": canonicalOrdinal(rule, recurrenceDay: recurrenceDay),
          "weekday": canonicalWeekday(recurrenceDay.dayOfTheWeek),
        ]
      } else {
        throw AppleCalendarRecurrenceError.unsupportedRule("yearly")
      }

    @unknown default:
      throw AppleCalendarRecurrenceError.unsupportedRule("frequency")
    }

    return ["pattern": pattern, "end": canonicalEnd(rule.recurrenceEnd)]
  }

  static func eventKitRule(from canonical: [String: Any]) throws -> EKRecurrenceRule {
    guard
      let pattern = canonical["pattern"] as? [String: Any],
      let type = pattern["type"] as? String,
      let interval = pattern["interval"] as? Int,
      interval > 0
    else {
      throw AppleCalendarRecurrenceError.invalidCanonical
    }

    let end = try eventKitEnd(from: canonical["end"] as? [String: Any])

    switch type {
    case "daily":
      return EKRecurrenceRule(recurrenceWith: .daily, interval: interval, end: end)

    case "weekly":
      guard
        let weekdays = pattern["weekdays"] as? [Int],
        !weekdays.isEmpty,
        weekdays.allSatisfy({ (0...6).contains($0) }),
        let weekStartsOn = pattern["weekStartsOn"] as? Int,
        (0...6).contains(weekStartsOn)
      else {
        throw AppleCalendarRecurrenceError.invalidCanonical
      }

      // EventKit exposes firstDayOfTheWeek as read-only, so it cannot encode Misyra's
      // explicit every-N-weeks phase when N > 1 without risking a semantic shift.
      if interval > 1 {
        throw AppleCalendarRecurrenceError.unsupportedWeekStart
      }

      return EKRecurrenceRule(
        recurrenceWith: .weekly,
        interval: interval,
        daysOfTheWeek: weekdays.map { EKRecurrenceDayOfWeek(dayOfTheWeek: eventKitWeekday($0)) },
        daysOfTheMonth: nil,
        monthsOfTheYear: nil,
        weeksOfTheYear: nil,
        daysOfTheYear: nil,
        setPositions: nil,
        end: end
      )

    case "monthly-date":
      guard let day = pattern["dayOfMonth"] as? Int else {
        throw AppleCalendarRecurrenceError.invalidCanonical
      }
      return EKRecurrenceRule(
        recurrenceWith: .monthly,
        interval: interval,
        daysOfTheWeek: nil,
        daysOfTheMonth: [NSNumber(value: day)],
        monthsOfTheYear: nil,
        weeksOfTheYear: nil,
        daysOfTheYear: nil,
        setPositions: nil,
        end: end
      )

    case "monthly-ordinal":
      guard
        let ordinal = pattern["ordinal"] as? Int,
        let weekday = pattern["weekday"] as? Int
      else {
        throw AppleCalendarRecurrenceError.invalidCanonical
      }
      return ordinalRule(
        frequency: .monthly,
        interval: interval,
        month: nil,
        ordinal: ordinal,
        weekday: weekday,
        end: end
      )

    case "yearly-date":
      guard
        let month = pattern["month"] as? Int,
        let day = pattern["day"] as? Int
      else {
        throw AppleCalendarRecurrenceError.invalidCanonical
      }
      return EKRecurrenceRule(
        recurrenceWith: .yearly,
        interval: interval,
        daysOfTheWeek: nil,
        daysOfTheMonth: [NSNumber(value: day)],
        monthsOfTheYear: [NSNumber(value: month)],
        weeksOfTheYear: nil,
        daysOfTheYear: nil,
        setPositions: nil,
        end: end
      )

    case "yearly-ordinal":
      guard
        let month = pattern["month"] as? Int,
        let ordinal = pattern["ordinal"] as? Int,
        let weekday = pattern["weekday"] as? Int
      else {
        throw AppleCalendarRecurrenceError.invalidCanonical
      }
      return ordinalRule(
        frequency: .yearly,
        interval: interval,
        month: month,
        ordinal: ordinal,
        weekday: weekday,
        end: end
      )

    default:
      throw AppleCalendarRecurrenceError.unsupportedRule(type)
    }
  }

  static func canonicalWeekStart(firstDayOfTheWeek: Int, defaultWeekStartsOn: Int) -> Int {
    guard firstDayOfTheWeek != 0 else { return defaultWeekStartsOn }
    let canonical = firstDayOfTheWeek - 1
    return (0...6).contains(canonical) ? canonical : defaultWeekStartsOn
  }

  private static func normalizedPhoneRegionWeekStart() -> Int {
    let canonical = Calendar.autoupdatingCurrent.firstWeekday - 1
    return (0...6).contains(canonical) ? canonical : 1
  }

  private static func ordinalRule(
    frequency: EKRecurrenceFrequency,
    interval: Int,
    month: Int?,
    ordinal: Int,
    weekday: Int,
    end: EKRecurrenceEnd?
  ) -> EKRecurrenceRule {
    EKRecurrenceRule(
      recurrenceWith: frequency,
      interval: interval,
      daysOfTheWeek: [
        EKRecurrenceDayOfWeek(
          dayOfTheWeek: eventKitWeekday(weekday),
          weekNumber: ordinal
        )
      ],
      daysOfTheMonth: nil,
      monthsOfTheYear: month.map { [NSNumber(value: $0)] },
      weeksOfTheYear: nil,
      daysOfTheYear: nil,
      setPositions: nil,
      end: end
    )
  }

  private static func canonicalEnd(_ end: EKRecurrenceEnd?) -> [String: Any] {
    guard let end else { return ["type": "never"] }
    if let endDate = end.endDate {
      return [
        "type": "date",
        "inclusiveLocalDate": AppleCalendarRecurrenceDateCodec.localDateString(endDate),
      ]
    }
    if end.occurrenceCount > 0 {
      return ["type": "count", "occurrenceCount": end.occurrenceCount]
    }
    return ["type": "never"]
  }

  private static func eventKitEnd(from end: [String: Any]?) throws -> EKRecurrenceEnd? {
    guard let end, let type = end["type"] as? String else { return nil }
    switch type {
    case "never":
      return nil
    case "count":
      guard let count = end["occurrenceCount"] as? Int, count > 0 else {
        throw AppleCalendarRecurrenceError.invalidCanonical
      }
      return EKRecurrenceEnd(occurrenceCount: count)
    case "date":
      guard
        let text = end["inclusiveLocalDate"] as? String,
        let date = AppleCalendarRecurrenceDateCodec.localDate(text)
      else {
        throw AppleCalendarRecurrenceError.invalidCanonical
      }
      return EKRecurrenceEnd(end: date)
    default:
      throw AppleCalendarRecurrenceError.invalidCanonical
    }
  }

  private static func canonicalOrdinal(
    _ rule: EKRecurrenceRule,
    recurrenceDay: EKRecurrenceDayOfWeek
  ) -> Int {
    if recurrenceDay.weekNumber != 0 { return recurrenceDay.weekNumber }
    return rule.setPositions?.first?.intValue ?? 1
  }

  private static func canonicalWeekday(_ value: EKWeekday) -> Int {
    max(0, value.rawValue - 1)
  }

  private static func eventKitWeekday(_ value: Int) -> EKWeekday {
    EKWeekday(rawValue: value + 1) ?? .sunday
  }
}

enum AppleCalendarRecurrenceError: LocalizedError {
  case invalidCanonical
  case unsupportedRule(String)
  case unsupportedWeekStart

  var errorDescription: String? {
    switch self {
    case .invalidCanonical:
      return "Invalid canonical recurrence"
    case .unsupportedRule(let rule):
      return "Unsupported EventKit recurrence: \(rule)"
    case .unsupportedWeekStart:
      return "unsupported_week_start"
    }
  }
}

private enum AppleCalendarRecurrenceDateCodec {
  static func localDateString(_ value: Date) -> String {
    let calendar = Calendar(identifier: .gregorian)
    let components = calendar.dateComponents([.year, .month, .day], from: value)
    return String(
      format: "%04d-%02d-%02d",
      components.year ?? 1970,
      components.month ?? 1,
      components.day ?? 1
    )
  }

  static func localDate(_ value: String) -> Date? {
    let parts = value.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }
}
