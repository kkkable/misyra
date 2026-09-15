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

  func testWritePayloadContainsProviderOwnedFieldsOnly() {
    XCTAssertEqual(
      Set(AppleCalendarEventPayload.providerOwnedFieldNames),
      Set(["title", "schedule", "recurrence", "location", "providerNotes"])
    )
  }
}
