import EventKit
import XCTest

final class AppleCalendarNativeTests: XCTestCase {
  func testRecurrenceFixturesMapToCanonicalRules() throws {
    let rules = [
      EKRecurrenceRule(recurrenceWith: .daily, interval: 1, end: nil),
      EKRecurrenceRule(
        recurrenceWith: .monthly,
        interval: 1,
        daysOfTheWeek: nil,
        daysOfTheMonth: [15],
        monthsOfTheYear: nil,
        weeksOfTheYear: nil,
        daysOfTheYear: nil,
        setPositions: nil,
        end: nil
      ),
    ]

    let types = try rules.map {
      let canonical = try AppleCalendarRecurrenceMapper.canonical(from: $0)
      return (canonical["pattern"] as? [String: Any])?["type"] as? String
    }

    XCTAssertEqual(types, ["daily", "monthly-date"])
  }

  func testBasicProviderRecurrenceUsesEventStartContext() throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let start = calendar.date(from: DateComponents(year: 2026, month: 9, day: 15))!

    let weekly = try AppleCalendarRecurrenceMapper.canonical(
      from: EKRecurrenceRule(recurrenceWith: .weekly, interval: 1, end: nil),
      eventStart: start,
      eventTimeZone: calendar.timeZone
    )
    let monthly = try AppleCalendarRecurrenceMapper.canonical(
      from: EKRecurrenceRule(recurrenceWith: .monthly, interval: 1, end: nil),
      eventStart: start,
      eventTimeZone: calendar.timeZone
    )
    let yearly = try AppleCalendarRecurrenceMapper.canonical(
      from: EKRecurrenceRule(recurrenceWith: .yearly, interval: 1, end: nil),
      eventStart: start,
      eventTimeZone: calendar.timeZone
    )

    XCTAssertEqual(
      (weekly["pattern"] as? [String: Any])?["weekdays"] as? [Int],
      [2]
    )
    XCTAssertEqual(
      (monthly["pattern"] as? [String: Any])?["dayOfMonth"] as? Int,
      15
    )
    XCTAssertEqual((yearly["pattern"] as? [String: Any])?["month"] as? Int, 9)
    XCTAssertEqual((yearly["pattern"] as? [String: Any])?["day"] as? Int, 15)
  }

  func testRejectsLossyProviderRecurrenceInsteadOfTakingFirstValue() {
    let rule = EKRecurrenceRule(
      recurrenceWith: .monthly,
      interval: 1,
      daysOfTheWeek: nil,
      daysOfTheMonth: [1, 15],
      monthsOfTheYear: nil,
      weeksOfTheYear: nil,
      daysOfTheYear: nil,
      setPositions: nil,
      end: nil
    )

    XCTAssertThrowsError(try AppleCalendarRecurrenceMapper.canonical(from: rule))
  }

  func testYearlyDateUsesEventStartDayInsteadOfInvalidYearlyMonthDayFilter() throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let start = calendar.date(from: DateComponents(year: 2026, month: 9, day: 15))!
    let canonical: [String: Any] = [
      "pattern": [
        "type": "yearly-date",
        "interval": 1,
        "month": 9,
        "day": 15,
      ] as [String: Any],
      "end": ["type": "never"] as [String: Any],
    ]

    let rule = try AppleCalendarRecurrenceMapper.eventKitRule(
      from: canonical,
      eventStart: start,
      eventTimeZone: calendar.timeZone
    )

    XCTAssertEqual(rule.monthsOfTheYear, [9])
    XCTAssertNil(rule.daysOfTheMonth)
  }

  func testUnsetProviderWeekStartUsesPhoneRegionFallback() {
    XCTAssertEqual(
      AppleCalendarRecurrenceMapper.canonicalWeekStart(
        firstDayOfTheWeek: 0,
        defaultWeekStartsOn: 1
      ),
      1
    )
    XCTAssertEqual(
      AppleCalendarRecurrenceMapper.canonicalWeekStart(
        firstDayOfTheWeek: 7,
        defaultWeekStartsOn: 1
      ),
      6
    )
  }

  func testRejectsLossyWeeklyWeekStartMapping() {
    let canonical: [String: Any] = [
      "pattern": [
        "type": "weekly",
        "interval": 2,
        "weekdays": [1, 3],
        "weekStartsOn": 1,
      ] as [String: Any],
      "end": ["type": "never"] as [String: Any],
    ]

    XCTAssertThrowsError(try AppleCalendarRecurrenceMapper.eventKitRule(from: canonical)) { error in
      XCTAssertEqual(
        (error as? AppleCalendarRecurrenceError)?.errorDescription,
        "unsupported_week_start"
      )
    }
  }

  func testWritePayloadContainsProviderOwnedFieldsOnly() {
    XCTAssertEqual(
      Set(AppleCalendarEventPayload.providerOwnedFieldNames),
      Set(["title", "schedule", "recurrence", "location", "providerNotes"])
    )
  }
}
