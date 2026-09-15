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
