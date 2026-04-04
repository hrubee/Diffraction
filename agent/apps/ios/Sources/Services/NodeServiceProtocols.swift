import CoreLocation
import Foundation
import DiffractionKit
import UIKit

typealias DiffractionCameraSnapResult = (format: String, base64: String, width: Int, height: Int)
typealias DiffractionCameraClipResult = (format: String, base64: String, durationMs: Int, hasAudio: Bool)

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: DiffractionCameraSnapParams) async throws -> DiffractionCameraSnapResult
    func clip(params: DiffractionCameraClipParams) async throws -> DiffractionCameraClipResult
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: DiffractionLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: DiffractionLocationGetParams,
        desiredAccuracy: DiffractionLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: DiffractionLocationAccuracy,
        significantChangesOnly: Bool) -> AsyncStream<CLLocation>
    func stopLocationUpdates()
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

@MainActor
protocol DeviceStatusServicing: Sendable {
    func status() async throws -> DiffractionDeviceStatusPayload
    func info() -> DiffractionDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: DiffractionPhotosLatestParams) async throws -> DiffractionPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: DiffractionContactsSearchParams) async throws -> DiffractionContactsSearchPayload
    func add(params: DiffractionContactsAddParams) async throws -> DiffractionContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: DiffractionCalendarEventsParams) async throws -> DiffractionCalendarEventsPayload
    func add(params: DiffractionCalendarAddParams) async throws -> DiffractionCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: DiffractionRemindersListParams) async throws -> DiffractionRemindersListPayload
    func add(params: DiffractionRemindersAddParams) async throws -> DiffractionRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: DiffractionMotionActivityParams) async throws -> DiffractionMotionActivityPayload
    func pedometer(params: DiffractionPedometerParams) async throws -> DiffractionPedometerPayload
}

struct WatchMessagingStatus: Sendable, Equatable {
    var supported: Bool
    var paired: Bool
    var appInstalled: Bool
    var reachable: Bool
    var activationState: String
}

struct WatchQuickReplyEvent: Sendable, Equatable {
    var replyId: String
    var promptId: String
    var actionId: String
    var actionLabel: String?
    var sessionKey: String?
    var note: String?
    var sentAtMs: Int?
    var transport: String
}

struct WatchNotificationSendResult: Sendable, Equatable {
    var deliveredImmediately: Bool
    var queuedForDelivery: Bool
    var transport: String
}

protocol WatchMessagingServicing: AnyObject, Sendable {
    func status() async -> WatchMessagingStatus
    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?)
    func sendNotification(
        id: String,
        params: DiffractionWatchNotifyParams) async throws -> WatchNotificationSendResult
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
