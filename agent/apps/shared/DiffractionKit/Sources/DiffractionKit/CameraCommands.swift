import Foundation

public enum DiffractionCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum DiffractionCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum DiffractionCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum DiffractionCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct DiffractionCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: DiffractionCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: DiffractionCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: DiffractionCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: DiffractionCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct DiffractionCameraClipParams: Codable, Sendable, Equatable {
    public var facing: DiffractionCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: DiffractionCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: DiffractionCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: DiffractionCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
