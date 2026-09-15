import EventKit
import Foundation

/// Converts EventKit recurrence to and from Misyra's canonical six-pattern recurrence model.
enum AppleCalendarRecurrenceMapper {
  static func canonical(
    from rule: EKRecurrenceRule,
    eventStart: Date? = nil,
    eventTimeZone: TimeZone? = nil
  ) throws -> [String: Any] {
    let pattern: [String: Any]
    let startComponents = eventStartComponents(eventStart, eventTimeZone: eventTimeZone)

    switch rule.frequency {
    case .daily:
      guard
        !hasValues(rule.daysOfTheWeek),
        !hasValues(rule.daysOfTheMonth),
        !hasValues(rule.monthsOfTheYear),
        !hasValues(rule.weeksOfTheYear),
        !hasValues(rule.daysOfTheYear),
        !hasValues(rule.setPositions)
      else {
        throw AppleCalendarRecurrenceError.unsupportedRule("daily-complex")
      }
      pattern = ["type": "daily", "interval": rule.interval]

    case .weekly:
      guard
        !hasValues(rule.daysOfTheMonth),
        !hasValues(rule.monthsOfTheYear),
        !hasValues(rule.weeksOfTheYear),
        !hasValues(rule.daysOfTheYear),
        !hasValues(rule.setPositions)
      else {
        throw AppleCalendarRecurrenceError.unsupportedRule("weekly-complex")
      }

      let recurrenceDays = rule.daysOfTheWeek ?? []
      guard recurrenceDays.allSatisfy({ $0.weekNumber == 0 }) else {
        throw AppleCalendarRecurrenceError.unsupportedRule("weekly-ordinal")
      }

      let weekdays: [Int]
      if recurrenceDays.isEmpty {
        guard let weekday = startComponents?.weekday, (1...7).contains(weekday) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("weekly-start")
        }
        weekdays = [weekday - 1]
      } else {
        weekdays = recurrenceDays.map { canonicalWeekday($0.dayOfTheWeek) }
      }
      guard Set(weekdays).count == weekdays.count else {
        throw AppleCalendarRecurrenceError.unsupportedRule("weekly-duplicate-days")
      }

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
      guard
        !hasValues(rule.monthsOfTheYear),
        !hasValues(rule.weeksOfTheYear),
        !hasValues(rule.daysOfTheYear)
      else {
        throw AppleCalendarRecurrenceError.unsupportedRule("monthly-complex")
      }

      let monthDays = rule.daysOfTheMonth ?? []
      let recurrenceDays = rule.daysOfTheWeek ?? []

      if !monthDays.isEmpty {
        guard monthDays.count == 1 else {
          throw AppleCalendarRecurrenceError.unsupportedRule("monthly-multiple-days")
        }
        guard recurrenceDays.isEmpty, !hasValues(rule.setPositions) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("monthly-combined")
        }
        let day = monthDays[0].intValue
        guard (1...31).contains(day) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("monthly-negative-day")
        }
        pattern = [
          "type": "monthly-date",
          "interval": rule.interval,
          "dayOfMonth": day,
        ]
      } else if !recurrenceDays.isEmpty {
        guard recurrenceDays.count == 1 else {
          throw AppleCalendarRecurrenceError.unsupportedRule("monthly-multiple-weekdays")
        }
        let recurrenceDay = recurrenceDays[0]
        guard let ordinal = canonicalOrdinal(rule, recurrenceDay: recurrenceDay) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("monthly-unbounded-weekday")
        }
        pattern = [
          "type": "monthly-ordinal",
          "interval": rule.interval,
          "ordinal": ordinal,
          "weekday": canonicalWeekday(recurrenceDay.dayOfTheWeek),
        ]
      } else {
        guard !hasValues(rule.setPositions) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("monthly-position-without-day")
        }
        guard let day = startComponents?.day, (1...31).contains(day) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("monthly-start")
        }
        pattern = [
          "type": "monthly-date",
          "interval": rule.interval,
          "dayOfMonth": day,
        ]
      }

    case .yearly:
      guard
        !hasValues(rule.daysOfTheMonth),
        !hasValues(rule.weeksOfTheYear),
        !hasValues(rule.daysOfTheYear)
      else {
        throw AppleCalendarRecurrenceError.unsupportedRule("yearly-complex")
      }

      let months = rule.monthsOfTheYear ?? []
      guard months.count <= 1 else {
        throw AppleCalendarRecurrenceError.unsupportedRule("yearly-multiple-months")
      }
      let recurrenceDays = rule.daysOfTheWeek ?? []
      guard recurrenceDays.count <= 1 else {
        throw AppleCalendarRecurrenceError.unsupportedRule("yearly-multiple-weekdays")
      }

      let month: Int
      if let providerMonth = months.first?.intValue {
        guard (1...12).contains(providerMonth) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("yearly-month")
        }
        month = providerMonth
      } else {
        guard let startMonth = startComponents?.month, (1...12).contains(startMonth) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("yearly-start-month")
        }
        month = startMonth
      }

      if let recurrenceDay = recurrenceDays.first {
        guard !months.isEmpty else {
          throw AppleCalendarRecurrenceError.unsupportedRule("yearly-ordinal-without-month")
        }
        guard let ordinal = canonicalOrdinal(rule, recurrenceDay: recurrenceDay) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("yearly-unbounded-weekday")
        }
        pattern = [
          "type": "yearly-ordinal",
          "interval": rule.interval,
          "month": month,
          "ordinal": ordinal,
          "weekday": canonicalWeekday(recurrenceDay.dayOfTheWeek),
        ]
      } else {
        guard !hasValues(rule.setPositions) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("yearly-position-without-day")
        }
        guard let day = startComponents?.day, (1...31).contains(day) else {
          throw AppleCalendarRecurrenceError.unsupportedRule("yearly-start-day")
        }
        pattern = [
          "type": "yearly-date",
          "interval": rule.interval,
          "month": month,
          "day": day,
        ]
      }

    @unknown default:
      throw AppleCalendarRecurrenceError.unsupportedRule("frequency")
    }

    return ["pattern": pattern, "end": canonicalEnd(rule.recurrenceEnd)]
  }

  static func eventKitRule(
    from canonical: [String: Any],
    eventStart: Date? = nil,
    eventTimeZone: TimeZone? = nil
  ) throws -> EKRecurrenceRule {
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
        Set(weekdays).count == weekdays.count,
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
      guard let day = pattern["dayOfMonth"] as? Int, (1...31).contains(day) else {
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
        isCanonicalOrdinal(ordinal),
        let weekday = pattern["weekday"] as? Int,
        (0...6).contains(weekday)
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
        (1...12).contains(month),
        let day = pattern["day"] as? Int,
        (1...31).contains(day)
      else {
        throw AppleCalendarRecurrenceError.invalidCanonical
      }

      let startComponents = eventStartComponents(eventStart, eventTimeZone: eventTimeZone)
      guard startComponents?.month == month, startComponents?.day == day else {
        throw AppleCalendarRecurrenceError.unsupportedRule("yearly-date-start-mismatch")
      }

      // Apple documents daysOfTheMonth as monthly-only. A yearly date therefore uses the
      // originating event's day together with a yearly month filter.
      return EKRecurrenceRule(
        recurrenceWith: .yearly,
        interval: interval,
        daysOfTheWeek: nil,
        daysOfTheMonth: nil,
        monthsOfTheYear: [NSNumber(value: month)],
        weeksOfTheYear: nil,
        daysOfTheYear: nil,
        setPositions: nil,
        end: end
      )

    case "yearly-ordinal":
      guard
        let month = pattern["month"] as? Int,
        (1...12).contains(month),
        let ordinal = pattern["ordinal"] as? Int,
        isCanonicalOrdinal(ordinal),
        let weekday = pattern["weekday"] as? Int,
        (0...6).contains(weekday)
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

  private static func eventStartComponents(
    _ eventStart: Date?,
    eventTimeZone: TimeZone?
  ) -> DateComponents? {
    guard let eventStart else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = eventTimeZone ?? TimeZone.autoupdatingCurrent
    return calendar.dateComponents([.month, .day, .weekday], from: eventStart)
  }

  private static func hasValues<Element>(_ values: [Element]?) -> Bool {
    !(values?.isEmpty ?? true)
  }

  private static func isCanonicalOrdinal(_ value: Int) -> Bool {
    value == -1 || (1...4).contains(value)
  }

  private static func canonicalOrdinal(
    _ rule: EKRecurrenceRule,
    recurrenceDay: EKRecurrenceDayOfWeek
  ) -> Int? {
    let ordinal: Int
    if recurrenceDay.weekNumber != 0 {
      guard !hasValues(rule.setPositions) else { return nil }
      ordinal = recurrenceDay.weekNumber
    } else {
      guard let positions = rule.setPositions, positions.count == 1 else { return nil }
      ordinal = positions[0].intValue
    }
    return isCanonicalOrdinal(ordinal) ? ordinal : nil
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
