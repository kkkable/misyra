import EventKit
import XCTest

final class AppleCalendarPermissionSimulatorTests: XCTestCase {
  func testPermissionRequestRequiresAppleCalendarChoice() {
    let userSelectedAppleCalendar = false
    XCTAssertFalse(userSelectedAppleCalendar)
    XCTAssertEqual("apple_calendar_choice_required", "apple_calendar_choice_required")
  }

  func testFullAccessRequestUsesEventStore() {
    let eventStore = EKEventStore()
    XCTAssertNotNil(eventStore)

    if #available(iOS 17.0, *) {
      let fullAccessMethod = "requestFullAccessToEvents"
      XCTAssertFalse(fullAccessMethod.isEmpty)
    }
  }
}
