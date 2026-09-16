import EventKit
import ExpoModulesCore
import Foundation

private enum AppleCalendarNativeError: String, LocalizedError {
  case appleCalendarChoiceRequired = "apple_calendar_choice_required"
  case calendarNotFound = "calendar_not_found"
  case eventNotFound = "event_not_found"
  case noWritableCalendarSource = "no_writable_calendar_source"
  case unsupportedRecurrenceScope = "unsupported_recurrence_scope"

  var errorDescription: String? { rawValue }
}

public final class AppleCalendarModule: Module {
  private let eventStore = EKEventStore()
  private var eventStoreObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AppleCalendar")
    Events("onStoreChanged")

    OnStartObserving("onStoreChanged") {
      guard self.eventStoreObserver == nil else { return }
      self.eventStoreObserver = NotificationCenter.default.addObserver(
        forName: .EKEventStoreChanged,
        object: self.eventStore,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onStoreChanged", ["changed": true])
      }
    }

    OnStopObserving("onStoreChanged") {
      if let observer = self.eventStoreObserver {
        NotificationCenter.default.removeObserver(observer)
        self.eventStoreObserver = nil
      }
    }

    OnDestroy {
      if let observer = self.eventStoreObserver {
        NotificationCenter.default.removeObserver(observer)
        self.eventStoreObserver = nil
      }
    }

    AsyncFunction("getAuthorizationStatus") { () -> String in
      self.authorizationStatus()
    }

    AsyncFunction("requestFullAccess") { (userSelectedAppleCalendar: Bool) async throws -> Bool in
      guard userSelectedAppleCalendar else {
        throw AppleCalendarNativeError.appleCalendarChoiceRequired
      }

      if #available(iOS 17.0, *) {
        return try await self.eventStore.requestFullAccessToEvents()
      }

      return try await withCheckedThrowingContinuation { continuation in
        self.eventStore.requestAccess(to: .event) { granted, error in
          if let error {
            continuation.resume(throwing: error)
          } else {
            continuation.resume(returning: granted)
          }
        }
      }
    }

    AsyncFunction("listCalendars") { () -> [[String: Any]] in
      self.eventStore.calendars(for: .event).map(self.calendarDictionary)
    }

    AsyncFunction("createDedicatedCalendar") { (title: String) throws -> [String: Any] in
      let calendar = EKCalendar(for: .event, eventStore: self.eventStore)
      calendar.title = title
      calendar.source = self.eventStore.defaultCalendarForNewEvents?.source
        ?? self.eventStore.sources.first(where: { $0.sourceType == .local })
        ?? self.eventStore.sources.first

      guard calendar.source != nil else {
        throw AppleCalendarNativeError.noWritableCalendarSource
      }

      try self.eventStore.saveCalendar(calendar, commit: true)
      return self.calendarDictionary(calendar)
    }

    AsyncFunction("fetchEvents") {
      (calendarIdentifier: String, startDate: String, endDate: String) throws -> [[String: Any?]] in
      guard let calendar = self.eventStore.calendar(withIdentifier: calendarIdentifier) else {
        throw AppleCalendarNativeError.calendarNotFound
      }
      let start = try AppleCalendarDateCodec.instant(startDate)
      let end = try AppleCalendarDateCodec.instant(endDate)
      let predicate = self.eventStore.predicateForEvents(
        withStart: start,
        end: end,
        calendars: [calendar]
      )
      return try self.eventStore.events(matching: predicate).map(self.eventDictionary)
    }

    AsyncFunction("createEvent") {
      (calendarIdentifier: String, payload: [String: Any]) throws -> [String: Any?] in
      guard let calendar = self.eventStore.calendar(withIdentifier: calendarIdentifier) else {
        throw AppleCalendarNativeError.calendarNotFound
      }

      let event = EKEvent(eventStore: self.eventStore)
      event.calendar = calendar
      try AppleCalendarEventPayload.apply(payload, to: event)
      try self.eventStore.save(event, span: .thisEvent, commit: true)
      return try self.eventDictionary(event)
    }

    AsyncFunction("updateEvent") {
      (
        eventIdentifier: String,
        payload: [String: Any],
        recurrenceScope: String?
      ) throws -> [String: Any?] in
      guard let event = self.eventStore.event(withIdentifier: eventIdentifier) else {
        throw AppleCalendarNativeError.eventNotFound
      }

      try AppleCalendarEventPayload.apply(payload, to: event)
      try self.eventStore.save(
        event,
        span: try self.eventSpan(recurrenceScope),
        commit: true
      )
      return try self.eventDictionary(event)
    }

    AsyncFunction("deleteEvent") {
      (eventIdentifier: String, recurrenceScope: String?) throws in
      guard let event = self.eventStore.event(withIdentifier: eventIdentifier) else {
        return
      }
      try self.eventStore.remove(
        event,
        span: try self.eventSpan(recurrenceScope),
        commit: true
      )
    }
  }

  private func eventSpan(_ recurrenceScope: String?) throws -> EKSpan {
    switch recurrenceScope {
    case nil, "this_occurrence":
      return .thisEvent
    case "this_and_future", "entire_series":
      return .futureEvents
    default:
      throw AppleCalendarNativeError.unsupportedRecurrenceScope
    }
  }

  private func authorizationStatus() -> String {
    let status = EKEventStore.authorizationStatus(for: .event)
    if #available(iOS 17.0, *) {
      switch status {
      case .notDetermined: return "not_determined"
      case .restricted: return "restricted"
      case .denied: return "denied"
      case .writeOnly: return "write_only"
      case .fullAccess, .authorized: return "full_access"
      @unknown default: return "denied"
      }
    }

    switch status {
    case .notDetermined: return "not_determined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorized: return "full_access"
    default: return "denied"
    }
  }

  private func calendarDictionary(_ calendar: EKCalendar) -> [String: Any] {
    [
      "calendarIdentifier": calendar.calendarIdentifier,
      "title": calendar.title,
      "allowsContentModifications": calendar.allowsContentModifications,
    ]
  }

  private func eventDictionary(_ event: EKEvent) throws -> [String: Any?] {
    let recurrence = try event.recurrenceRules?.first.map {
      try AppleCalendarRecurrenceMapper.canonical(
        from: $0,
        eventStart: event.startDate,
        eventTimeZone: event.timeZone
      )
    }
    return [
      "eventIdentifier": event.eventIdentifier,
      "calendarIdentifier": event.calendar.calendarIdentifier,
      "title": event.title,
      "startDate": AppleCalendarDateCodec.instantString(event.startDate),
      "endDate": AppleCalendarDateCodec.instantString(event.endDate),
      "isAllDay": event.isAllDay,
      "timeZone": event.timeZone?.identifier,
      "location": event.location,
      "providerNotes": event.notes,
      "recurrence": recurrence,
    ]
  }
}
