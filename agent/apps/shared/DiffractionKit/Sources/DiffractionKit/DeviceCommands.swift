import Foundation

public enum DiffractionDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum DiffractionBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum DiffractionThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum DiffractionNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum DiffractionNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct DiffractionBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: DiffractionBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: DiffractionBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct DiffractionThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: DiffractionThermalState

    public init(state: DiffractionThermalState) {
        self.state = state
    }
}

public struct DiffractionStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct DiffractionNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: DiffractionNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [DiffractionNetworkInterfaceType]

    public init(
        status: DiffractionNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [DiffractionNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct DiffractionDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: DiffractionBatteryStatusPayload
    public var thermal: DiffractionThermalStatusPayload
    public var storage: DiffractionStorageStatusPayload
    public var network: DiffractionNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: DiffractionBatteryStatusPayload,
        thermal: DiffractionThermalStatusPayload,
        storage: DiffractionStorageStatusPayload,
        network: DiffractionNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct DiffractionDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
